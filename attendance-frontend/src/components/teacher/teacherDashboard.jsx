import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { FaChalkboardTeacher, FaUserGraduate, FaMobileAlt, FaClipboardList } from "react-icons/fa";
import SERVER_URL from "../../config/api";
import AppShell from "../../ui/AppShell";
import Badge from "../../ui/Badge";
import Button from "../../ui/Button";
import Card from "../../ui/Card";
import EmptyState from "../../ui/EmptyState";
import { PageLoader } from "../../ui/Spinner";
import StatCard from "../../ui/StatCard";
import { useToast } from "../../ui/Toast";
import { classLabel, formatDateTime, givenName, percentLabel } from "../../utils/format";
import "./teacherDashboard.css";

const requestConfig = { withCredentials: true };

const TeacherDashboard = () => {
    const navigate = useNavigate();
    const toast = useToast();
    const [user, setUser] = useState(null);
    const [classes, setClasses] = useState([]);
    const [pendingReviews, setPendingReviews] = useState(0);
    const [pendingQueries, setPendingQueries] = useState(0);
    const [recentSessions, setRecentSessions] = useState([]);

    useEffect(() => {
        const load = async () => {
            try {
                const userResponse = await axios.get(`${SERVER_URL}/islogin`, requestConfig);
                if (userResponse.data.user.role !== "teacher") {
                    navigate("/student-dashboard");
                    return;
                }
                setUser(userResponse.data.user);

                const [classesResult, reviewsResult, queriesResult, sessionsResult] = await Promise.allSettled([
                    axios.get(`${SERVER_URL}/classes`, requestConfig),
                    axios.get(`${SERVER_URL}/device-reviews`, requestConfig),
                    axios.get(`${SERVER_URL}/queries/review`, requestConfig),
                    axios.get(`${SERVER_URL}/attendance/sessions?limit=5`, requestConfig),
                ]);
                if (classesResult.status === "fulfilled") {
                    setClasses(classesResult.value.data.classes);
                } else {
                    toast("Could not load your classes.", "error");
                }
                if (reviewsResult.status === "fulfilled") {
                    setPendingReviews(reviewsResult.value.data.reviews.length);
                } else {
                    toast("Could not load device reviews.", "error");
                }
                if (queriesResult.status === "fulfilled") {
                    setPendingQueries(Number(queriesResult.value.data?.counts?.pending) || 0);
                }
                if (sessionsResult.status === "fulfilled") {
                    setRecentSessions(Array.isArray(sessionsResult.value.data?.sessions) ? sessionsResult.value.data.sessions : []);
                }
            } catch (error) {
                navigate("/login");
            }
        };
        load();
    }, [navigate, toast]);

    const handleLogout = useCallback(async () => {
        try {
            await axios.post(`${SERVER_URL}/logout`, null, requestConfig);
        } catch (error) {
            // Sign-out is best-effort; the local session ends either way.
        }
        navigate("/");
        toast("Signed out. See you next class!", "success");
    }, [navigate, toast]);

    if (!user) {
        return <PageLoader label="Loading your dashboard…" />;
    }

    const name = user.name || user.email.split("@")[0];
    const firstName = givenName(name);
    const studentCount = classes.reduce((sum, courseClass) => sum + (courseClass.activeStudentCount || 0), 0);

    return (
        <AppShell
            role="teacher"
            name={name}
            email={user.email}
            onLogout={handleLogout}
        >
            <div className="ui-page-head">
                <div>
                    <h1 className="ui-page-head__title">Welcome, {firstName}</h1>
                    <p className="ui-page-head__sub">
                        Run your classes, keep rosters current, and approve student devices before check-ins begin.
                    </p>
                </div>
                <div className="ui-page-head__actions">
                    <Button variant="secondary" onClick={() => navigate("/teacher/classes")}>
                        Manage classes &amp; rosters
                    </Button>
                    <Button onClick={() => navigate("/teacher/check-in")}>Run a check-in</Button>
                </div>
            </div>

            <div className="ui-grid ui-grid--stats">
                <StatCard icon={<FaChalkboardTeacher />} tone="indigo" label="Classes" value={classes.length} hint="Created by you" />
                <StatCard icon={<FaUserGraduate />} tone="sky" label="Active students" value={studentCount} hint="Across your rosters" />
                <StatCard
                    icon={<FaMobileAlt />}
                    tone={pendingReviews > 0 ? "amber" : "emerald"}
                    label="Pending device reviews"
                    value={pendingReviews}
                    hint={pendingReviews > 0 ? "Waiting for your approval" : "All clear"}
                />
                <StatCard
                    icon={<FaClipboardList />}
                    tone={pendingQueries > 0 ? "amber" : "emerald"}
                    label="Pending queries"
                    value={pendingQueries}
                    hint={pendingQueries > 0 ? "Attendance corrections to review" : "No corrections waiting"}
                />
            </div>

            <div className="teacher-grid">
                <Card
                    title="Recent classes"
                    subtitle="Your newest classes and their active roster counts."
                    actions={<Button variant="ghost" size="sm" onClick={() => navigate("/teacher/classes")}>View all</Button>}
                >
                    {classes.length === 0 ? (
                        <EmptyState
                            icon="🏫"
                            title="No classes yet"
                            text="Create your first class and paste its roster — check-ins will be attributed to these students."
                            action={<Button variant="soft" onClick={() => navigate("/teacher/classes")}>Create a class</Button>}
                        />
                    ) : (
                        <ul className="class-list">
                            {classes.slice(0, 4).map((courseClass) => (
                                <li key={courseClass._id}>
                                    <button type="button" className="class-list__item" onClick={() => navigate("/teacher/classes")}>
                                        <span className="class-list__main">
                                            <span className="class-list__title">
                                                {courseClass.title}
                                                <span className="class-list__code">
                                                    {courseClass.courseCode}{courseClass.section ? ` · ${courseClass.section}` : ""}
                                                </span>
                                            </span>
                                            <span className="class-list__meta">Room {courseClass.defaultRoom?.roomNo || "—"}</span>
                                        </span>
                                        <Badge variant="neutral">{courseClass.activeStudentCount || 0} students</Badge>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>

                <Card title="Quick actions" subtitle="The things you’ll do most often.">
                    <div className="quick-actions">
                        <button type="button" className="quick-action" onClick={() => navigate("/teacher/check-in")}>
                            <span className="quick-action__icon" aria-hidden="true">📣</span>
                            <span className="quick-action__body">
                                <strong>Run a check-in</strong>
                                <small>Start a session and play its wave-0 key from the front</small>
                            </span>
                        </button>
                        <button type="button" className="quick-action" onClick={() => navigate("/teacher/classes")}>
                            <span className="quick-action__icon" aria-hidden="true">👥</span>
                            <span className="quick-action__body">
                                <strong>Classes & rosters</strong>
                                <small>Create classes, paste rosters, review new devices</small>
                            </span>
                        </button>
                        <button type="button" className="quick-action" onClick={() => navigate("/queries")}>
                            <span className="quick-action__icon" aria-hidden="true">🩺</span>
                            <span className="quick-action__body">
                                <strong>Query centre</strong>
                                <small>Review missed-attendance claims with location evidence</small>
                            </span>
                        </button>
                        <button type="button" className="quick-action" onClick={() => navigate("/teacher/sessions")}>
                            <span className="quick-action__icon" aria-hidden="true">📚</span>
                            <span className="quick-action__body">
                                <strong>Session history</strong>
                                <small>Open a register, finalise attendance and audit decisions</small>
                            </span>
                        </button>
                        <button type="button" className="quick-action" onClick={() => navigate("/acoustic-lab")}>
                            <span className="quick-action__icon" aria-hidden="true">🔊</span>
                            <span className="quick-action__body">
                                <strong>Phone audio test</strong>
                                <small>Check that a phone can play and hear the key tones</small>
                            </span>
                        </button>
                        <button type="button" className="quick-action" onClick={() => navigate("/acoustic-tx")}>
                            <span className="quick-action__icon" aria-hidden="true">📡</span>
                            <span className="quick-action__body">
                                <strong>Two-phone link test</strong>
                                <small>Send frames on one phone and decode them on the other</small>
                            </span>
                        </button>
                    </div>
                </Card>
            </div>

            <div style={{ marginTop: 18 }}>
                <Card
                    title="Recent sessions"
                    subtitle="Open a register to finalise attendance, inspect evidence or review a query."
                    actions={<Button variant="ghost" size="sm" onClick={() => navigate("/teacher/sessions")}>Full history</Button>}
                >
                    {recentSessions.length === 0 ? (
                        <EmptyState
                            icon="🎧"
                            title="No sessions yet"
                            text="Start a check-in from the Check-in page; closed sessions appear here with their register state."
                            action={<Button variant="soft" onClick={() => navigate("/teacher/check-in")}>Run a check-in</Button>}
                        />
                    ) : (
                        <div className="data-table-wrap">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Started</th>
                                        <th>Class</th>
                                        <th>Status</th>
                                        <th>Attendance</th>
                                        <th>Queries</th>
                                        <th />
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentSessions.map((session) => (
                                        <tr key={session.id}>
                                            <td>
                                                <div className="data-table__main">{formatDateTime(session.startedAt)}</div>
                                                <div className="data-table__sub">Room {session.roomNo || session.room?.roomNo || "—"}</div>
                                            </td>
                                            <td>
                                                <div className="data-table__main">{classLabel(session.class)}</div>
                                                <div className="data-table__sub">{session.class?.title || ""}</div>
                                            </td>
                                            <td>
                                                <div className="chip-row">
                                                    <Badge variant={session.status === "active" ? "success" : "neutral"} dot>
                                                        {session.status}
                                                    </Badge>
                                                    {session.attendanceFinalized ? (
                                                        <Badge variant="success">Finalised</Badge>
                                                    ) : (
                                                        <Badge variant="warning">Pending</Badge>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <div className="data-table__main">{percentLabel(session.attendanceSummary?.percentage)}</div>
                                                <div className="data-table__sub">
                                                    {session.attendanceSummary?.present || 0} present · {session.attendanceSummary?.pending || 0} pending
                                                </div>
                                            </td>
                                            <td>
                                                <Badge variant={session.queries?.pending ? "warning" : "neutral"}>
                                                    {session.queries?.pending || 0} waiting
                                                </Badge>
                                            </td>
                                            <td>
                                                <div className="data-table__actions">
                                                    <Button variant="soft" size="sm" onClick={() => navigate("/teacher/sessions")}>
                                                        Register
                                                    </Button>
                                                    <Button variant="ghost" size="sm" onClick={() => navigate("/queries")}>
                                                        Queries
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>
        </AppShell>
    );
};

export default TeacherDashboard;
