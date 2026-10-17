import React, { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";
import img1 from "../../assets/logo.png"
import SERVER_URL from "../../config/api";
import GoogleSignInButton from "./GoogleSignInButton";
import { getOrCreateDevicePublicKey } from "../../utils/deviceKey";

const Login = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [showPassword, setShowPassword] = useState(false);

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

    const handleLogin = async (e) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);
        
        try {
            const response = await fetch(`${SERVER_URL}/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
                credentials: "include",
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message);

            navigate(data.user.role === "teacher" ? "/teacher-dashboard" : "/student-dashboard");
        } catch (error) {
            setError(error.message || "Invalid email or password. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-box">
                <div className="login-header">
                    <img src={img1} alt="App Logo" className="logo" />
                    <h2>Welcome Back</h2>
                    <p>Please sign in to continue</p>
                </div>

                <form onSubmit={handleLogin}>
                    <div className="google-login-block">
                        <p>Use your NIT Jamshedpur college account</p>
                        <GoogleSignInButton
                            onCredential={handleGoogleCredential}
                            onLoadError={setError}
                            disabled={isLoading}
                        />
                    </div>

                    <div className="login-divider"><span>Legacy development sign-in</span></div>
                    <div className="input-group">
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            placeholder="Enter your email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={isLoading}
                        />
                    </div>

                    <div className="input-group">
                        <label htmlFor="password">Password</label>
                        <div className="password-input">
                            <input
                                id="password"
                                type={showPassword ? "text" : "password"}
                                placeholder="Enter your password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={isLoading}
                            />
                            <button
                                type="button"
                                className="password-toggle"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? "👁️" : "👁️🗨️"}
                            </button>
                        </div>
                    </div>

                    {error && <div className="error-message">{error}</div>}

                    <button type="submit" className="login-button" disabled={isLoading}>
                        {isLoading ? (
                            <div className="spinner"></div>
                        ) : (
                            "Sign In"
                        )}
                    </button>

                    
                </form>

                <div className="register-prompt">
                    Need access? Ask your teacher to add your college email to the class roster.
                </div>
            </div>
        </div>
    );
};

export default Login;
