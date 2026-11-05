import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  FiBarChart2,
  FiCalendar,
  FiClock,
  FiHelpCircle,
  FiRefreshCw,
} from "react-icons/fi";
import SERVER_URL from "../../config/api";
import AppShell from "../../ui/AppShell";
import Badge from "../../ui/Badge";
import Button from "../../ui/Button";
import Card from "../../ui/Card";
import { PageLoader } from "../../ui/Spinner";
import { useToast } from "../../ui/Toast";
import { classLabel, formatDateTime, percentLabel, relativeTime, givenName } from "../../utils/format";
import { sessionLabel, sessionTitle } from "./studentCheckInView";
import "./studentDashboard.css";

const STATUS_VIEW = {
    approved: {
        badge: "Approved",
        variant: "success",
        icon: "✓",
        title: "This browser is approved",
        text: "Your device is bound and approved. Open Check-in while your teacher’s session is live; hearing the key records evidence, not attendance.",
    },
    review: {
        badge: "In review",
        variant: "warning",
        icon: "⌛",
        title: "Waiting for teacher review",
        text: "A teacher needs to approve this browser before it can submit proof. The request stays here until they do.",
    },
    unbound: {
        badge: "Not bound",
        variant: "danger",
        icon: "⚠",
        title: "This browser isn’t bound yet",
        text: "Sign in again with your college Google account to bind this browser to your attendance.",
    },
    checking: {
        badge: "Checking…",
        variant: "neutral",
        icon: "…",
        title: "Checking this device…",
        text: "One moment while we look up this browser’s binding.",
    },
};

