import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiHeadphones,
  FiMic,
  FiRefreshCw,
  FiShield,
  FiSquare,
} from "react-icons/fi";
import SERVER_URL from "../../config/api";
import { digitsToValue } from "../../acoustic/fsk";
import { buildProofMessage, submitProof } from "../../acoustic/proofTransport";
import { useCheckInAudio } from "../../acoustic/useCheckInAudio";
import { signDeviceMessage } from "../../utils/deviceKey";
import AppShell from "../../ui/AppShell";
import Badge from "../../ui/Badge";
import Button from "../../ui/Button";
import Card from "../../ui/Card";
import EmptyState from "../../ui/EmptyState";
import Field from "../../ui/Field";
import { PageLoader } from "../../ui/Spinner";
import { useToast } from "../../ui/Toast";
import {
  EVIDENCE_TTL_HOURS,
  evidenceFromResponse,
  formatCountdown,
  formatTime,
  isDecodedKey,
  joinBlockReason,
  keyRemainingMs,
  roomLabel,
  selectSession,
  sessionLabel,
  sessionPhase,
  sessionTitle,
} from "./studentCheckInView";
import "./studentCheckIn.css";

const requestConfig = { withCredentials: true };
const DISCOVERY_INTERVAL_MS = 10 * 1000;

const isUnauthorised = (error) => error?.response?.status === 401;

const messageFor = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback;

