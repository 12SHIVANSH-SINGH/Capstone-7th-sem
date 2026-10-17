const userModels = require('../models/userModels');
const ErrorHandler = require('../utils/errorhandler');
const catchasyncerror = require('./catchasyncerror')
const jwt = require('jsonwebtoken')

const isaunthenticated = catchasyncerror(async (req, resp, next) => {
    const { token } = req.cookies;
    if (!token) {
        return next(new ErrorHandler("please login to access it", 401));
    }
    // console.log(token);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = await userModels.findById(decoded.id);
    if (!req.user) {
        return next(new ErrorHandler("User account no longer exists", 401));
    }
    // console.log(req.user);
    next();
})

const authorizeRoles = (...roles) => (req, resp, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return next(new ErrorHandler("You do not have permission to perform this action", 403));
    }
    next();
};

module.exports = isaunthenticated;
module.exports.authorizeRoles = authorizeRoles;
