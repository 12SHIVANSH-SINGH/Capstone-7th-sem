const catchAsyncError = require("../middleware/catchasyncerror");
const User = require("../models/userModels");
const ErrorHandler = require("../utils/errorhandler");
const jwt = require("jsonwebtoken");
const cookieOptions = require("../utils/cookieOptions");
const presentUser = require("../utils/presentUser");
const { isSessionAllowed } = require("../utils/signInPolicy");
const { isDevAuthEnabled } = require("../utils/devAuth");
const { tokenFromRequest } = require("../middleware/auth");

// 📌 Logout User
exports.logout = catchAsyncError(async (req, res, next) => {
    // clearCookie expires the cookie immediately instead of storing a literal
    // null value. Use the same flags as the login cookie so browsers match it.
    res.clearCookie("token", cookieOptions());
    // Ending a session also ends any active impersonation shell.
    res.clearCookie("admin_token", cookieOptions());

    res.status(200).json({
        success: true,
        message: "Logged out successfully",
    });
});

// 📌 Profile and preferences
exports.getProfile = catchAsyncError(async (req, res) => {
    res.status(200).json({
        success: true,
        user: presentUser(req.user),
        impersonating: Boolean(req.impersonator),
        impersonator: req.impersonator
            ? {
                  id: String(req.impersonator._id),
                  name: req.impersonator.name,
                  email: req.impersonator.email,
              }
            : null,
    });
});

exports.updateProfile = catchAsyncError(async (req, res, next) => {
    const user = await User.findById(req.user._id);
    if (!user) {
        return next(new ErrorHandler("User account no longer exists", 404));
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "name")) {
        const name = String(req.body.name || "").trim();
        if (!name) return next(new ErrorHandler("Name cannot be empty.", 400));
        if (name.length > 80) {
            return next(new ErrorHandler("Name is too long (max 80 characters).", 400));
        }
        user.name = name;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "phoneLabel")) {
        user.phoneLabel = String(req.body.phoneLabel || "").trim().slice(0, 80);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "rollNumber")) {
        user.rollNumber = String(req.body.rollNumber || "").trim().slice(0, 40);
    }

    await user.save();
    res.status(200).json({
        success: true,
        message: "Profile updated",
        user: presentUser(user),
    });
});

// 📌 Check if User is Logged In
exports.isAuth = catchAsyncError(async (req, res, next) => {
    const token = tokenFromRequest(req);
    if (!token) {
        return next(new ErrorHandler("Please login to access this resource", 401));
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET, {
            algorithms: ["HS256"],
        });
    } catch (error) {
        return next(new ErrorHandler("Please login to access this resource", 401));
    }

    req.user = await User.findById(decoded.id);
    if (!req.user) {
        return next(new ErrorHandler("User account no longer exists", 401));
    }
    if (req.user.status === "disabled") {
        return next(new ErrorHandler("This account has been disabled. Contact your administrator.", 401));
    }

    let impersonator = null;
    if (decoded.impersonatorId) {
        impersonator = await User.findById(decoded.impersonatorId);
        if (!impersonator || impersonator.role !== "superadmin" || impersonator.status === "disabled") {
            return next(new ErrorHandler("The impersonation session is no longer valid.", 401));
        }
        if (!isSessionAllowed(impersonator, { devAuthEnabled: isDevAuthEnabled() })) {
            return next(new ErrorHandler("The impersonation session is no longer valid.", 401));
        }
    } else if (!isSessionAllowed(req.user, { devAuthEnabled: isDevAuthEnabled() })) {
        // Keep /islogin consistent with the protected routes: a revoked test
        // account must not look signed in to the frontend.
        return next(new ErrorHandler("Please login to access this resource", 401));
    }

    res.status(200).json({
        success: true,
        user: presentUser(req.user),
        impersonating: Boolean(impersonator),
        impersonator: impersonator
            ? { id: String(impersonator._id), name: impersonator.name, email: impersonator.email }
            : null,
    });
});
