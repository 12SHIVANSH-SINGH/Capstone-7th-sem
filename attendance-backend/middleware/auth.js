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
    // console.log(req.user);
    next();
})



module.exports =  isaunthenticated;