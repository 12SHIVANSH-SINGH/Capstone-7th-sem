const ErrorHandler = require('../utils/errorhandler')

module.exports = (err, req, resp, next) => {
    err.statuscode = err.statuscode || 500;
    err.message = err.message || "internal server error";

    //wrong mongodb id error(cast error)
    if (err.name === "CastError") {
        const message = `resource not found ${err.path}`;
        err = new ErrorHandler(message, 400);
    }
    //mongoose duplicate key error
    if (err.code === 11000) {
        const message = `Duplicate ${Object.keys(err.keyValue)} entered`
        err = new ErrorHandler(message, 400);
    }
    //wrong jwt error
    if (err.name === "JsonWebTokenError") {
        const message = `Json web token is invalid, try again`
        err = new ErrorHandler(message, 400);
    }
    //jwt expire error
    if (err.name === "TokenExpireError") {
        const message = `Json web token is expired, try again`
        err = new ErrorHandler(message, 400);
    }

    resp.status(err.statuscode).json({
        success: false,
        message: err.message
    })
}