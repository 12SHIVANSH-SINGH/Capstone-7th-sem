const catchAsyncError = require("../middleware/catchasyncerror");
const User = require("../models/userModels");
const ErrorHandler = require("../utils/errorhandler");
const jwt = require("jsonwebtoken");
const cookieOptions = require("../utils/cookieOptions");
const presentUser = require("../utils/presentUser");
const { isSessionAllowed } = require("../utils/signInPolicy");
const { isDevAuthEnabled } = require("../utils/devAuth");

// 📌 Logout User
exports.logout = catchAsyncError(async (req, res, next) => {
    res.cookie("token", null, cookieOptions(new Date(Date.now())));

    res.status(200).json({
        success: true,
        message: "Logged out successfully",
    });
});

// 📌 Check if User is Logged In
exports.isAuth = catchAsyncError(async (req, res, next) => {
    const { token } = req.cookies;

    if (!token) {
        return next(new ErrorHandler("Please login to access this resource", 401));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);

    if (!req.user) {
        return next(new ErrorHandler("User account no longer exists", 401));
    }
    // Keep /islogin consistent with the protected routes: a revoked test
    // account must not look signed in to the frontend.
    if (!isSessionAllowed(req.user, { devAuthEnabled: isDevAuthEnabled() })) {
        return next(new ErrorHandler("Please login to access this resource", 401));
    }

    res.status(200).json({
        success: true,
        user: presentUser(req.user),
    });
});