const StudentCheckIn = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [user, setUser] = useState(null);
  const [deviceStatus, setDeviceStatus] = useState("checking");
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [evidence, setEvidence] = useState(null);

  const mountedRef = useRef(true);
  const sessionsRequestRef = useRef(0);
  const submittingRef = useRef(false);
  const selectedSessionRef = useRef(null);
  const userRef = useRef(null);
  const listeningWaveRef = useRef(null);

  const selectedSession = useMemo(
    () => selectSession(sessions, selectedId),
    [sessions, selectedId]
  );

  useEffect(() => {
    selectedSessionRef.current = selectedSession;
  }, [selectedSession]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionsRequestRef.current += 1;
    };
  }, []);

  const loadSessions = useCallback(
    async ({ quiet = false } = {}) => {
      const requestId = sessionsRequestRef.current + 1;
      sessionsRequestRef.current = requestId;
      if (!quiet) setRefreshing(true);
      setSessionsError("");

      try {
        const response = await axios.get(
          `${SERVER_URL}/student/check-in-sessions/active`,
          requestConfig
        );
        if (!mountedRef.current || requestId !== sessionsRequestRef.current) return false;

        const next = Array.isArray(response.data?.sessions) ? response.data.sessions : [];
        setSessions(next);
        setSelectedId((current) => selectSession(next, current)?.id || "");
        return true;
      } catch (requestError) {
        if (!mountedRef.current || requestId !== sessionsRequestRef.current) return false;
        if (isUnauthorised(requestError)) {
          navigate("/login");
          return false;
        }
        setSessionsError(
          messageFor(requestError, "Could not check for a live check-in. Retrying…")
        );
        return false;
      } finally {
        if (mountedRef.current && requestId === sessionsRequestRef.current) {
          setRefreshing(false);
        }
      }
    },
    [navigate]
  );

  useEffect(() => {
    let cancelled = false;

    const initialise = async () => {
      try {
        const userResponse = await axios.get(`${SERVER_URL}/islogin`, requestConfig);
        if (cancelled) return;
        if (userResponse.data?.user?.role !== "student") {
          navigate("/teacher/check-in");
          return;
        }
        setUser(userResponse.data.user);

        const bindingResponse = await axios.get(
          `${SERVER_URL}/device-bindings/status`,
          requestConfig
        );
        if (cancelled) return;
        setDeviceStatus(bindingResponse.data?.status || "unbound");

        await loadSessions({ quiet: true });
      } catch (requestError) {
        if (cancelled) return;
        if (isUnauthorised(requestError)) {
          navigate("/login");
          return;
        }
        toast(
          messageFor(requestError, "Could not load check-in. Please try again."),
          "error"
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    initialise();
    return () => {
      cancelled = true;
    };
  }, [loadSessions, navigate, toast]);

  useEffect(() => {
    if (!user) return undefined;
    const timer = window.setInterval(() => {
      loadSessions({ quiet: true });
    }, DISCOVERY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadSessions, user]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && userRef.current) {
        loadSessions({ quiet: true });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [loadSessions]);

  const handleDecodedFrame = useCallback(
    async (frame) => {
      const session = selectedSessionRef.current;
      const currentUser = userRef.current;
      if (!session || !currentUser) {
        setSubmitError("No live check-in is selected. Refresh and try again.");
        return;
      }

      if (session.status !== "active" || keyRemainingMs(session) <= 0) {
        setSubmitError(
          "The wave key is no longer live. Ask your teacher to advance the wave or restart the session."
        );
        loadSessions({ quiet: true });
        return;
      }

      let key;
      try {
        key = digitsToValue(frame.dataDigits);
      } catch (error) {
        setSubmitError("This phone heard an unreadable key. Try listening again.");
        return;
      }
      if (!isDecodedKey(key)) {
        setSubmitError("This phone heard an unreadable key. Try listening again.");
        return;
      }

      submittingRef.current = true;
      setSubmitting(true);
      setSubmitError("");

      try {
        const message = buildProofMessage({
          sessionId: session.id,
          wave: session.wave,
          key,
          studentId: String(currentUser._id || currentUser.id),
        });
        const signature = await signDeviceMessage(message);
        const response = await submitProof({
          sessionId: session.id,
          wave: session.wave,
          key,
          signature,
          apiUrl: SERVER_URL,
        });
        const nextEvidence = evidenceFromResponse(response, session);
        if (!nextEvidence) {
          throw new Error("The proof server returned an unreadable response.");
        }
        if (mountedRef.current) setEvidence(nextEvidence);
      } catch (error) {
        if (error?.status === 401) {
          navigate("/login");
          return;
        }
        if (mountedRef.current) {
          setSubmitError(
            messageFor(
              error,
              "The proof could not be submitted. Check your connection and try again."
            )
          );
        }
        if (error?.status === 409) loadSessions({ quiet: true });
      } finally {
        submittingRef.current = false;
        if (mountedRef.current) setSubmitting(false);
      }
    },
    [loadSessions, navigate]
  );

  const { phase: audioPhase, error: audioError, start, stop } = useCheckInAudio({
    onFrame: handleDecodedFrame,
  });

  const phase = selectedSession ? sessionPhase(selectedSession, now) : "none";
  const remainingMs = selectedSession ? keyRemainingMs(selectedSession, now) : 0;
  const blockReason = joinBlockReason({
    session: selectedSession,
    deviceStatus,
    consent,
    now,
  });
  const audioReady =
    audioPhase === "idle" || audioPhase === "stopped" || audioPhase === "captured";
  const canJoin = !blockReason && !submitting && !evidence && audioReady;
  const listening = audioPhase === "starting" || audioPhase === "listening";

  useEffect(() => {
    setConsent(false);
    setEvidence(null);
    setSubmitError("");
  }, [selectedSession?.id]);

  useEffect(() => {
    if (phase === "live") return;
    if (!listening) return;
    stop();
    setSubmitError(
      phase === "expired"
        ? "The wave key expired, so listening stopped. Ask your teacher to advance the wave."
        : "The check-in session closed, so listening stopped."
    );
  }, [listening, phase, stop]);

  // The teacher can advance the wave while a phone is listening. Stop the old
  // capture so the student does not submit a frame from the previous key.
  useEffect(() => {
    if (!listening) return;
    if (
      listeningWaveRef.current !== null &&
      selectedSession?.wave !== listeningWaveRef.current
    ) {
      stop();
      setSubmitError("The teacher advanced to a new wave. Tap Join to listen for the new key.");
    }
  }, [selectedSession?.wave, listening, stop]);

  const handleJoin = async () => {
    if (!canJoin) return;
    setSubmitError("");
    setEvidence(null);
    listeningWaveRef.current = selectedSession?.wave ?? null;
    await start();
  };

  const handleStop = () => {
    stop();
  };

  const handleLogout = useCallback(async () => {
    try {
      await axios.post(`${SERVER_URL}/logout`, null, requestConfig);
    } catch (error) {
      // Sign-out is best-effort; the local session ends either way.
    }
    navigate("/");
    toast("Signed out. See you next class!", "success");
  }, [navigate, toast]);

  if (loading || !user) {
    return <PageLoader label="Finding your live check-in…" />;
  }

  const name = user.name || user.email.split("@")[0];
  const firstName = name.split(" ")[0];

  const joinLabel = () => {
    if (evidence) return "Evidence recorded";
    if (submitting) return "Submitting proof…";
    if (audioPhase === "starting") return "Opening the microphone…";
    if (audioPhase === "listening") return "Listening for the key…";
    if (submitError) return "Listen again";
    if (blockReason === "consent") return "Acknowledge the notice to join";
    if (blockReason === "expired") return "Wave key expired";
    return "Join check-in";
  };

  return (
    <AppShell
      role="student"
      name={name}
      email={user.email}
      onLogout={handleLogout}
      links={[
        { to: "/student-dashboard", label: "Dashboard" },
        { to: "/student/check-in", label: "Check-in", active: true },
        { to: "/acoustic-lab", label: "Phone audio test" },
      ]}
    >
      <div className="ui-page-head">
        <div>
          <h1 className="ui-page-head__title">Check in, {firstName}</h1>
          <p className="ui-page-head__sub">
            Join while your teacher’s session is live. This phone listens for the current wave,
            signs what it heard, and records evidence. It does not mark attendance.
          </p>
        </div>
        <div className="ui-page-head__actions">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadSessions()}
            disabled={refreshing || listening || submitting}
          >
            <FiRefreshCw aria-hidden="true" />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      <Card className="student-checkin__notice">
        <div className="student-checkin__notice-head">
          <span className="student-checkin__notice-icon" aria-hidden="true">
            <FiShield />
          </span>
          <div>
            <h2 className="student-checkin__notice-title">Before you listen</h2>
            <p className="student-checkin__notice-sub">
              A short, plain-language notice. Please read it before the microphone opens.
            </p>
          </div>
          <Badge variant="info">Required</Badge>
        </div>

        <ul className="student-checkin__notice-list">
          <li>
            <strong>Audio stays on this phone.</strong> The microphone is used only while you
            are on this screen and listening. The key is decoded locally; raw audio is never
            uploaded.
          </li>
          <li>
            <strong>Only signed evidence is sent.</strong> The server receives the session,
            wave, decoded key and a signature from this browser’s bound device key. Evidence
            expires after about {EVIDENCE_TTL_HOURS} hours.
          </li>
          <li>
            <strong>This is not an attendance decision.</strong> Hearing the key records
            evidence. Attendance depends on the full check-in, including the ID round that is
            not built yet.
          </li>
        </ul>

        <label className="student-checkin__consent" htmlFor="checkin-consent">
          <input
            id="checkin-consent"
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            disabled={Boolean(evidence) || submitting}
          />
          <span>
            I understand this phone will use the microphone and that hearing a key records
            evidence, not attendance.
          </span>
        </label>
      </Card>

      {deviceStatus !== "approved" && (
        <div className="student-checkin__alert" role="alert">
          <FiAlertTriangle aria-hidden="true" />
          <div>
            <strong>
              {deviceStatus === "review"
                ? "This device is waiting for teacher review."
                : "This browser is not approved for check-in."}
            </strong>
            <p>
              {deviceStatus === "review"
                ? "A teacher must approve the new device before this phone can submit a proof. You can still test the phone audio."
                : "Sign in again with your college Google account to bind this browser, then ask a teacher to approve a changed device."}
            </p>
          </div>
          <Link className="ui-btn ui-btn--soft ui-btn--sm" to="/student-dashboard">
            Device status
          </Link>
        </div>
      )}

      {sessionsError && (
        <div className="student-checkin__alert student-checkin__alert--soft" role="alert">
          <FiRefreshCw aria-hidden="true" />
          <div>
            <strong>Live check-in could not refresh.</strong>
            <p>{sessionsError}</p>
          </div>
        </div>
      )}

      {!selectedSession ? (
        <Card>
          <EmptyState
            icon={<FiClock />}
            title="No live check-in right now"
            text="Keep this page open, or tap Refresh. It also checks again every ten seconds while your teacher starts a session."
            action={
              <Button variant="soft" onClick={() => loadSessions()} loading={refreshing}>
                Check again
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="student-checkin__grid">
          <Card
            className="student-checkin__live"
            title="Live check-in"
            subtitle="Join while the key countdown is running."
            actions={
              <Badge variant={phase === "live" ? "success" : "warning"} dot>
                {phase === "live" ? "Live" : "Key expired"}
              </Badge>
            }
          >
            {sessions.length > 1 && (
              <Field label="Choose your class" htmlFor="checkin-session">
                <select
                  id="checkin-session"
                  className="ui-input"
                  value={selectedSession.id}
                  onChange={(event) => setSelectedId(event.target.value)}
                  disabled={listening || submitting}
                >
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {sessionLabel(session)} — {sessionTitle(session)}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <div className="student-checkin__session">
              <div>
                <p className="student-checkin__session-code">{sessionLabel(selectedSession)}</p>
                <h2 className="student-checkin__session-title">{sessionTitle(selectedSession)}</h2>
                <p className="student-checkin__session-meta">
                  <span>{roomLabel(selectedSession)}</span>
                  <span>Wave {selectedSession.wave}</span>
                </p>
              </div>
              <div className={`student-checkin__countdown is-${phase}`}>
                <span className="student-checkin__countdown-value">
                  {phase === "live" ? formatCountdown(remainingMs) : "0:00"}
                </span>
                <span className="student-checkin__countdown-label">
                  {phase === "live" ? "key time left" : "key expired"}
                </span>
              </div>
            </div>

            <div className={`student-checkin__listen is-${audioPhase}`}>
              <span className="student-checkin__listen-icon" aria-hidden="true">
                {audioPhase === "listening" ? <FiMic /> : <FiHeadphones />}
              </span>
              <div>
                <strong>
                  {audioPhase === "listening"
                    ? "Listening for the current wave…"
                    : audioPhase === "starting"
                    ? "Opening the microphone…"
                    : submitError
                    ? "The key was heard, but the proof was not recorded."
                    : "Ready when you are."}
                </strong>
                <p>
                  {audioPhase === "listening"
                    ? "Hold this phone still and keep this page visible. Listening stops automatically after the first valid frame or one minute."
                    : submitError
                    ? submitError
                    : "Tap Join, allow the microphone, and point the phone toward the teacher’s phone. Only the current wave is accepted."}
                </p>
              </div>
            </div>

            {audioError && (
              <div className="student-checkin__alert" role="alert">
                <FiAlertTriangle aria-hidden="true" />
                <div>
                  <strong>Microphone could not start.</strong>
                  <p>{audioError}</p>
                </div>
              </div>
            )}

            {blockReason === "expired" && (
              <p className="student-checkin__hint student-checkin__hint--warning">
                The two-minute key for this wave has expired. Ask your teacher to advance the wave
                so a fresh key is minted.
              </p>
            )}

            {blockReason === "consent" && (
              <p className="student-checkin__hint">
                Acknowledge the notice above to enable Join.
              </p>
            )}

            <div className="student-checkin__actions">
              <Button
                onClick={handleJoin}
                disabled={!canJoin}
                loading={audioPhase === "starting" || submitting}
              >
                {joinLabel()}
              </Button>
              {audioPhase === "listening" && (
                <Button variant="secondary" onClick={handleStop}>
                  <FiSquare aria-hidden="true" />
                  Stop listening
                </Button>
              )}
              <Link className="ui-btn ui-btn--ghost" to="/acoustic-lab">
                Test phone audio
              </Link>
            </div>

            <p className="student-checkin__fineprint">
              The transmitter plays from your teacher’s phone at the front. Do not share a
              recording of the key: a forwarded key is evidence, not proof that you were in the
              room.
            </p>
          </Card>

          <div className="student-checkin__side">
            {evidence ? (
              <Card className="student-checkin__evidence">
                <div className="student-checkin__evidence-head">
                  <span className="student-checkin__evidence-icon" aria-hidden="true">
                    <FiCheckCircle />
                  </span>
                  <div>
                    <h2 className="student-checkin__evidence-title">
                      {evidence.duplicate ? "Already recorded" : "Evidence recorded"}
                    </h2>
                    <p className="student-checkin__evidence-sub">
                      {evidence.classLabel} · Wave {evidence.wave}
                    </p>
                  </div>
                </div>
                <dl className="student-checkin__evidence-list">
                  <div>
                    <dt>Recorded</dt>
                    <dd>{formatTime(evidence.recordedAt)}</dd>
                  </div>
                  <div>
                    <dt>Retention</dt>
                    <dd>About {EVIDENCE_TTL_HOURS} hours</dd>
                  </div>
                  <div>
                    <dt>Attendance</dt>
                    <dd>Not decided</dd>
                  </div>
                </dl>
                <p className="student-checkin__evidence-note">
                  This proof says this phone heard the current wave and signed it with the
                  bound device key. It is evidence only; the ID round and attendance decision
                  come later.
                </p>
                <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/student-dashboard">
                  Back to dashboard
                </Link>
              </Card>
            ) : (
              <Card title="What happens next" subtitle="Evidence, not a roll-call.">
                <ol className="student-checkin__steps">
                  <li>
                    <strong>Hear the key.</strong>
                    The teacher’s phone plays the current wave from the front of the room.
                  </li>
                  <li>
                    <strong>Sign on this phone.</strong>
                    The decoded key is signed with the device key bound at sign-in. Raw audio
                    never leaves the phone.
                  </li>
                  <li>
                    <strong>Show the evidence.</strong>
                    The server records the session, wave and signature. A teacher decides
                    attendance later.
                  </li>
                </ol>
                <p className="student-checkin__side-note">
                  Wave advancement and the ID round are not built yet. This prototype accepts
                  the current wave only.
                </p>
              </Card>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default StudentCheckIn;
