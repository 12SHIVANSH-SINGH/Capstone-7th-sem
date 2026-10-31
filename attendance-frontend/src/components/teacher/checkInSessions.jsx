import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  FiAlertTriangle,
  FiCheck,
  FiChevronRight,
  FiCopy,
  FiKey,
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
import { PageLoader, Spinner } from "../../ui/Spinner";
import { useToast } from "../../ui/Toast";
import { buildTransmitSearch } from "../../acoustic/transmitPlan";
import { copyText } from "../acousticLab/linkUtils";
import {
  findActiveSession,
  formatCountdown,
  formatDuration,
  keyIsUsable,
  keyRemainingMs,
  sessionDurationMs,
  upsertSession,
} from "./checkInSessionView";
import "./checkInSessions.css";

const requestConfig = { withCredentials: true };

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

const transmitterPath = (key) => `/acoustic-tx?${buildTransmitSearch(key, "checkin")}`;

const CheckInSessions = () => {
  const navigate = useNavigate();
  const toast = useToast();

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
  // the teacher asks to inspect an older session, but a newly started active
  // session wins over an old closed one.
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

  useEffect(() => {
    if (!activeSession?.id || evidenceSessionId !== activeSession.id) return undefined;
    const timer = window.setInterval(
      () => loadEvidence(activeSession.id, { quiet: true }),
      10 * 1000
    );
    return () => window.clearInterval(timer);
  }, [activeSession?.id, evidenceSessionId, loadEvidence]);

  const remainingMs = activeSession ? keyRemainingMs(activeSession, now) : 0;
  const keyUsable = activeSession ? keyIsUsable(activeSession, now) : false;

  const selectClass = (classId) => {
    if (!classId || classId === selectedClassId) return;
    sessionsRequestRef.current += 1;
    setSelectedClassId(classId);
    setSessions([]);
    setSessionsClassId("");
    setSessionsError("");
    setSessionsLoading(true);
    setConfirmClose(false);
    setConfirmAdvance(false);
  };

  const startSession = async () => {
    if (!selectedClass?._id || starting || activeSession) return;
    setStarting(true);

    try {
      const response = await axios.post(
        `${SERVER_URL}/classes/${selectedClass._id}/check-in-sessions`,
        {},
        requestConfig
      );
      if (response.data?.session) {
        setSessions((current) => upsertSession(current, response.data.session));
        setEvidenceSessionId(response.data.session.id);
      }
      setConfirmClose(false);
      setConfirmAdvance(false);
      setNow(new Date());
      toast("Check-in started. Wave 0 is ready to play.", "success");
    } catch (requestError) {
      if (isUnauthorised(requestError)) {
        navigate("/login");
        return;
      }
      if (requestError?.response?.status === 409) {
        toast("This class already has an active check-in. Reloading it now.", "error");
        await loadSessions(selectedClass._id, { quiet: true });
      } else {
        toast(messageFor(requestError, "Could not start the check-in."), "error");
      }
    } finally {
      setStarting(false);
    }
  };

  const closeActiveSession = async () => {
    if (!activeSession?.id || closingId) return;
    setClosingId(activeSession.id);

    try {
      const response = await axios.post(
        `${SERVER_URL}/check-in-sessions/${activeSession.id}/close`,
        {},
        requestConfig
      );
      if (response.data?.session) {
        setSessions((current) => upsertSession(current, response.data.session));
      }
      setConfirmClose(false);
      toast("Check-in closed. That key is no longer active.", "success");
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
        setSessions((current) => upsertSession(current, response.data.session));
        setEvidenceSessionId(response.data.session.id);
        setConfirmAdvance(false);
        setNow(new Date());
        toast(
          `Wave ${response.data.session.wave} is live. Open the transmitter with the new key.`,
          "success"
        );
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
          "Could not advance the wave. Wait for a phone to submit evidence first."
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

  const copyKey = async () => {
    if (!activeSession) return;
    const copied = await copyText(String(activeSession.key));
    toast(
      copied
        ? "Session key copied."
        : "Could not copy the key. Read it from this screen instead.",
      copied ? "success" : "error"
    );
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

  return (
    <AppShell
      role="teacher"
      name={name}
      email={user.email}
      onLogout={handleLogout}
      links={[
        { to: "/teacher-dashboard", label: "Dashboard" },
        { to: "/teacher/classes", label: "Classes & rosters" },
        { to: "/teacher/check-in", label: "Check-in", active: true },
        { to: "/acoustic-lab", label: "Phone audio test" },
      ]}
    >
      <div className="ui-page-head">
        <div>
          <h1 className="ui-page-head__title">Run a check-in</h1>
          <p className="ui-page-head__sub">
            Pick a class, start the live session, and play its current wave key from this phone.
            Advance the wave only after at least one phone records evidence. The key never leaves
            the teacher side.
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
          <strong>Teacher phone at the front.</strong> Keep it 1 m to 10 m from student phones and
          play the key long enough for them to listen. Students never receive the key itself.
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
              One active session per class. Closed sessions stay in history.
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
                  <p className="checkin__note">Checking for a live session…</p>
                </div>
              </Card>
            ) : activeSession ? (
              <Card
                className="checkin__active"
                title="2. Check-in is live"
                subtitle={`${classLabel(selectedClass)} · Room ${roomNo}`}
                actions={<Badge variant="success" dot>Active</Badge>}
              >
                <div className="checkin__key-panel">
                  <div className="checkin__key-head">
                    <span className="checkin__key-label">
                      <FiKey aria-hidden="true" /> Wave {activeSession.wave} key
                    </span>
                    <Badge variant={keyUsable ? "info" : "warning"}>
                      {keyUsable ? `Expires in ${formatCountdown(remainingMs)}` : "Key expired"}
                    </Badge>
                  </div>

                  <div className="checkin__key" aria-label={`Session key ${activeSession.key}`}>
                    {activeSession.key}
                  </div>

                  <div className="checkin__key-actions">
                    <Button variant="secondary" onClick={copyKey}>
                      <FiCopy aria-hidden="true" /> Copy key
                    </Button>
                    <Button
                      onClick={() => navigate(transmitterPath(activeSession.key))}
                      disabled={!keyUsable}
                    >
                      <FiVolume2 aria-hidden="true" /> Open transmitter
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setConfirmAdvance(true)}
                      disabled={advancing || confirmClose}
                    >
                      <FiChevronRight aria-hidden="true" /> Advance wave
                    </Button>
                  </div>

                  {confirmAdvance && (
                    <div className="checkin__confirm" role="alert">
                      <div className="checkin__confirm-icon" aria-hidden="true">
                        <FiAlertTriangle />
                      </div>
                      <div className="checkin__confirm-body">
                        <h3>Advance to wave {activeSession.wave + 1}?</h3>
                        <p>
                          The current key stops being accepted and a fresh two-minute key is
                          minted. Advance only after at least one phone has recorded evidence.
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
                            Keep wave {activeSession.wave}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  <p className={keyUsable ? "checkin__key-note" : "checkin__key-warning"}>
                    {keyUsable
                      ? "The transmitter opens with this key already filled in. Play it once students are listening. Advance the wave after at least one phone records evidence."
                      : "This key passed its two-minute lifetime. Wait for a phone to record evidence, then advance the wave; closing the session ends the check-in."}
                  </p>
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
                    <dt>Key issued</dt>
                    <dd>{formatWhen(activeSession.keyIssuedAt)}</dd>
                  </div>
                  <div>
                    <dt>Evidence</dt>
                    <dd>
                      {evidence.loading && evidence.total === 0
                        ? "Loading…"
                        : `${evidence.total} proof${evidence.total === 1 ? "" : "s"}`}
                    </dd>
                  </div>
                </dl>

                {confirmClose ? (
                  <div className="checkin__confirm" role="alert">
                    <div className="checkin__confirm-icon" aria-hidden="true">
                      <FiAlertTriangle />
                    </div>
                    <div className="checkin__confirm-body">
                      <h3>Close this check-in?</h3>
                      <p>
                        The key stops being active immediately. The session stays in history and
                        cannot be restarted.
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
                      onClick={() => setConfirmClose(true)}
                      disabled={Boolean(closingId)}
                    >
                      <FiSquare aria-hidden="true" /> Close check-in
                    </Button>
                    <span className="checkin__note">Closing is final for this session.</span>
                  </div>
                )}
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
                      Starting mints wave 0 and a fresh key that expires after two minutes. The key
                      stays on this phone; students only hear the tones.
                    </p>
                    <Button
                      size="lg"
                      block
                      onClick={startSession}
                      loading={starting}
                      disabled={Boolean(activeSession)}
                    >
                      Start check-in
                    </Button>
                    <p className="checkin__note">
                      If another tab already started this class, this screen reloads the live
                      session instead of creating a duplicate.
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
          } · Wave ${evidenceSession.wave}`}
          actions={
            <div className="checkin__evidence-actions">
              <Badge variant="neutral">
                {evidence.total} proof{evidence.total === 1 ? "" : "s"}
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
              text="Ask students to open Check-in while the wave key is live. Only evidence submitted for this session appears here."
            />
          ) : (
            <>
              <div className="checkin__evidence-summary">
                {evidence.byWave.map((entry) => (
                  <Badge key={entry.wave} variant="info">
                    Wave {entry.wave} · {entry.count}
                  </Badge>
                ))}
              </div>
              <div className="checkin__evidence-list">
                {evidence.proofs.map((proof) => (
                  <div className="checkin__evidence-row" key={proof.id}>
                    <span className="checkin__evidence-email">{proof.studentEmail}</span>
                    <span className="checkin__evidence-meta">
                      <Badge variant="neutral">Wave {proof.wave}</Badge>
                      <time dateTime={proof.recordedAt || undefined}>
                        {formatWhen(proof.recordedAt)}
                      </time>
                    </span>
                  </div>
                ))}
              </div>
              <p className="checkin__note">
                Evidence only. This list does not decide attendance, and proof evidence expires
                after about 24 hours.
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
                  <Badge variant="neutral">Wave {session.wave}</Badge>
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
                </div>
              </article>
            ))}
          </div>
        </Card>
      )}

      <p className="checkin__footer">
        This screen starts and closes sessions, advances waves after accepted evidence, and shows
        the evidence received. It does not score attendance or run the ID round.
      </p>
    </AppShell>
  );
};

export default CheckInSessions;