const StudentDashboard = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();
    const [user, setUser] = useState(null);
    const [deviceStatus, setDeviceStatus] = useState(location.state?.deviceStatus || "checking");
    const [liveSessions, setLiveSessions] = useState([]);
    const [attendance, setAttendance] = useState(null);
    const [recentSessions, setRecentSessions] = useState([]);
    const [snapshotLoading, setSnapshotLoading] = useState(false);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const response = await axios.get(`${SERVER_URL}/islogin`, { withCredentials: true });
                if (response.data.user.role === "teacher") {
                    navigate("/teacher-dashboard");
                    return;
                }
                setUser(response.data.user);
                const bindingResponse = await axios.get(`${SERVER_URL}/device-bindings/status`, { withCredentials: true });
                setDeviceStatus(bindingResponse.data.status);
                try {
                    const sessionResponse = await axios.get(
                        `${SERVER_URL}/student/check-in-sessions/active`,
                        { withCredentials: true }
                    );
                    setLiveSessions(
                        Array.isArray(sessionResponse.data?.sessions) ? sessionResponse.data.sessions : []
                    );
                } catch (sessionError) {
                    // A failed discovery lookup must not hide the dashboard.
                    if (sessionError.response?.status === 401) {
                        navigate("/login");
                        return;
                    }
                    setLiveSessions([]);
                }

                setSnapshotLoading(true);
                const [attendanceResult, sessionResult] = await Promise.allSettled([
                    axios.get(`${SERVER_URL}/attendance/me`, { withCredentials: true }),
                    axios.get(`${SERVER_URL}/attendance/me/sessions`, { withCredentials: true }),
                ]);
                if (attendanceResult.status === "fulfilled") {
                    setAttendance(attendanceResult.value.data || null);
                }
                if (sessionResult.status === "fulfilled") {
                    setRecentSessions(
                        Array.isArray(sessionResult.value.data?.sessions)
                            ? sessionResult.value.data.sessions
                            : []
                    );
                }
                setSnapshotLoading(false);
            } catch (error) {
                if (error.response?.status && error.response.status !== 401) {
                    toast("Could not load your dashboard. Please try again.", "error");
                }
                navigate("/login");
            }
        };
        fetchUser();
    }, [navigate, toast]);

    const handleLogout = useCallback(async () => {
        try {
            await axios.post(`${SERVER_URL}/logout`, null, { withCredentials: true });
        } catch (error) {
            // Sign-out is best-effort; the local session ends either way.
        }
        navigate("/");
        toast("Signed out. See you next class!", "success");
    }, [navigate, toast]);

    if (!user) {
        return <PageLoader label="Loading your dashboard…" />;
    }

    const info = STATUS_VIEW[deviceStatus] || STATUS_VIEW.checking;
    const name = user.name || user.email.split("@")[0];
    const firstName = givenName(name);

    return (
        <AppShell
            role="student"
            name={name}
            email={user.email}
            onLogout={handleLogout}
        >
            <div className="ui-page-head">
                <div>
                    <h1 className="ui-page-head__title">Hi {firstName} 👋</h1>
                    <p className="ui-page-head__sub">
                        This is your attendance home. Open Check-in while your teacher’s session is live, or test this phone’s audio before class.
                    </p>
                </div>
            </div>

            <div className="student-grid">
                <Card className={`device-card device-card--${deviceStatus}`}>
                    <div className="device-card__top">
                        <span className="device-card__icon" aria-hidden="true">{info.icon}</span>
                        <Badge variant={info.variant} dot>{info.badge}</Badge>
                    </div>
                    <h2 className="device-card__title">{info.title}</h2>
                    <p className="device-card__text">{info.text}</p>
                    <div className="device-card__actions">
                        <Button onClick={() => navigate("/student/check-in")}>Open check-in</Button>
                        <Button variant="soft" onClick={() => navigate("/acoustic-lab")}>🔊 Test phone audio</Button>
                    </div>
                </Card>

                <Card
                    className="device-card student-live-card"
                    title={liveSessions.length > 0 ? "A check-in is live" : "No live check-in yet"}
                    subtitle={
                        liveSessions.length > 0
                            ? `${sessionLabel(liveSessions[0])} · ${sessionTitle(liveSessions[0])}`
                            : "Open Check-in and it will keep looking for your teacher’s session."
                    }
                >
                    {liveSessions.length > 0 ? (
                        <>
                            <p className="device-card__text">
                                Your teacher has an active wave for {sessionLabel(liveSessions[0])}. Open check-in
                                before the two-minute key expires. Hearing the key records evidence, not attendance.
                            </p>
                            <div className="device-card__actions">
                                <Button onClick={() => navigate("/student/check-in")}>Join check-in</Button>
                            </div>
                        </>
                    ) : (
                        <>
                            <ol className="checkin-steps">
                                <li>
                                    <strong>Open Check-in.</strong>
                                    The page refreshes every ten seconds while you wait.
                                </li>
                                <li>
                                    <strong>Listen for the current wave.</strong>
                                    Keep the page visible and allow the microphone.
                                </li>
                                <li>
                                    <strong>See the evidence.</strong>
                                    The server records the signed proof; your teacher decides attendance later.
                                </li>
                            </ol>
                            <div className="device-card__actions">
                                <Button variant="soft" onClick={() => navigate("/student/check-in")}>Open check-in</Button>
                            </div>
                        </>
                    )}
                </Card>
            </div>

            <div className="page-stack" style={{ marginTop: 18 }}>
                <div className="metric-strip">
                    <div className="metric metric--indigo">
                        <div className="metric__label">Overall attendance</div>
                        <div className="metric__value">{percentLabel(attendance?.summary?.percentage)}</div>
                        <div className="metric__hint">{attendance?.summary?.present || 0} present · {attendance?.summary?.absent || 0} absent</div>
                    </div>
                    <div className="metric">
                        <div className="metric__label">Classes</div>
                        <div className="metric__value">{attendance?.classes?.length || 0}</div>
                        <div className="metric__hint">{attendance?.summary?.pending || 0} rows pending</div>
                    </div>
                    <div className="metric metric--warning">
                        <div className="metric__label">Query window</div>
                        <div className="metric__value">{recentSessions.filter((session) => session.canRaiseQuery).length}</div>
                        <div className="metric__hint">Closed sessions you can query</div>
                    </div>
                    <div className="metric metric--success">
                        <div className="metric__label">Approved corrections</div>
                        <div className="metric__value">{attendance?.queries?.filter((query) => query.status === "approved").length || 0}</div>
                        <div className="metric__hint">Counted as present</div>
                    </div>
                </div>

                <div className="page-grid page-grid--2">
                    <Card
                        title="Recent sessions"
                        subtitle="After a session closes you have 24 hours to correct a missed mark."
                        actions={<Button variant="ghost" size="sm" onClick={() => navigate("/attendance")}><FiBarChart2 aria-hidden="true" /> Analytics</Button>}
                    >
                        {snapshotLoading ? (
                            <div className="loading-inline"><FiRefreshCw aria-hidden="true" /> Loading your attendance…</div>
                        ) : recentSessions.length === 0 ? (
                            <p className="empty-inline">No closed sessions yet. Your first register appears here after class.</p>
                        ) : (
                            <div className="query-list">
                                {recentSessions.slice(0, 4).map((session) => (
                                    <div className={`query-card ${session.canRaiseQuery ? "query-card--pending" : ""}`} key={session.id}>
                                        <div className="query-card__head">
                                            <div>
                                                <h3 className="query-card__title">{classLabel(session.class)}</h3>
                                                <p className="query-card__sub">
                                                    {formatDateTime(session.startedAt)} · {session.attendance?.status || "not on register"}
                                                </p>
                                            </div>
                                            {session.canRaiseQuery ? (
                                                <Badge variant="warning" dot>Window open</Badge>
                                            ) : session.query ? (
                                                <Badge variant={session.query.status === "approved" ? "success" : session.query.status === "rejected" ? "danger" : "neutral"}>
                                                    Query {session.query.status}
                                                </Badge>
                                            ) : session.attendance?.status === "present" ? (
                                                <Badge variant="success">Present</Badge>
                                            ) : (
                                                <Badge variant="neutral">Closed</Badge>
                                            )}
                                        </div>
                                        <div className="query-card__foot">
                                            <span className="query-window">
                                                <FiClock aria-hidden="true" /> {session.windowOpen ? `Query window ends ${relativeTime(session.queryWindowEndsAt)}` : "Review window closed"}
                                            </span>
                                            {session.canRaiseQuery ? (
                                                <Link className="ui-btn ui-btn--soft ui-btn--sm" to="/queries">Raise query</Link>
                                            ) : (
                                                <Link className="ui-btn ui-btn--ghost ui-btn--sm" to="/queries">Open queries</Link>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>

                    <Card title="Quick actions" subtitle="Everything a student needs between classes.">
                        <div className="page-stack">
                            <Link className="ui-btn ui-btn--primary ui-btn--block" to="/student/check-in">Open check-in</Link>
                            <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/queries"><FiHelpCircle aria-hidden="true" /> Queries &amp; corrections</Link>
                            <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/attendance"><FiBarChart2 aria-hidden="true" /> My attendance</Link>
                            <Link className="ui-btn ui-btn--secondary ui-btn--block" to="/timetable"><FiCalendar aria-hidden="true" /> Timetable</Link>
                            <Link className="ui-btn ui-btn--ghost ui-btn--block" to="/help">How check-in works</Link>
                        </div>
                    </Card>
                </div>
            </div>
        </AppShell>
    );
};

export default StudentDashboard;
