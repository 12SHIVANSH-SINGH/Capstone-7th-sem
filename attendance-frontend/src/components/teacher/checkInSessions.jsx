import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  FiAlertTriangle,
  FiCheck,
  FiChevronRight,
  FiPlay,
  FiRefreshCw,
  FiSquare,
  FiUsers,
  FiVolume2,
} from "react-icons/fi";
import SERVER_URL from "../../config/api";
import AppShell from "../../ui/AppShell";
import Badge from "../../ui/Badge";
import Button from "../../ui/Button";
import Card from "../../ui/Card";
import EmptyState from "../../ui/EmptyState";
import Field from "../../ui/Field";
import { PageLoader, Spinner } from "../../ui/Spinner";
import { useToast } from "../../ui/Toast";
import {
  validateAmplitude,
  validateGapMs,
  validateRepeats,
} from "../../acoustic/transmitPlan";
import { useSignalTransmitter } from "../../acoustic/useSignalTransmitter";
import SessionAttendanceModal from "./SessionAttendanceModal";
import {
  boostSignal,
  findActiveSession,
  formatCountdown,
  formatDuration,
  keyIsUsable,
  keyRemainingMs,
  roundEvidenceCount,
  sessionDurationMs,
  signalRemainingMs,
  upsertSession,
} from "./checkInSessionView";
import "./checkInSessions.css";

const requestConfig = { withCredentials: true };
const SESSION_POLL_MS = 5 * 1000;
const EVIDENCE_POLL_MS = 10 * 1000;

const DEFAULT_SIGNAL = {
  repeats: "6",
  gapMs: "450",
  amplitude: "0.6",
};

const isUnauthorised = (error) => error?.response?.status === 401;

const messageFor = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback;

const classLabel = (courseClass) =>
  `${courseClass?.courseCode || "Class"}${courseClass?.section ? ` · ${courseClass.section}` : ""}`;

const formatWhen = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const readSignalSettings = (settings) => ({
  repeats: Number(settings.repeats),
  gapMs: Number(settings.gapMs),
  amplitude: Number(settings.amplitude),
});

const validateSignalSettings = (settings) => {
  const values = readSignalSettings(settings);
  if (!validateRepeats(values.repeats)) {
    return "Frames per signal must be a whole number from 1 to 100.";
  }
  if (!validateGapMs(values.gapMs)) {
    return "Gap between frames must be between 100 and 5000 ms.";
  }
  if (!validateAmplitude(values.amplitude)) {
    return "Signal volume must be between 5% and 100%.";
  }
  return "";
};

