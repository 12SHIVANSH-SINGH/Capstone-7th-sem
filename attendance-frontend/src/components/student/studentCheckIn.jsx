import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiHeadphones,
  FiHelpCircle,
  FiMapPin,
  FiMic,
  FiRefreshCw,
  FiShield,
  FiSquare,
  FiVolume2,
} from "react-icons/fi";
import SERVER_URL from "../../config/api";
import { digitsToValue } from "../../acoustic/fsk";
import { buildProofMessage, submitProof } from "../../acoustic/proofTransport";
import { useCheckInAudio } from "../../acoustic/useCheckInAudio";
import { useSignalTransmitter } from "../../acoustic/useSignalTransmitter";
import { signDeviceMessage } from "../../utils/deviceKey";
import { loadDeviceStatus } from "../../utils/deviceStatus";
import { getCurrentLocation } from "../../utils/geolocation";
import { classLabel, formatDateTime, relativeTime, givenName } from "../../utils/format";
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
  clearCheckInConsent,
  evidenceFromResponse,
  formatCountdown,
  formatTime,
  isDecodedKey,
  joinBlockReason,
  keyRemainingMs,
  nextSignalFromResponse,
  proofWaveCandidates,
  readCheckInConsent,
  roomLabel,
  selectSession,
  sessionLabel,
  sessionPhase,
  sessionTitle,
  signalIsFresh,
  writeCheckInConsent,
} from "./studentCheckInView";
import "./studentCheckIn.css";

const requestConfig = { withCredentials: true };
const DISCOVERY_INTERVAL_MS = 10 * 1000;
const RELAY_REPEATS = 3;
const RELAY_GAP_MS = 300;
const RELAY_AMPLITUDE = 0.6;
const RELAY_SETTLE_MS = 350;
const RELAY_RESTART_MS = 1200;

const isUnauthorised = (error) => error?.response?.status === 401;

const messageFor = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback;

const consentStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const StudentCheckIn = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const {
    phase: txPhase,
    error: txError,
    prime: primeTransmitter,
    play: playSignal,
    stop: stopTransmitter,
  } = useSignalTransmitter();

  const [user, setUser] = useState(null);
  const [deviceStatus, setDeviceStatus] = useState("checking");
  const [devicePendingReview, setDevicePendingReview] = useState(false);
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
  const [attemptStartedAt, setAttemptStartedAt] = useState(null);
  const [locationState, setLocationState] = useState("idle");
  const [recentSessions, setRecentSessions] = useState([]);
  const [relayActive, setRelayActive] = useState(false);
  const [lastRelayedWave, setLastRelayedWave] = useState(null);
  const [relayCount, setRelayCount] = useState(0);

  const mountedRef = useRef(true);
  const sessionsRequestRef = useRef(0);
  const submittingRef = useRef(false);
  const selectedSessionRef = useRef(null);
  const userRef = useRef(null);
  const relayActiveRef = useRef(false);
  const handledKeysRef = useRef(new Set());
  const restartListeningRef = useRef(null);

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
      relayActiveRef.current = false;
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

  const refreshRecentSessions = useCallback(async () => {
    try {
      const response = await axios.get(`${SERVER_URL}/attendance/me/sessions`, requestConfig);
      if (!mountedRef.current) return;
      setRecentSessions(Array.isArray(response.data?.sessions) ? response.data.sessions : []);
    } catch (error) {
      // The query shortcut is optional; the check-in must still work.
    }
  }, []);

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

        const binding = await loadDeviceStatus();
        if (cancelled) return;
        setDeviceStatus(binding.status);
        setDevicePendingReview(binding.pendingReview);

        await loadSessions({ quiet: true });
        if (!cancelled) await refreshRecentSessions();
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
  }, [loadSessions, navigate, refreshRecentSessions, toast]);

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

  const captureAttemptLocation = useCallback(async () => {
    const session = selectedSessionRef.current;
    if (!session?.id) return;
    setLocationState("capturing");
    const location = await getCurrentLocation();
    if (!mountedRef.current) return;
    if (!location) {
      setLocationState("unavailable");
      return;
    }
    try {
      await axios.post(
        `${SERVER_URL}/check-in-sessions/${session.id}/location`,
        { location },
        requestConfig
      );
      if (mountedRef.current) setLocationState("shared");
    } catch (error) {
      if (mountedRef.current) setLocationState("unavailable");
    }
  }, []);

  const markHandled = useCallback((sessionId, key) => {
    handledKeysRef.current.add(`${sessionId}:${key}`);
  }, []);

  /**
   * Try the locally known round and the next two. Discovery polling can lag a
   * fast cascade, and the acoustic frame carries only the key. The server still
   * accepts only its current or pending pair, so a wrong guess records nothing.
   */
  const submitDecodedKey = useCallback(
    async ({ session, studentId, key }) => {
      let lastError = null;
      for (const wave of proofWaveCandidates(session.wave)) {
        const message = buildProofMessage({
          sessionId: session.id,
          wave,
          key,
          studentId,
        });
        const signature = await signDeviceMessage(message);
        try {
          const response = await submitProof({
            sessionId: session.id,
            wave,
            key,
            signature,
            apiUrl: SERVER_URL,
          });
          const nextEvidence = evidenceFromResponse(response, session);
          if (!nextEvidence) {
            throw new Error("The proof server returned an unreadable response.");
          }
          return { response, evidence: nextEvidence, wave };
        } catch (error) {
          lastError = error;
          if (error?.status === 401) throw error;
          // 400/409 can mean "wrong guess" for this candidate. Try the next
          // candidate; the server decides freshness and advance role.
          if (error?.status !== 400 && error?.status !== 409) throw error;
        }
      }
      throw lastError || new Error("The proof could not be submitted.");
    },
    []
  );

  const handleDecodedFrame = useCallback(
    async (frame) => {
      const session = selectedSessionRef.current;
      const currentUser = userRef.current;
      if (!relayActiveRef.current) return;

      if (!session || !currentUser) {
        setSubmitError("No live check-in is selected. Refresh and try again.");
        return;
      }
      if (session.status !== "active") {
        relayActiveRef.current = false;
        setRelayActive(false);
        setSubmitError("The check-in closed, so listening stopped.");
        return;
      }

      let key;
      try {
        key = digitsToValue(frame.dataDigits);
      } catch (error) {
        setSubmitError("This phone heard an unreadable signal. Listening again.");
        restartListeningRef.current?.();
        return;
      }
      if (!isDecodedKey(key)) {
        setSubmitError("This phone heard an unreadable signal. Listening again.");
        restartListeningRef.current?.();
        return;
      }

      const marker = `${session.id}:${key}`;
      if (handledKeysRef.current.has(marker)) {
        restartListeningRef.current?.();
        return;
      }

      submittingRef.current = true;
      setSubmitting(true);
      setSubmitError("");

      try {
        const result = await submitDecodedKey({
          session,
          studentId: String(currentUser._id || currentUser.id),
          key,
        });
        markHandled(session.id, key);
        if (mountedRef.current) {
          setEvidence(result.evidence);
          setSubmitError("");
        }
        refreshRecentSessions();

        const next = nextSignalFromResponse(result.response);
        if (next && signalIsFresh(next) && relayActiveRef.current) {
          primeTransmitter();
          const played = await playSignal({
            key: next.key,
            repeats: RELAY_REPEATS,
            gapMs: RELAY_GAP_MS,
            amplitude: RELAY_AMPLITUDE,
          });
          if (played && mountedRef.current) {
            setLastRelayedWave(next.wave);
            setRelayCount((count) => count + 1);
          }
        } else if (next) {
          setSubmitError(
            "The next signal had already expired. This phone is still listening for a fresh one."
          );
        }
      } catch (error) {
        if (error?.status === 401) {
          navigate("/login");
          return;
        }
        if (!mountedRef.current) return;

        if (error?.status === 400 || error?.status === 409) {
          // A stale or already-recorded signal is not a failure of the relay.
          markHandled(session.id, key);
          setSubmitError(
            "That signal was no longer accepted. Still listening for the next round."
          );
        } else {
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
        if (relayActiveRef.current && mountedRef.current) {
          window.setTimeout(() => {
            if (relayActiveRef.current) restartListeningRef.current?.();
          }, RELAY_SETTLE_MS);
        }
      }
    },
    [
      loadSessions,
      markHandled,
      navigate,
      playSignal,
      primeTransmitter,
      refreshRecentSessions,
      submitDecodedKey,
    ]
  );

  const shouldAcceptFrame = useCallback((frame) => {
    const session = selectedSessionRef.current;
    if (!session?.id) return false;
    try {
      const key = digitsToValue(frame.dataDigits);
      if (!isDecodedKey(key)) return false;
      return !handledKeysRef.current.has(`${session.id}:${key}`);
    } catch {
      return false;
    }
  }, []);

  const {
    phase: audioPhase,
    error: audioError,
    start: startAudio,
    stop: stopAudio,
  } = useCheckInAudio({
    onFrame: handleDecodedFrame,
    shouldAcceptFrame,
  });

  const startListening = useCallback(async () => {
    if (!relayActiveRef.current || submittingRef.current) return false;
    if (document.visibilityState !== "visible") return false;
    return startAudio();
  }, [startAudio]);

  useEffect(() => {
    restartListeningRef.current = startListening;
  }, [startListening]);

  const stopRelay = useCallback(() => {
    relayActiveRef.current = false;
    setRelayActive(false);
    stopTransmitter();
    stopAudio();
  }, [stopAudio, stopTransmitter]);

  const phase = selectedSession ? sessionPhase(selectedSession, now) : "none";
  const remainingMs = selectedSession ? keyRemainingMs(selectedSession, now) : 0;
  const blockReason = joinBlockReason({
    session: selectedSession,
    deviceStatus,
    consent,
  });
  const audioReady =
    audioPhase === "idle" || audioPhase === "stopped" || audioPhase === "captured";
  const canJoin = !blockReason && !relayActive && !submitting && audioReady;
  const txBusy = txPhase === "playing" || txPhase === "preparing";
  const listening = audioPhase === "starting" || audioPhase === "listening";
  const relayBusy = submitting || txBusy;

  useEffect(() => {
    stopRelay();
    handledKeysRef.current = new Set();
    setRelayCount(0);
    setLastRelayedWave(null);
    setEvidence(null);
    setSubmitError("");
    setAttemptStartedAt(null);
    setLocationState("idle");
    const sessionId = selectedSession?.id;
    setConsent(sessionId ? readCheckInConsent(consentStorage(), sessionId) : false);
  }, [selectedSession?.id, stopRelay]);

  useEffect(() => {
    if (!selectedSession) return;
    if (selectedSession.status !== "active" && relayActiveRef.current) {
      stopRelay();
      setSubmitError("The check-in closed, so this phone stopped listening.");
    }
  }, [selectedSession, stopRelay]);

  // A hidden tab releases the mic. Returning to the page resumes the relay
  // without asking the student to Join again.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (!relayActiveRef.current || submittingRef.current) return;
      if (txPhase === "playing" || txPhase === "preparing") return;
      if (audioPhase === "idle" || audioPhase === "stopped") {
        startListening();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [audioPhase, startListening, txPhase]);

  // The mic releases after the one-minute safety limit. While the relay is on,
  // reopen it so a later round can still be heard without another tap.
  useEffect(() => {
    if (!relayActive || submitting || txBusy || audioPhase !== "stopped") {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      if (relayActiveRef.current && document.visibilityState === "visible") {
        startListening();
      }
    }, RELAY_RESTART_MS);
    return () => window.clearTimeout(timer);
  }, [audioPhase, relayActive, startListening, submitting, txBusy]);

  const handleConsent = (checked) => {
    setConsent(checked);
    const sessionId = selectedSession?.id;
    if (!sessionId) return;
    if (checked) writeCheckInConsent(consentStorage(), sessionId);
    else clearCheckInConsent(consentStorage());
  };

  const handleJoin = async () => {
    if (!canJoin) return;
    // Unlock the speaker in the tap gesture; later signals play after network
    // responses without another user interaction.
    if (!primeTransmitter()) {
      setSubmitError(
        "This browser cannot play the next signal. Use current Chrome on Android over HTTPS."
      );
      return;
    }
    setSubmitError("");
    setAttemptStartedAt(new Date().toISOString());
    relayActiveRef.current = true;
    setRelayActive(true);
    void captureAttemptLocation();
    const started = await startAudio();
    if (!started && mountedRef.current && relayActiveRef.current) {
      relayActiveRef.current = false;
      setRelayActive(false);
    }
  };

  const handleStop = () => {
    stopRelay();
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
  const firstName = givenName(name);

  const joinLabel = () => {
    if (submitting) return "Submitting proof…";
    if (audioPhase === "starting") return "Opening the microphone…";
    if (audioPhase === "listening") return "Listening…";
    if (submitError) return "Listen again";
    if (blockReason === "consent") return "Acknowledge the notice to join";
    return "Join check-in";
  };

  const locationLabel =
    locationState === "capturing"
      ? "Capturing location…"
      : locationState === "shared"
      ? "Attempt location shared"
      : locationState === "unavailable"
      ? "Location not shared"
      : "Location optional";

  const listenTitle = relayActive
    ? txBusy
      ? "Passing the next signal on…"
      : listening
      ? "Listening for the next round…"
      : "Relay is on"
    : "Ready when you are.";

  const listenCopy = relayActive
    ? txBusy
      ? "Your phone is playing the signal it received from the server. It will listen again as soon as playback finishes."
      : listening
      ? "Keep this page visible. When a signal is heard, this phone signs the evidence and passes the next signal on automatically."
      : "This phone is between rounds. It will keep listening while the check-in is live."
    : audioPhase === "listening"
    ? "Keep this page visible. The phone will sign what it hears and pass the next signal on."
    : submitError
    ? submitError
    : "Tap Join, allow the microphone, and point the phone toward the class. The next signal is passed on automatically after evidence is accepted.";

  const stageItems = selectedSession
    ? [
        {
          id: "session",
          label: "Session live",
          detail: `Opened ${formatTime(selectedSession.startedAt)} · ${roomLabel(selectedSession)}`,
          state: "done",
        },
        {
          id: "listen",
          label: relayActive
            ? listening
              ? "Listening for the next round"
              : txBusy
              ? "Passing the signal on"
              : "Relay active"
            : "Ready to listen",
          detail: relayActive
            ? "The microphone and speaker take turns automatically. You can stop at any time."
            : "Tap Join after acknowledging the notice. The phone keeps listening while the session is live.",
          state: relayActive ? "active" : attemptStartedAt ? "done" : "pending",
        },
        {
          id: "evidence",
          label: "Signed evidence",
          detail: evidence
            ? evidence.duplicate
              ? `Round ${evidence.wave} was already recorded for this phone.`
              : evidence.autoMarked
              ? `Round ${evidence.wave} was signed and you are marked present for this session.`
              : `Round ${evidence.wave} was signed and recorded by the server.`
            : "The server has not received a signed proof yet.",
          state: evidence ? "done" : submitting ? "active" : "pending",
        },
        {
          id: "relay",
          label: "Signal passed on",
          detail:
            relayCount > 0
              ? `This phone has passed ${relayCount} next signal${
                  relayCount === 1 ? "" : "s"
                } on to the room.`
              : lastRelayedWave !== null
              ? `Round ${lastRelayedWave} was played from this phone.`
              : "After accepted evidence, the next signal plays automatically.",
          state: relayCount > 0 ? "done" : txBusy ? "active" : "pending",
        },
        {
          id: "register",
          label: "Teacher register",
          detail: selectedSession.autoMarkPresent
            ? evidence?.attendanceStatus === "present"
              ? "You are marked present from signed evidence. Your teacher can still change the register."
              : "Auto-present is on for this session. A valid signed proof marks you present; your teacher can still change the register."
            : "Attendance is finalised by your teacher after close. If you were present but unmarked, the query window opens for 24 hours.",
          state: evidence?.attendanceStatus === "present" ? "done" : "pending",
        },
      ]
    : [];

  return (
    <AppShell
      role="student"
      name={name}
      email={user.email}
      onLogout={handleLogout}
    >
      <div className="ui-page-head">
        <div>
          <h1 className="ui-page-head__title">Check in, {firstName}</h1>
          <p className="ui-page-head__sub">
            Join while your teacher’s session is live. This phone hears a round, signs the
            evidence, and passes the next signal on to the class. It does not mark attendance.
          </p>
        </div>
        <div className="ui-page-head__actions">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadSessions()}
            disabled={refreshing || relayBusy}
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
            <h2 className="student-checkin__notice-title">Before you join</h2>
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
            <strong>This phone also plays the next signal.</strong> After the server accepts
            your evidence, this phone briefly plays the next signal through its speaker so
            nearby phones can hear it. That is how the class covers itself.
          </li>
          <li>
            <strong>Only signed evidence is sent.</strong> The server receives the session,
            round, decoded key and a signature from this browser’s bound device key. Evidence
            expires after about {EVIDENCE_TTL_HOURS} hours.
          </li>
          <li>
            <strong>
              {selectedSession?.autoMarkPresent
                ? "Auto-present is on for this session."
                : "This is not an attendance decision."}
            </strong>{" "}
            {selectedSession?.autoMarkPresent
              ? "A valid signed proof marks you present automatically. Your teacher can still change the register; if you were present but missed it, you can raise a query after the session closes."
              : "Hearing a key records evidence. Your teacher owns the register and decides attendance; if you were present but missed the register, you can raise a query after the session closes."}
          </li>
        </ul>

        <label className="student-checkin__consent" htmlFor="checkin-consent">
          <input
            id="checkin-consent"
            type="checkbox"
            checked={consent}
            onChange={(event) => handleConsent(event.target.checked)}
            disabled={relayActive || submitting}
          />
          <span>
            I understand this phone will use the microphone and speaker and that hearing a
            key records signed evidence.{" "}
            {selectedSession?.autoMarkPresent
              ? "Auto-present is on for this session, so a valid proof will mark me present."
              : "Attendance is still decided by my teacher."}{" "}
            This choice lasts for this check-in.
          </span>
        </label>
      </Card>

      {selectedSession?.autoMarkPresent && (
        <div className="student-checkin__alert student-checkin__alert--soft" role="status">
          <FiCheckCircle aria-hidden="true" />
          <div>
            <strong>Auto-present is on for this session.</strong>
            <p>
              Your first valid signed proof marks you present. Your teacher can still change
              the register, and the query window remains available after the session closes.
            </p>
          </div>
        </div>
      )}

      {deviceStatus === "approved" && devicePendingReview && (
        <div className="student-checkin__alert student-checkin__alert--soft" role="status">
          <FiShield aria-hidden="true" />
          <div>
            <strong>Another browser is waiting for review.</strong>
            <p>
              This approved browser can still submit proof. A teacher must approve the other
              browser before it can be used for attendance.
            </p>
          </div>
          <Link className="ui-btn ui-btn--soft ui-btn--sm" to="/student-dashboard">
            Device status
          </Link>
        </div>
      )}

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
                ? "A teacher must approve this browser before it can submit a proof. You can still test the phone audio while you wait."
                : "Sign in again with your college Google account to request this browser, then ask a teacher to approve it."}
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
            subtitle="Join once. The phone keeps the relay going while the session is live."
            actions={
              <Badge variant={phase === "live" ? "success" : "warning"} dot>
                {phase === "live" ? "Live" : "Signal expired"}
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
                  disabled={relayActive || relayBusy}
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
                  <span>Round {selectedSession.wave}</span>
                  {relayCount > 0 && <span>Relayed {relayCount}</span>}
                </p>
              </div>
              <div className={`student-checkin__countdown is-${phase}`}>
                <span className="student-checkin__countdown-value">
                  {phase === "live" ? formatCountdown(remainingMs) : "0:00"}
                </span>
                <span className="student-checkin__countdown-label">
                  {phase === "live" ? "signal time left" : "signal expired"}
                </span>
              </div>
            </div>

            <div className={`student-checkin__listen is-${audioPhase}`}>
              <span className="student-checkin__listen-icon" aria-hidden="true">
                {txBusy ? <FiVolume2 /> : listening || relayActive ? <FiMic /> : <FiHeadphones />}
              </span>
              <div>
                <strong>{listenTitle}</strong>
                <p>{listenCopy}</p>
              </div>
            </div>

            {(audioError || txError) && (
              <div className="student-checkin__alert" role="alert">
                <FiAlertTriangle aria-hidden="true" />
                <div>
                  <strong>
                    {txError ? "The next signal could not play." : "Microphone could not start."}
                  </strong>
                  <p>{txError || audioError}</p>
                </div>
              </div>
            )}

            {submitError && !txError && (
              <p className="student-checkin__hint student-checkin__hint--warning">
                {submitError}
              </p>
            )}

            {phase === "expired" && (
              <p className="student-checkin__hint student-checkin__hint--warning">
                This round’s signal has expired. Keep listening: a phone that already received
                the next signal may still pass it on. If nothing arrives, ask your teacher to
                nudge the class or start a fresh check-in.
              </p>
            )}

            {blockReason === "consent" && (
              <p className="student-checkin__hint">
                Acknowledge the notice above to enable Join. It stays acknowledged if this
                page reloads during the same check-in.
              </p>
            )}

            <div className="student-checkin__actions">
              {relayActive ? (
                <Button variant="secondary" onClick={handleStop}>
                  <FiSquare aria-hidden="true" />
                  Stop listening and relaying
                </Button>
              ) : (
                <Button
                  onClick={handleJoin}
                  disabled={!canJoin}
                  loading={audioPhase === "starting"}
                >
                  {joinLabel()}
                </Button>
              )}
              <Link className="ui-btn ui-btn--ghost" to="/acoustic-lab">
                Test phone audio
              </Link>
            </div>

            <div className="checkin-progress">
              <div className="checkin-progress__head">
                <strong>Check-in progress</strong>
                <span
                  className={`chip ${
                    locationState === "shared"
                      ? "chip--success"
                      : locationState === "unavailable"
                      ? "chip--warning"
                      : ""
                  }`}
                >
                  <FiMapPin aria-hidden="true" /> {locationLabel}
                </span>
              </div>
              <ol className="checkin-progress__list">
                {stageItems.map((stage) => (
                  <li key={stage.id} className={`checkin-progress__item is-${stage.state}`}>
                    <span className="checkin-progress__dot" aria-hidden="true">
                      {stage.state === "done" ? (
                        <FiCheckCircle />
                      ) : stage.state === "active" ? (
                        <FiMic />
                      ) : null}
                    </span>
                    <div>
                      <strong>{stage.label}</strong>
                      <p>{stage.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="student-checkin__fineprint">
                Location is optional evidence: a denied permission never blocks a check-in.
                The teacher sees the attempt time and distance when it is available.
              </p>
            </div>

            <p className="student-checkin__fineprint">
              Signals pass phone to phone. A forwarded key still shows only that a phone
              heard a round; it does not prove who was in the room. Your teacher judges the
              register and any query.
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
                      {evidence.classLabel} · Round {evidence.wave}
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
                  This proof says this phone heard a round and signed it with the bound device
                  key. If the server returned the next signal, this phone passed it on
                  automatically. It is evidence only; your teacher owns the attendance
                  decision.
                </p>
                <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/student-dashboard">
                  Back to dashboard
                </Link>
              </Card>
            ) : (
              <Card title="What happens next" subtitle="Evidence, not a roll-call.">
                <ol className="student-checkin__steps">
                  <li>
                    <strong>Hear a round.</strong>
                    The teacher’s phone plays the first signal; nearby phones pass the next
                    one on.
                  </li>
                  <li>
                    <strong>Sign on this phone.</strong>
                    The decoded key is signed with the device key bound at sign-in. Raw audio
                    never leaves the phone.
                  </li>
                  <li>
                    <strong>Pass the next signal on.</strong>
                    When the server accepts your evidence, this phone plays the server-minted
                    next signal, then listens again.
                  </li>
                  <li>
                    <strong>Show the evidence.</strong>
                    The server records the session, round and signature. A teacher decides
                    attendance later.
                  </li>
                </ol>
                <p className="student-checkin__side-note">
                  Rounds and proofs are evidence, not a roll-call. A forwarded key shows that
                  a phone heard a signal; it does not prove who was in the room.
                </p>
              </Card>
            )}

            <Card
              title="Were you missed?"
              subtitle="A session that closed without your mark can still be corrected."
              actions={
                <Button variant="ghost" size="sm" onClick={refreshRecentSessions}>
                  <FiRefreshCw aria-hidden="true" /> Refresh
                </Button>
              }
            >
              {recentSessions.filter((session) => session.canRaiseQuery).length === 0 ? (
                <p className="student-checkin__side-note">
                  No open query windows right now. A window opens for 24 hours after a session
                  closes and you are not marked present.
                </p>
              ) : (
                <div className="page-stack">
                  {recentSessions
                    .filter((session) => session.canRaiseQuery)
                    .slice(0, 3)
                    .map((session) => (
                      <div className="query-card query-card--pending" key={session.id}>
                        <div className="query-card__head">
                          <div>
                            <h3 className="query-card__title">{classLabel(session.class)}</h3>
                            <p className="query-card__sub">
                              {formatDateTime(session.startedAt)} · register{" "}
                              {session.attendance?.status || "missing"}
                            </p>
                          </div>
                          <Badge variant="warning" dot>Window open</Badge>
                        </div>
                        <div className="query-card__foot">
                          <span className="query-window query-window--open">
                            <FiClock aria-hidden="true" /> Ends{" "}
                            {relativeTime(session.queryWindowEndsAt)}
                          </span>
                          <Link className="ui-btn ui-btn--soft ui-btn--sm" to="/queries">
                            <FiHelpCircle aria-hidden="true" /> Raise query
                          </Link>
                        </div>
                      </div>
                    ))}
                </div>
              )}
              <Link className="ui-btn ui-btn--ghost ui-btn--block" to="/queries" style={{ marginTop: 10 }}>
                Open query centre
              </Link>
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default StudentCheckIn;
