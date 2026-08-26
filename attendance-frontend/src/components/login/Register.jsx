import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { startRegistration } from "@simplewebauthn/browser";
import "./Register.css";
import img1 from "../../assets/logo.png"
import SERVER_URL from "../../config/api";

const Register = () => {
    const navigate = useNavigate();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState("student");

    // 📌 Traditional Registration
    const handleTraditionalRegister = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch(`${SERVER_URL}/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password, role }),
                credentials: "include", 
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message);

            alert("Registered successfully");
            navigate("/");
        } catch (error) {
            alert(error.message || "Something went wrong");
        }
    };

    // 📌 WebAuthn Registration (Passkey)
    const handleWebAuthnRegister = async () => {
        try {
            if (!email) {
                alert("Please enter an email before registering.");
                return;
            }
    
            // console.log("Initiating WebAuthn Registration for:", email);
    
            // Step 1: Get WebAuthn challenge from server
            const initResponse = await fetch(`${SERVER_URL}/init-register?email=${email}`, {
                method: "GET",
                credentials: "include", // ✅ Ensure cookies are included
                
            });
    
            if (!initResponse.ok) {
                const errorData = await initResponse.json();
                alert(errorData.error || "Failed to get registration challenge");
                return;
            }
    
            const options = await initResponse.json();
            // console.log("Received Registration Options:", options);
    
            // Step 2: Start WebAuthn registration
            const registrationJSON = await startRegistration(options);
            // console.log("Generated Registration Payload:", registrationJSON);
    
            // Step 3: Send registration data to verify API
            const verifyResponse = await fetch(`${SERVER_URL}/verify-register?email=${email}&password=${password}&name=${name}&role=${role}`, {
                method: "POST",
                credentials: "include", 
                headers: { "Content-Type": "application/json" },
                // credentials: "include", // ✅ Ensure cookies are included
                body: JSON.stringify(registrationJSON),
            });
    
            const verifyData = await verifyResponse.json();
    
            if (!verifyResponse.ok) {
                alert(verifyData.error || "Failed to verify registration.");
                return;
            }
            // console.log("data",verifyData)
            if (verifyData.success) {
                alert(`Successfully registered ${email}`);
                navigate("/");
            } else {
                alert(`Failed to register`);
            }
        } catch (error) {
            console.error("WebAuthn Registration Error:", error);
            alert("Something went wrong during registration.");
        }
    };
    
    


    return (
        <div className="register-container">
            <div className="register-box">
                <div className="register-header">
                    <img src={img1} alt="App Logo" className="logo" />
                    <h2>Create Your Account</h2>
                    <p>Join our learning community</p>
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

                    <div className="input-group">
                        <label htmlFor="role">Account Type</label>
                        <div className="role-selector">
                            <button
                                type="button"
                                className={`role-btn ${role === 'student' ? 'active' : ''}`}
                                onClick={() => setRole('student')}
                            >
                                👨🎓 Student
                            </button>
                            <button
                                type="button"
                                className={`role-btn ${role === 'teacher' ? 'active' : ''}`}
                                onClick={() => setRole('teacher')}
                            >
                                👩🏫 Teacher
                            </button>
                        </div>
                    </div>


                    <button 
                        type="submit" 
                        className="auth-btn traditional-btn"
                    >
                        Create Account
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
