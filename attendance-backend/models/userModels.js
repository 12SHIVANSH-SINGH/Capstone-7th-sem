const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

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
    password: {
        type: String,
        required: function () {
            return !this.googleSubject;
        },
        select: false,
    },
    role: {
        type: String,
        enum: ["student", "teacher"],
        default: "student",
    },
    authProvider: {
        type: String,
        enum: ["password", "google"],
        default: "password",
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
    passKey: {
        id: String,
        publicKey: String,
        counter: Number,
        deviceType: String,
        backedUp: Boolean,
        transport: [String],
    },
});

// ✅ Hash password before saving
userSchema.pre("save", async function (next) {
    if (!this.isModified("password") || !this.password) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

// ✅ Compare password method
userSchema.methods.comparePassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// ✅ Generate JWT token
userSchema.methods.getJWTtoken = function () {
    return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE,
    });
};

const User = mongoose.model("User", userSchema);

module.exports = User;
