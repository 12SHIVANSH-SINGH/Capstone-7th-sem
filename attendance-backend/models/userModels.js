const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

// Sign-in is Google-only now. Password and WebAuthn/passkey fields were removed
// as part of the legacy cleanup (2026-10-17); recoverable from git history.
const userSchema = new mongoose.Schema(
    {
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
            enum: ["student", "teacher", "superadmin"],
            default: "student",
            index: true,
        },
        // Disabled accounts keep their history but cannot sign in or use an old
        // session. Super admins can disable users without deleting attendance.
        status: {
            type: String,
            enum: ["active", "disabled"],
            default: "active",
            index: true,
        },
        // Incremented whenever live sessions must stop working (account
        // disabled, role changed, device rebound, "sign out everywhere").
        // Old tokens carry the previous value and fail closed in the auth
        // middleware instead of surviving until their normal expiry.
        tokenVersion: {
            type: Number,
            default: 0,
            min: 0,
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
        // Demo accounts are created only outside production. The flag lets the
        // admin panel reset demo data without touching real records.
        isDemo: { type: Boolean, default: false, index: true },
        demoLabel: { type: String, trim: true, maxlength: 80, default: "" },
        phoneLabel: { type: String, trim: true, maxlength: 80, default: "" },
        rollNumber: { type: String, trim: true, maxlength: 40, default: "" },
        deviceBinding: {
            fingerprint: String,
            publicKeyJwk: mongoose.Schema.Types.Mixed,
            approvedAt: Date,
            lastSeenAt: Date,
        },
    },
    { timestamps: true }
);

// ✅ Generate JWT token. Optional claims support short-lived super-admin
// impersonation without changing the normal sign-in path.
userSchema.methods.getJWTtoken = function (options = {}) {
    const { expiresIn = process.env.JWT_EXPIRE || "5d", ...extraClaims } = options;
    return jwt.sign(
        { id: this._id, tokenVersion: this.tokenVersion || 0, ...extraClaims },
        process.env.JWT_SECRET,
        {
            // A token without an expiry would outlive its cookie and stay valid
            // forever if it ever leaked. Default to the documented five days.
            expiresIn,
            // Pin the algorithm so a token can never be reinterpreted under a
            // different JWT family if the library default changes.
            algorithm: "HS256",
        }
    );
};

const User = mongoose.model("User", userSchema);

module.exports = User;
