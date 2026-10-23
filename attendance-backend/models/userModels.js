const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

// Sign-in is Google-only now. Password and WebAuthn/passkey fields were removed
// as part of the legacy cleanup (2026-10-17); recoverable from git history.
const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    role: {
        type: String,
        enum: ["student", "teacher"],
        default: "student",
    },
    authProvider: {
        type: String,
        enum: ["google", "dev"],
        default: "google",
    },
    googleSubject: {
        type: String,
        unique: true,
        sparse: true,
    },
    deviceBinding: {
        fingerprint: String,
        publicKeyJwk: mongoose.Schema.Types.Mixed,
        approvedAt: Date,
        lastSeenAt: Date,
    },
});

// ✅ Generate JWT token
userSchema.methods.getJWTtoken = function () {
    return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
        // A token without an expiry would outlive its cookie and stay valid
        // forever if it ever leaked. Default to the documented five days.
        expiresIn: process.env.JWT_EXPIRE || "5d",
    });
};

const User = mongoose.model("User", userSchema);

module.exports = User;
