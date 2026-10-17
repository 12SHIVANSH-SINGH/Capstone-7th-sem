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
        enum: ["google"],
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
        expiresIn: process.env.JWT_EXPIRE,
    });
};

const User = mongoose.model("User", userSchema);

module.exports = User;
