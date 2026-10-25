import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";
import img1 from "../../assets/logo.png";
import SERVER_URL from "../../config/api";
import GoogleSignInButton from "./GoogleSignInButton";
import { getOrCreateDevicePublicKey } from "../../utils/deviceKey";
import Badge from "../../ui/Badge";
import Brand from "../../ui/Brand";
import { PageLoader, Spinner } from "../../ui/Spinner";
import useSession from "../../hooks/useSession";
import { dashboardPath } from "../../utils/auth";

const Login = () => {
    const navigate = useNavigate();
    const { user: sessionUser, loading: sessionLoading } = useSession();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [devAccounts, setDevAccounts] = useState([]);
    const [devBusy, setDevBusy] = useState("");
    const [devNotice, setDevNotice] = useState("");

    // A signed-in visitor who reaches /login (bookmark, back button, old link)
    // should not be asked to sign in again.
    useEffect(() => {
        if (!sessionLoading && sessionUser) {
            navigate(dashboardPath(sessionUser.role), { replace: true });
        }
    }, [navigate, sessionLoading, sessionUser]);

    const completeSignIn = useCallback(async (data) => {
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
    }, [navigate]);

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
            await completeSignIn(data);
        } catch (requestError) {
            setError(requestError.message || "Google sign-in failed. Please try again.");
        } finally {
            setIsLoading(false);
        }
    }, [completeSignIn]);

    // The dev picker is a development-build convenience. It never appears in a
    // production build, and the backend endpoint is 404 unless dev auth is on.
    useEffect(() => {
        if (process.env.NODE_ENV === "production") return undefined;

        let cancelled = false;
        fetch(`${SERVER_URL}/auth/dev/accounts`, { credentials: "include" })
            .then(async (response) => {
                if (!response.ok) return [];
                const data = await response.json();
                return Array.isArray(data.accounts) ? data.accounts : [];
            })
            .then((accounts) => {
                if (!cancelled) setDevAccounts(accounts);
            })
            .catch(() => {
                if (!cancelled) setDevAccounts([]);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const handleDevLogin = useCallback(async (account) => {
        setError("");
        setDevNotice("");
        setDevBusy(account.key);

        try {
            const response = await fetch(`${SERVER_URL}/auth/dev/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ key: account.key }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Dev sign-in was not accepted.");
            setDevNotice(`Signed in as ${account.name}.`);
            await completeSignIn(data);
        } catch (requestError) {
            setError(requestError.message || "Dev sign-in failed. Is the backend running with npm run dev?");
        } finally {
            setDevBusy("");
        }
    }, [completeSignIn]);

    const busy = isLoading || Boolean(devBusy);

    if (sessionLoading) {
        return <PageLoader label="Checking your session…" />;
    }

    if (sessionUser) {
        return <PageLoader label="Opening your dashboard…" />;
    }

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
                            disabled={busy}
                        />
                        {isLoading && (
                            <p className="login-card__status">
                                <Spinner /> Signing you in…
                            </p>
                        )}
                    </div>

                    {devAccounts.length > 0 && (
                        <section className="dev-login" aria-label="Development test identities">
                            <div className="dev-login__head">
                                <span>Dev-only test identities</span>
                                <Badge variant="warning">No passwords</Badge>
                            </div>
                            <p className="dev-login__hint">
                                One tap signs this browser in as a local test persona. These accounts
                                only exist while the API runs with dev auth enabled.
                            </p>
                            <div className="dev-login__list">
                                {devAccounts.map((account) => (
                                    <button
                                        key={account.key}
                                        type="button"
                                        className="dev-login__account"
                                        onClick={() => handleDevLogin(account)}
                                        disabled={busy}
                                    >
                                        <span className="dev-login__identity">
                                            <strong>{account.name}</strong>
                                            <small>local test persona · no password</small>
                                        </span>
                                        <Badge variant={account.role === "teacher" ? "primary" : "neutral"}>
                                            {account.role}
                                        </Badge>
                                        <span className="dev-login__action">
                                            {devBusy === account.key ? <Spinner /> : "Sign in"}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            {devNotice && <p className="dev-login__notice" role="status">{devNotice}</p>}
                        </section>
                    )}

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
