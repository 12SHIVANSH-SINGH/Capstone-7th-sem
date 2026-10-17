import React, { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";
import img1 from "../../assets/logo.png";
import SERVER_URL from "../../config/api";
import GoogleSignInButton from "./GoogleSignInButton";
import { getOrCreateDevicePublicKey } from "../../utils/deviceKey";
import Brand from "../../ui/Brand";
import { Spinner } from "../../ui/Spinner";

const Login = () => {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    const handleGoogleCredential = useCallback(async ({ credential }) => {
        setError("");
        setIsLoading(true);

        try {
            const response = await fetch(`${SERVER_URL}/auth/google`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ credential }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Google sign-in was not accepted.");

            let deviceStatus = "approved";
            if (data.user.role === "student") {
                const publicKeyJwk = await getOrCreateDevicePublicKey();
                const bindingResponse = await fetch(`${SERVER_URL}/device-bindings/claim`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ publicKeyJwk }),
                });
                const bindingData = await bindingResponse.json();
                if (!bindingResponse.ok) throw new Error(bindingData.message || "Could not bind this browser to your attendance account.");
                deviceStatus = bindingData.status;
            }

            navigate(data.user.role === "teacher" ? "/teacher-dashboard" : "/student-dashboard", { state: { deviceStatus } });
        } catch (requestError) {
            setError(requestError.message || "Google sign-in failed. Please try again.");
        } finally {
            setIsLoading(false);
        }
    }, [navigate]);

    return (
        <div className="login-page">
            <aside className="login-brand">
                <div className="login-brand__top">
                    <Brand />
                </div>
                <div className="login-brand__content">
                    <span className="login-brand__badge">Acoustic presence check-in</span>
                    <h1>Attendance that proves who’s actually in the room.</h1>
                    <p>
                        One-time near-ultrasonic key tones travel between student phones, and the
                        server verifies who heard them. No GPS tracking, no roll-call, no extra hardware.
                    </p>
                    <ul className="login-brand__points">
                        <li>College Google sign-in — nothing to remember</li>
                        <li>Each browser binds to a private device key</li>
                        <li>Teachers approve new devices in seconds</li>
                    </ul>
                </div>
                <div className="login-brand__wave" aria-hidden="true">
                    {[12, 22, 34, 20, 28, 14, 24, 34, 18, 26, 12, 20].map((height, index) => (
                        <span key={index} style={{ height: `${height}px`, animationDelay: `${(index % 6) * 0.14}s` }} />
                    ))}
                </div>
            </aside>

            <main className="login-panel">
                <div className="login-card">
                    <img src={img1} alt="Bio Attend" className="login-card__logo" />
                    <h2>Welcome back</h2>
                    <p className="login-card__sub">Sign in with your college account to continue.</p>

                    <div className="google-login-block">
                        <GoogleSignInButton
                            onCredential={handleGoogleCredential}
                            onLoadError={setError}
                            disabled={isLoading}
                        />
                        {isLoading && (
                            <p className="login-card__status">
                                <Spinner /> Signing you in…
                            </p>
                        )}
                    </div>

                    {error && <div className="error-message">{error}</div>}

                    <p className="login-card__help">
                        Need access? Ask your teacher to add your college email to the class roster.
                    </p>
                </div>
                <p className="login-foot">Bio Attend · NIT Jamshedpur</p>
            </main>
        </div>
    );
};

export default Login;
