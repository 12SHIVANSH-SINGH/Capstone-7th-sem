import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import SERVER_URL from "../../config/api";
import AppShell from "../../ui/AppShell";
import Badge from "../../ui/Badge";
import Button from "../../ui/Button";
import Card from "../../ui/Card";
import { PageLoader } from "../../ui/Spinner";
import { useToast } from "../../ui/Toast";
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
        text: "This browser was added from a new device. A teacher needs to approve it before you can check in.",
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
    const firstName = name.split(" ")[0];

    return (
        <AppShell
            role="student"
            name={name}
            email={user.email}
            onLogout={handleLogout}
            links={[
                { to: "/student-dashboard", label: "Dashboard", active: true },
                { to: "/student/check-in", label: "Check-in" },
                { to: "/acoustic-lab", label: "Phone audio test" },
            ]}
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
        </AppShell>
    );
};

export default StudentDashboard;
