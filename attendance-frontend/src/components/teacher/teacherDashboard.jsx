import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { FaChalkboardTeacher, FaUserGraduate, FaMobileAlt } from "react-icons/fa";
import SERVER_URL from "../../config/api";
import AppShell from "../../ui/AppShell";
import Badge from "../../ui/Badge";
import Button from "../../ui/Button";
import Card from "../../ui/Card";
import EmptyState from "../../ui/EmptyState";
import { PageLoader } from "../../ui/Spinner";
import StatCard from "../../ui/StatCard";
import { useToast } from "../../ui/Toast";
import "./teacherDashboard.css";

const requestConfig = { withCredentials: true };

const TeacherDashboard = () => {
    const navigate = useNavigate();
    const toast = useToast();
    const [user, setUser] = useState(null);
    const [classes, setClasses] = useState([]);
    const [pendingReviews, setPendingReviews] = useState(0);

    useEffect(() => {
        const load = async () => {
            try {
                const userResponse = await axios.get(`${SERVER_URL}/islogin`, requestConfig);
                if (userResponse.data.user.role !== "teacher") {
                    navigate("/student-dashboard");
                    return;
                }
                setUser(userResponse.data.user);

                const [classesResult, reviewsResult] = await Promise.allSettled([
                    axios.get(`${SERVER_URL}/classes`, requestConfig),
                    axios.get(`${SERVER_URL}/device-reviews`, requestConfig),
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
            } catch (error) {
                navigate("/login");
            }
        };
        load();
    }, [navigate, toast]);

    const handleLogout = useCallback(async () => {
        try {
            await axios.get(`${SERVER_URL}/logout`, requestConfig);
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
    const firstName = name.split(" ")[0];
    const studentCount = classes.reduce((sum, courseClass) => sum + (courseClass.activeStudentCount || 0), 0);

    return (
        <AppShell
            role="teacher"
            name={name}
            email={user.email}
            onLogout={handleLogout}
            links={[
                { to: "/teacher-dashboard", label: "Dashboard", active: true },
                { to: "/teacher/classes", label: "Classes & rosters" },
                { to: "/acoustic-lab", label: "Phone audio test" },
            ]}
        >
            <div className="ui-page-head">
                <div>
                    <h1 className="ui-page-head__title">Welcome, {firstName}</h1>
                    <p className="ui-page-head__sub">
                        Run your classes, keep rosters current, and approve student devices before check-ins begin.
                    </p>
                </div>
                <div className="ui-page-head__actions">
                    <Button onClick={() => navigate("/teacher/classes")}>Manage classes & rosters</Button>
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

                <Card title="Quick actions" subtitle="The two things you’ll do most often.">
                    <div className="quick-actions">
                        <button type="button" className="quick-action" onClick={() => navigate("/teacher/classes")}>
                            <span className="quick-action__icon" aria-hidden="true">👥</span>
                            <span className="quick-action__body">
                                <strong>Classes & rosters</strong>
                                <small>Create classes, paste rosters, review new devices</small>
                            </span>
                        </button>
                        <button type="button" className="quick-action" onClick={() => navigate("/acoustic-lab")}>
                            <span className="quick-action__icon" aria-hidden="true">🔊</span>
                            <span className="quick-action__body">
                                <strong>Phone audio test</strong>
                                <small>Check that a phone can play and hear the key tones</small>
                            </span>
                        </button>
                    </div>
                </Card>
            </div>
        </AppShell>
    );
};

export default TeacherDashboard;
