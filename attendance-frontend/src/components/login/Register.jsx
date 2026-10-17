import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Register.css";
import img1 from "../../assets/logo.png"
import SERVER_URL from "../../config/api";

const Register = () => {
    const navigate = useNavigate();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    // 📌 Traditional Registration
    const handleTraditionalRegister = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch(`${SERVER_URL}/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password }),
                credentials: "include", 
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message);

            alert("Registered successfully");
            navigate("/login");
        } catch (error) {
            alert(error.message || "Something went wrong");
        }
    };

    return (
        <div className="register-container">
            <div className="register-box">
                <div className="register-header">
                    <img src={img1} alt="App Logo" className="logo" />
                    <h2>Create Your Account</h2>
                    <p>Legacy student-development registration</p>
                </div>

                <form onSubmit={handleTraditionalRegister}>
                    <div className="input-group">
                        <label htmlFor="name">Full Name</label>
                        <input
                            id="name"
                            type="text"
                            placeholder="Enter your full name"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    <div className="input-group">
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            placeholder="Enter your email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    <div className="input-group">
                        <label htmlFor="password">Password</label>
                        <div className="password-input">
                            <input
                                id="password"
                                type="password"
                                placeholder="Create a password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        className="auth-btn traditional-btn"
                    >
                        Create Legacy Student Account
                    </button>
                </form>

                <p className="login-prompt">
                    Already have an account?{" "}
                    <button 
                        type="button" 
                        onClick={() => navigate("/login")}
                    >
                        Sign In
                    </button>
                </p>
            </div>
        </div>
    );
};

export default Register;
