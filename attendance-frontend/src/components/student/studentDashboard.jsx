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
import "./studentDashboard.css";

const STATUS_VIEW = {
    approved: {
        badge: "Approved",
        variant: "success",
        icon: "✓",
        title: "This browser is approved",
        text: "Your device is bound and approved. Student check-in is not enabled yet; the phone audio test is available now, and hearing a key will record evidence when the student shell ships.",
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
                { to: "/acoustic-lab", label: "Phone audio test" },
            ]}
        >
            <div className="ui-page-head">
                <div>
                    <h1 className="ui-page-head__title">Hi {firstName} 👋</h1>
                    <p className="ui-page-head__sub">
                        This is your attendance home. Student check-in is not enabled yet; this page shows your device status and the phone audio test.
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
                        <Button variant="soft" onClick={() => navigate("/acoustic-lab")}>🔊 Test phone audio</Button>
                    </div>
                </Card>

                <Card title="Student check-in is not enabled yet" subtitle="This page will show the live step when the student shell ships.">
                    <ol className="checkin-steps">
                        <li>
                            <strong>Check your device status.</strong>
                            The card above shows whether this browser is bound and approved.
                        </li>
                        <li>
                            <strong>Test the phone audio.</strong>
                            Make sure this phone can hear the near-ultrasonic tones.
                        </li>
                        <li>
                            <strong>Check-in will appear here.</strong>
                            When the shell ships, hearing a key will record evidence; your teacher’s check-in decides attendance.
                        </li>
                    </ol>
                </Card>
            </div>
        </AppShell>
    );
};

export default StudentDashboard;