const CheckInSessions = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const {
    phase: txPhase,
    error: txError,
    played: txPlayed,
    plan: txPlan,
    prime,
    play,
    stop: stopSignal,
  } = useSignalTransmitter();

  const [user, setUser] = useState(null);
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [sessions, setSessions] = useState([]);

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [classesError, setClassesError] = useState("");
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  // Which class the current `sessions` array belongs to. An empty list is only
  // trustworthy once this matches the selected class.
  const [sessionsClassId, setSessionsClassId] = useState("");

  const [starting, setStarting] = useState(false);
  const [closingId, setClosingId] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [confirmAdvance, setConfirmAdvance] = useState(false);
  const [evidenceSessionId, setEvidenceSessionId] = useState("");
  const [registerSession, setRegisterSession] = useState(null);
  const [notice, setNotice] = useState("");
  const [signalSettings, setSignalSettings] = useState(DEFAULT_SIGNAL);
  const [evidence, setEvidence] = useState({
    loading: false,
    error: "",
    total: 0,
    byWave: [],
    proofs: [],
  });
  const [now, setNow] = useState(() => new Date());

  const sessionsRequestRef = useRef(0);
  const evidenceRequestRef = useRef(0);
  const roundRef = useRef({ sessionId: null, wave: null });

  const loadClasses = useCallback(async () => {
    try {
      const response = await axios.get(`${SERVER_URL}/classes`, requestConfig);
      const list = Array.isArray(response.data.classes) ? response.data.classes : [];
      setClasses(list);
      setSelectedClassId((current) =>
        list.some((courseClass) => courseClass._id === current)
          ? current
          : list[0]?._id || ""
      );
      setClassesError("");
      return true;
    } catch (requestError) {
      if (isUnauthorised(requestError)) {
        navigate("/login");
        return false;
      }
      setClassesError(messageFor(requestError, "Could not load your classes."));
      return false;
    }
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;

    const initialise = async () => {
      try {
        const response = await axios.get(`${SERVER_URL}/islogin`, requestConfig);
        if (cancelled) return;
        if (response.data?.user?.role !== "teacher") {
          navigate("/student-dashboard");
          return;
        }
        setUser(response.data.user);
      } catch (requestError) {
        if (cancelled) return;
        if (isUnauthorised(requestError)) {
          navigate("/login");
        } else {
          setPageError(
            messageFor(requestError, "Could not confirm your session. Try signing in again.")
          );
        }
        setLoading(false);
        return;
      }

      await loadClasses();
      if (!cancelled) setLoading(false);
    };

    initialise();
    return () => {
      cancelled = true;
    };
  }, [loadClasses, navigate]);

  const loadSessions = useCallback(
    async (classId, { quiet = false } = {}) => {
      if (!classId) return false;

      const requestId = sessionsRequestRef.current + 1;
      sessionsRequestRef.current = requestId;
      if (!quiet) setSessionsLoading(true);
      setSessionsError("");

      try {
        const response = await axios.get(
          `${SERVER_URL}/classes/${classId}/check-in-sessions`,
          requestConfig
        );
        if (requestId !== sessionsRequestRef.current) return false;
        setSessions(Array.isArray(response.data.sessions) ? response.data.sessions : []);
        setSessionsClassId(classId);
        return true;
      } catch (requestError) {
        if (requestId !== sessionsRequestRef.current) return false;
        if (isUnauthorised(requestError)) {
          navigate("/login");
          return false;
        }
        setSessionsError(
          messageFor(requestError, "Could not load this class's check-in history.")
        );
        return false;
      } finally {
        if (requestId === sessionsRequestRef.current) setSessionsLoading(false);
      }
    },
    [navigate]
  );

  const loadEvidence = useCallback(
    async (sessionId, { quiet = false } = {}) => {
      if (!sessionId) return false;

      const requestId = evidenceRequestRef.current + 1;
      evidenceRequestRef.current = requestId;
      if (!quiet) {
        setEvidence((current) => ({ ...current, loading: true, error: "" }));
      }

      try {
        const response = await axios.get(
          `${SERVER_URL}/check-in-sessions/${sessionId}/proofs`,
          requestConfig
        );
        if (requestId !== evidenceRequestRef.current) return false;
        setEvidence({
          loading: false,
          error: "",
          total: Number(response.data?.total) || 0,
          byWave: Array.isArray(response.data?.byWave) ? response.data.byWave : [],
          proofs: Array.isArray(response.data?.proofs) ? response.data.proofs : [],
        });
        return true;
      } catch (requestError) {
        if (requestId !== evidenceRequestRef.current) return false;
        if (isUnauthorised(requestError)) {
          navigate("/login");
          return false;
        }
        setEvidence((current) => ({
          ...current,
          loading: false,
          error: messageFor(requestError, "Could not load the evidence for this session."),
        }));
        return false;
      }
    },
    [navigate]
  );

  const applySession = useCallback((session) => {
    if (!session?.id) return;
    // A quiet poll may have started before this server response. Bump the
    // request counter so its older list cannot overwrite the newer session.
    sessionsRequestRef.current += 1;
    setSessions((current) => upsertSession(current, session));
  }, []);

  useEffect(() => {
    sessionsRequestRef.current += 1;
    setSessions([]);
    setSessionsClassId("");
    setSessionsError("");
    setConfirmClose(false);
    setConfirmAdvance(false);
    setEvidenceSessionId("");
    evidenceRequestRef.current += 1;
    setEvidence({ loading: false, error: "", total: 0, byWave: [], proofs: [] });
    setNow(new Date());
    roundRef.current = { sessionId: null, wave: null };
    if (!selectedClassId) {
      setSessionsLoading(false);
      return undefined;
    }

    setSessionsLoading(true);
    loadSessions(selectedClassId);

    return () => {
      sessionsRequestRef.current += 1;
    };
  }, [loadSessions, selectedClassId]);

  const activeSession = useMemo(() => findActiveSession(sessions), [sessions]);
  const history = useMemo(
    () => sessions.filter((session) => session.status !== "active"),
    [sessions]
  );
  const selectedClass = useMemo(
    () => classes.find((courseClass) => courseClass._id === selectedClassId) || null,
    [classes, selectedClassId]
  );
  const evidenceSession = useMemo(
    () =>
      sessions.find((session) => session.id === evidenceSessionId) ||
      activeSession ||
      null,
    [sessions, evidenceSessionId, activeSession]
  );

  useEffect(() => {
    if (!activeSession) return undefined;
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [activeSession]);

  // Follow the live session automatically. A history row can replace it when
  // the teacher inspects an older session, but a newly started active session
  // wins over an old closed one.
  useEffect(() => {
    if (!activeSession?.id) return;
    setEvidenceSessionId((current) => {
      if (!current) return activeSession.id;
      if (current === activeSession.id) return current;
      const currentSession = sessions.find((session) => session.id === current);
      return currentSession && currentSession.status === "active"
        ? current
        : activeSession.id;
    });
  }, [activeSession?.id, sessions]);

  useEffect(() => {
    if (!evidenceSessionId) return undefined;
    loadEvidence(evidenceSessionId);
    return () => {
      evidenceRequestRef.current += 1;
    };
  }, [evidenceSessionId, loadEvidence]);

  // The teacher no longer advances the cascade by hand in the normal flow.
  // Poll the class so an auto-advanced round and newly accepted evidence appear
  // without a manual refresh.
  useEffect(() => {
    if (!selectedClass?._id) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      loadSessions(selectedClass._id, { quiet: true });
    }, SESSION_POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadSessions, selectedClass?._id]);

  useEffect(() => {
    if (!activeSession?.id || evidenceSessionId !== activeSession.id) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      loadEvidence(activeSession.id, { quiet: true });
    }, EVIDENCE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [activeSession?.id, evidenceSessionId, loadEvidence]);

  const remainingMs = activeSession ? keyRemainingMs(activeSession, now) : 0;
  const keyUsable = activeSession ? keyIsUsable(activeSession, now) : false;
  const pendingRemainingMs =
    activeSession?.pending && !activeSession.pending.keyExpired
      ? signalRemainingMs(activeSession.pending, now)
      : 0;
  const nudge = activeSession ? boostSignal(activeSession, now) : null;
  const currentRoundEvidence = activeSession
    ? roundEvidenceCount(evidence, activeSession.wave)
    : 0;
  const canAdvance =
    Boolean(activeSession) && currentRoundEvidence > 0 && !advancing && !confirmClose;

  // A student proof can promote the next signal while this page is open. Stop
  // the old round audio immediately; the teacher's phone does not auto-play
  // later rounds, because student phones carry those.
  useEffect(() => {
    if (!activeSession?.id) {
      roundRef.current = { sessionId: null, wave: null };
      stopSignal();
      return;
    }
    const previous = roundRef.current;
    if (previous.sessionId !== activeSession.id) {
      roundRef.current = { sessionId: activeSession.id, wave: activeSession.wave };
      return;
    }
    if (previous.wave !== activeSession.wave) {
      roundRef.current = { sessionId: activeSession.id, wave: activeSession.wave };
      stopSignal();
      setNotice(
        `Round ${activeSession.wave} is live. Student phones are passing the new signal on.`
      );
    }
  }, [activeSession?.id, activeSession?.wave, stopSignal]);

  const playSignal = useCallback(
    (key, label) => {
      const values = readSignalSettings(signalSettings);
      setNotice(label || "");
      void play({ key, ...values });
    },
    [play, signalSettings]
  );

  const selectClass = (classId) => {
    if (!classId || classId === selectedClassId) return;
    stopSignal();
    sessionsRequestRef.current += 1;
    setSelectedClassId(classId);
    setSessions([]);
    setSessionsClassId("");
    setSessionsError("");
    setSessionsLoading(true);
    setNotice("");
    setConfirmClose(false);
    setConfirmAdvance(false);
  };

  const startSession = async () => {
    if (!selectedClass?._id || starting || activeSession) return;
    const settingsError = validateSignalSettings(signalSettings);
    if (settingsError) {
      toast(settingsError, "error");
      return;
    }

    // Unlock audio in the click gesture, before the network round-trip.
    if (!prime()) {
      toast(
        "This browser cannot play the round signal. Use current Chrome on Android over HTTPS.",
        "error"
      );
      return;
    }
    setStarting(true);
    setNotice("");

    try {
      const response = await axios.post(
        `${SERVER_URL}/classes/${selectedClass._id}/check-in-sessions`,
        {},
        requestConfig
      );
      const session = response.data?.session;
      if (session) {
        applySession(session);
        setEvidenceSessionId(session.id);
        setConfirmClose(false);
        setConfirmAdvance(false);
        setNow(new Date());
        setNotice(`Round 0 is live. This phone is sending the first signal.`);
        playSignal(session.key, "Round 0 is live. This phone is sending the first signal.");
      }
      toast("Check-in started. Round 0 is playing.", "success");
    } catch (requestError) {
      if (isUnauthorised(requestError)) {
        navigate("/login");
        return;
      }
      if (requestError?.response?.status === 409) {
        toast("This class already has a live round. Showing it now.", "error");
        await loadSessions(selectedClass._id, { quiet: true });
      } else {
        toast(messageFor(requestError, "Could not start the check-in."), "error");
      }
    } finally {
      setStarting(false);
    }
  };

  const playCurrentRound = () => {
    if (!activeSession?.key || !keyUsable) return;
    prime();
    playSignal(activeSession.key, `Round ${activeSession.wave} is playing from this phone.`);
  };

  const nudgeClass = () => {
    if (!nudge) return;
    prime();
    playSignal(
      nudge.key,
      nudge.kind === "next"
        ? `Sending round ${nudge.wave} to nudge the class.`
        : `Replaying round ${nudge.wave}.`
    );
  };

  const closeActiveSession = async () => {
    if (!activeSession?.id || closingId) return;
    setClosingId(activeSession.id);
    stopSignal();

    try {
      const response = await axios.post(
        `${SERVER_URL}/check-in-sessions/${activeSession.id}/close`,
        {},
        requestConfig
      );
      if (response.data?.session) {
        applySession(response.data.session);
      }
      setConfirmClose(false);
      setNotice("");
      toast("Check-in closed. That signal is no longer live.", "success");
    } catch (requestError) {
      if (isUnauthorised(requestError)) {
        navigate("/login");
        return;
      }
      toast(messageFor(requestError, "Could not close the check-in."), "error");
    } finally {
      setClosingId("");
    }
  };

  const advanceWave = async () => {
    if (!activeSession?.id || advancing) return;
    setAdvancing(true);

    try {
      const response = await axios.post(
        `${SERVER_URL}/check-in-sessions/${activeSession.id}/advance`,
        {},
        requestConfig
      );
      if (response.data?.session) {
        applySession(response.data.session);
        setEvidenceSessionId(response.data.session.id);
        setConfirmAdvance(false);
        setNow(new Date());
        toast(`Round ${response.data.session.wave} is live.`, "success");
        await loadEvidence(response.data.session.id, { quiet: true });
      }
    } catch (requestError) {
      if (isUnauthorised(requestError)) {
        navigate("/login");
        return;
      }
      toast(
        messageFor(
          requestError,
          "Could not advance the round. Wait for a phone to record evidence first."
        ),
        "error"
      );
      if (requestError?.response?.status === 409) {
        await loadSessions(selectedClass?._id, { quiet: true });
      }
    } finally {
      setAdvancing(false);
    }
  };

  const refreshSessions = () => {
    if (selectedClass?._id) loadSessions(selectedClass._id);
  };

  const handleLogout = useCallback(async () => {
    try {
      await axios.post(`${SERVER_URL}/logout`, null, requestConfig);
    } catch (error) {
      // Sign-out is best-effort; the local session ends either way.
    }
    navigate("/");
  }, [navigate]);

  if (loading) return <PageLoader label="Loading check-in sessions…" />;

  if (!user) {
    return (
      <main className="checkin-fallback">
        <Card title="Could not open check-in">
          <p className="checkin__note">
            {pageError || "Your session could not be confirmed."}
          </p>
          <Button onClick={() => navigate("/login")}>Go to sign in</Button>
        </Card>
      </main>
    );
  }

  const name = user.name || user.email?.split("@")[0] || "Teacher";
  const roomNo =
    activeSession?.room?.roomNo || selectedClass?.defaultRoom?.roomNo || "—";
  const signalPlaying = txPhase === "playing" || txPhase === "preparing";

  return (
    <AppShell
      role="teacher"
      name={name}
      email={user.email}
      onLogout={handleLogout}
    >
      <div className="ui-page-head">
        <div>
          <h1 className="ui-page-head__title">Run a check-in</h1>
          <p className="ui-page-head__sub">
            Pick a class and start once. This phone plays the first signal; student phones
            pass the next signal on as their evidence is accepted. You still own the register.
          </p>
        </div>
        <div className="ui-page-head__actions">
          <Button variant="secondary" onClick={() => navigate("/teacher/classes")}>
            <FiUsers aria-hidden="true" />
            Classes &amp; rosters
          </Button>
        </div>
      </div>

      <div className="checkin__hint">
        <FiVolume2 aria-hidden="true" />
        <p>
          <strong>Keep this phone at the front.</strong> It only needs to play the first
          round. A phone that hears another phone passes the next signal on, so the class
          covers itself without anyone reloading.
        </p>
      </div>

      {classesError && (
        <div className="checkin__alert" role="alert">
          <FiAlertTriangle aria-hidden="true" />
          <div>
            <strong>Could not load your classes</strong>
            <p>{classesError}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={loadClasses}>
            Retry
          </Button>
        </div>
      )}

      {classes.length === 0 ? (
        classesError ? null : (
          <Card
            title="No classes yet"
            subtitle="A check-in needs a class with a default room and an active roster."
          >
            <EmptyState
              icon={<FiUsers />}
              title="Create your first class"
              text="Set up the class, add its roster, then return here to start a check-in."
              action={
                <Button onClick={() => navigate("/teacher/classes")}>Open classes &amp; rosters</Button>
              }
            />
          </Card>
        )
      ) : (
        <section className="checkin__grid">
          <Card
            title="1. Choose a class"
            subtitle="Only classes you own appear here."
            actions={
              <Button variant="ghost" size="sm" onClick={loadClasses}>
                <FiRefreshCw aria-hidden="true" /> Refresh
              </Button>
            }
          >
            <div className="checkin__class-list">
              {classes.map((courseClass) => {
                const selected = courseClass._id === selectedClassId;
                return (
                  <button
                    key={courseClass._id}
                    type="button"
                    className={`checkin__class ${selected ? "is-selected" : ""}`}
                    onClick={() => selectClass(courseClass._id)}
                    aria-pressed={selected}
                  >
                    <span className="checkin__class-main">
                      <strong>{classLabel(courseClass)}</strong>
                      <span>{courseClass.title}</span>
                      <small>
                        {courseClass.defaultRoom?.roomNo || "No room set"} ·{" "}
                        {courseClass.activeStudentCount || 0} active students
                      </small>
                    </span>
                    {selected ? (
                      <Badge variant="primary">Selected</Badge>
                    ) : (
                      <FiChevronRight aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
            <p className="checkin__note">
              The most recent class is selected automatically. One live check-in per class.
            </p>
          </Card>

          <div className="checkin__main">
            {!selectedClass ? (
              <Card title="2. Start or manage the session">
                <EmptyState
                  icon={<FiChevronRight />}
                  title="Choose a class"
                  text="Select a class on the left to see its live session and history."
                />
              </Card>
            ) : sessionsError ? (
              <Card title="2. Start or manage the session">
                <div className="checkin__alert" role="alert">
                  <FiAlertTriangle aria-hidden="true" />
                  <div>
                    <strong>Could not load this class</strong>
                    <p>{sessionsError}</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={refreshSessions}>
                    Retry
                  </Button>
                </div>
              </Card>
            ) : sessionsClassId !== selectedClass._id ? (
              <Card title="2. Start or manage the session">
                <div className="checkin__loading">
                  <Spinner />
                  <p className="checkin__note">Checking for a live round…</p>
                </div>
              </Card>
            ) : activeSession ? (
              <Card
                className="checkin__active"
                title={`Round ${activeSession.wave} is live`}
                subtitle={`${classLabel(selectedClass)} · Room ${roomNo}`}
                actions={<Badge variant="success" dot>Active</Badge>}
              >
                <div className="checkin__console">
                  <div className="checkin__console-main">
                    <p className="checkin__console-kicker">
                      {txPhase === "playing"
                        ? "Sending now"
                        : keyUsable
                        ? "Ready to send"
                        : "Signal expired"}
                    </p>
                    <h3 className="checkin__console-title">
                      {txPhase === "playing"
                        ? "This phone is playing the round signal."
                        : keyUsable
                        ? "Your phone can play this round."
                        : nudge
                        ? "The next signal is still fresh."
                        : "No phone answered this round."}
                    </h3>
                    <p className="checkin__console-copy">
                      {txPhase === "playing"
                        ? "Keep the page visible and the phone at the front. Playback stops automatically; use Stop if you need to end it early."
                        : keyUsable
                        ? "Play when the class is listening. Once a phone's evidence is accepted, it passes the next signal on; later rounds do not need this phone."
                        : nudge
                        ? "Use Nudge the class to send the next signal that a phone already received."
                        : "The signal passed its two-minute lifetime before any phone responded. Close this check-in and start a new one; advancing needs accepted evidence."}
                    </p>

                    <div className="checkin__console-actions">
                      <Button
                        onClick={playCurrentRound}
                        disabled={!keyUsable || signalPlaying}
                        loading={txPhase === "preparing"}
                      >
                        <FiPlay aria-hidden="true" /> Play this round
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={stopSignal}
                        disabled={!signalPlaying}
                      >
                        <FiSquare aria-hidden="true" /> Stop sound
                      </Button>
                      <Button
                        variant="soft"
                        onClick={nudgeClass}
                        disabled={!nudge || signalPlaying}
                      >
                        <FiVolume2 aria-hidden="true" /> Nudge the class
                      </Button>
                    </div>

                    <p className="checkin__note">
                      Nudge is the manual fallback: it plays the next signal if a phone has
                      already received one, otherwise it replays this round.
                    </p>

                    {txError && (
                      <div className="checkin__alert" role="alert">
                        <FiAlertTriangle aria-hidden="true" />
                        <div>
                          <strong>The signal could not play</strong>
                          <p>{txError}</p>
                        </div>
                      </div>
                    )}

                    {notice && !txError && (
                      <p className="checkin__notice" role="status">
                        {notice}
                      </p>
                    )}
                  </div>

                  <div className="checkin__console-side">
                    <div className={`checkin__round-card ${keyUsable ? "is-live" : "is-expired"}`}>
                      <span className="checkin__round-label">This round</span>
                      <strong className="checkin__round-value">
                        {keyUsable ? formatCountdown(remainingMs) : "0:00"}
                      </strong>
                      <span className="checkin__round-hint">
                        {keyUsable ? "signal time left" : "signal expired"}
                      </span>
                    </div>
                    <dl className="checkin__round-stats">
                      <div>
                        <dt>This round</dt>
                        <dd>{currentRoundEvidence} evidence</dd>
                      </div>
                      <div>
                        <dt>All rounds</dt>
                        <dd>{evidence.total} evidence</dd>
                      </div>
                      <div>
                        <dt>Next signal</dt>
                        <dd>
                          {pendingRemainingMs > 0
                            ? `ready · ${formatCountdown(pendingRemainingMs)}`
                            : "not issued"}
                        </dd>
                      </div>
                      {txPlan && (
                        <div>
                          <dt>Last playback</dt>
                          <dd>
                            {txPlayed}/{txPlan.repeats} frames
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                </div>

                <dl className="checkin__meta">
                  <div>
                    <dt>Started</dt>
                    <dd>{formatWhen(activeSession.startedAt)}</dd>
                  </div>
                  <div>
                    <dt>Live for</dt>
                    <dd>{formatDuration(sessionDurationMs(activeSession, now))}</dd>
                  </div>
                  <div>
                    <dt>Room</dt>
                    <dd>{activeSession.room?.roomNo || roomNo}</dd>
                  </div>
                  <div>
                    <dt>Evidence</dt>
                    <dd>
                      {evidence.loading && evidence.total === 0
                        ? "Loading…"
                        : `${evidence.total} signed`}
                    </dd>
                  </div>
                </dl>

                {!keyUsable && !nudge && (
                  <div className="checkin__alert" role="alert">
                    <FiAlertTriangle aria-hidden="true" />
                    <div>
                      <strong>This round expired with no evidence</strong>
                      <p>
                        There is no fresh signal left to play. Close this check-in, then
                        start a new one from the same class.
                      </p>
                    </div>
                  </div>
                )}

                {confirmClose ? (
                  <div className="checkin__confirm" role="alert">
                    <div className="checkin__confirm-icon" aria-hidden="true">
                      <FiAlertTriangle />
                    </div>
                    <div className="checkin__confirm-body">
                      <h3>Close this check-in?</h3>
                      <p>
                        The signal stops being active immediately. The session stays in
                        history, and you can still open the register and decide attendance.
                      </p>
                      <div className="checkin__confirm-actions">
                        <Button
                          variant="danger"
                          onClick={closeActiveSession}
                          loading={closingId === activeSession.id}
                        >
                          <FiCheck aria-hidden="true" /> Confirm close
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setConfirmClose(false)}
                          disabled={Boolean(closingId)}
                        >
                          Keep open
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="checkin__active-footer">
                    <Button
                      variant="danger"
                      onClick={() => {
                        stopSignal();
                        setConfirmClose(true);
                      }}
                      disabled={Boolean(closingId)}
                    >
                      <FiSquare aria-hidden="true" /> Close check-in
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setRegisterSession(activeSession)}
                    >
                      <FiUsers aria-hidden="true" /> Attendance register
                    </Button>
                    <span className="checkin__note">Closing is final for this session.</span>
                  </div>
                )}

                <details className="checkin__advanced">
                  <summary>Advanced controls</summary>
                  <div className="checkin__advanced-body">
                    <p className="checkin__note">
                      Defaults work for most rooms. Repeats, gap and volume apply the next
                      time this phone plays a signal.
                    </p>
                    <div className="checkin__settings">
                      <Field label="Frames per signal" htmlFor="checkin-repeats">
                        <input
                          id="checkin-repeats"
                          className="ui-input"
                          type="number"
                          min={1}
                          max={100}
                          value={signalSettings.repeats}
                          onChange={(event) =>
                            setSignalSettings((current) => ({
                              ...current,
                              repeats: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Gap between frames (ms)" htmlFor="checkin-gap">
                        <input
                          id="checkin-gap"
                          className="ui-input"
                          type="number"
                          min={100}
                          max={5000}
                          step={50}
                          value={signalSettings.gapMs}
                          onChange={(event) =>
                            setSignalSettings((current) => ({
                              ...current,
                              gapMs: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field
                        label={`Volume ${(Number(signalSettings.amplitude) * 100).toFixed(0)}%`}
                        htmlFor="checkin-volume"
                      >
                        <input
                          id="checkin-volume"
                          className="checkin__range"
                          type="range"
                          min={0.05}
                          max={1}
                          step={0.05}
                          value={signalSettings.amplitude}
                          onChange={(event) =>
                            setSignalSettings((current) => ({
                              ...current,
                              amplitude: event.target.value,
                            }))
                          }
                        />
                      </Field>
                    </div>

                    <div className="checkin__advanced-block">
                      <h4>Teacher fallback: advance one round</h4>
                      <p>
                        Automatic advancement needs a signed proof for the next signal. Use
                        this only if a round has accepted evidence and the class is stuck.
                      </p>
                      <Button
                        variant="secondary"
                        onClick={() => setConfirmAdvance(true)}
                        disabled={!canAdvance || confirmAdvance}
                      >
                        <FiChevronRight aria-hidden="true" /> Advance round
                      </Button>
                      {!currentRoundEvidence && (
                        <p className="checkin__note">
                          Waiting for the first accepted evidence in this round.
                        </p>
                      )}
                    </div>

                    <dl className="checkin__advanced-meta">
                      <div>
                        <dt>Current signal issued</dt>
                        <dd>{formatWhen(activeSession.keyIssuedAt)}</dd>
                      </div>
                      <div>
                        <dt>Current signal expires</dt>
                        <dd>{formatWhen(activeSession.keyExpiresAt)}</dd>
                      </div>
                      <div>
                        <dt>Next signal expires</dt>
                        <dd>{formatWhen(activeSession.pending?.keyExpiresAt)}</dd>
                      </div>
                    </dl>

                    {confirmAdvance && (
                      <div className="checkin__confirm" role="alert">
                        <div className="checkin__confirm-icon" aria-hidden="true">
                          <FiAlertTriangle />
                        </div>
                        <div className="checkin__confirm-body">
                          <h3>Advance to round {activeSession.wave + 1}?</h3>
                          <p>
                            This promotes the server-minted next signal if it is still
                            fresh; otherwise a new two-minute signal is minted. The old
                            signal stops being accepted.
                          </p>
                          <div className="checkin__confirm-actions">
                            <Button onClick={advanceWave} loading={advancing}>
                              <FiChevronRight aria-hidden="true" /> Confirm advance
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => setConfirmAdvance(false)}
                              disabled={advancing}
                            >
                              Keep round {activeSession.wave}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              </Card>
            ) : (
              <Card
                title="2. Start a check-in"
                subtitle={`${classLabel(selectedClass)} · ${selectedClass.title}`}
                actions={<Badge variant="neutral">No live session</Badge>}
              >
                {!selectedClass.defaultRoom ? (
                  <div className="checkin__alert" role="alert">
                    <FiAlertTriangle aria-hidden="true" />
                    <div>
                      <strong>This class has no default room</strong>
                      <p>Every session records the room it ran in. Set one before starting.</p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate("/teacher/classes")}
                    >
                      Set room
                    </Button>
                  </div>
                ) : (
                  <div className="checkin__start">
                    <div className="checkin__start-icon" aria-hidden="true">
                      <FiVolume2 />
                    </div>
                    <h3>Ready for {classLabel(selectedClass)}?</h3>
                    <p className="checkin__note">
                      One tap starts the session and plays round 0 from this phone. No
                      location permission is needed. The signal expires after two minutes.
                    </p>
                    <Button
                      size="lg"
                      block
                      onClick={startSession}
                      loading={starting}
                      disabled={Boolean(activeSession)}
                    >
                      Start and play round 0
                    </Button>
                    <p className="checkin__note">
                      If another tab already started this class, this screen shows the live
                      round instead of creating a duplicate.
                    </p>
                  </div>
                )}
              </Card>
            )}
          </div>
        </section>
      )}

      {evidenceSession && (
        <Card
          className="checkin__evidence"
          title="Evidence received"
          subtitle={`${classLabel(evidenceSession)} · ${
            evidenceSession.status === "active" ? "Live" : "Closed"
          } · Round ${evidenceSession.wave}`}
          actions={
            <div className="checkin__evidence-actions">
              <Badge variant="neutral">
                {evidence.total} evidence
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => loadEvidence(evidenceSession.id)}
                loading={evidence.loading}
              >
                <FiRefreshCw aria-hidden="true" /> Refresh
              </Button>
            </div>
          }
        >
          {evidence.error ? (
            <div className="checkin__alert" role="alert">
              <FiAlertTriangle aria-hidden="true" />
              <div>
                <strong>Could not load the evidence</strong>
                <p>{evidence.error}</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => loadEvidence(evidenceSession.id)}
              >
                Retry
              </Button>
            </div>
          ) : evidence.loading && evidence.proofs.length === 0 ? (
            <div className="checkin__loading">
              <Spinner />
              <p className="checkin__note">Loading signed evidence…</p>
            </div>
          ) : evidence.total === 0 ? (
            <EmptyState
              icon={<FiCheck />}
              title="No evidence yet"
              text="Ask students to open Check-in while the round signal is playing. Only evidence submitted for this session appears here."
            />
          ) : (
            <>
              <div className="checkin__evidence-summary">
                {evidence.byWave.map((entry) => (
                  <Badge key={entry.wave} variant="info">
                    Round {entry.wave} · {entry.count}
                  </Badge>
                ))}
              </div>
              <div className="checkin__evidence-list">
                {evidence.proofs.map((proof) => (
                  <div className="checkin__evidence-row" key={proof.id}>
                    <span className="checkin__evidence-email">{proof.studentEmail}</span>
                    <span className="checkin__evidence-meta">
                      <Badge variant="neutral">Round {proof.wave}</Badge>
                      <time dateTime={proof.recordedAt || undefined}>
                        {formatWhen(proof.recordedAt)}
                      </time>
                    </span>
                  </div>
                ))}
              </div>
              <p className="checkin__note">
                Evidence only. This list does not decide attendance, and proof evidence
                expires after about 24 hours.
              </p>
            </>
          )}
        </Card>
      )}

      {selectedClass && !sessionsError && history.length > 0 && (
        <Card
          className="checkin__history"
          title="Session history"
          subtitle={`${history.length} closed session${history.length === 1 ? "" : "s"} for ${classLabel(
            selectedClass
          )} (newest first, up to 50).`}
          actions={
            <Button variant="ghost" size="sm" onClick={refreshSessions} loading={sessionsLoading}>
              <FiRefreshCw aria-hidden="true" /> Refresh
            </Button>
          }
        >
          <div className="checkin__history-list">
            {history.map((session) => (
              <article key={session.id} className="checkin__history-row">
                <div className="checkin__history-main">
                  <strong>{formatWhen(session.startedAt)}</strong>
                  <small>
                    Closed {formatWhen(session.closedAt)} · {session.room?.roomNo || "No room"}
                  </small>
                </div>
                <div className="checkin__history-meta">
                  <Badge variant="neutral">Round {session.wave}</Badge>
                  <span>{formatDuration(sessionDurationMs(session, now))}</span>
                  <Badge variant="neutral" dot>
                    Closed
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEvidenceSessionId(session.id)}
                  >
                    Evidence
                  </Button>
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => setRegisterSession(session)}
                  >
                    <FiUsers aria-hidden="true" /> Register
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </Card>
      )}

      <SessionAttendanceModal
        open={Boolean(registerSession)}
        session={registerSession}
        mode="teacher"
        onClose={() => setRegisterSession(null)}
        onChanged={refreshSessions}
      />

      <p className="checkin__footer">
        This screen starts and closes sessions and shows the evidence received. Evidence
        never decides attendance; the register does.
      </p>
    </AppShell>
  );
};

export default CheckInSessions;
