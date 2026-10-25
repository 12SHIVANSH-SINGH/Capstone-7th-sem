const ErrorHandler = require('../utils/errorhandler')

module.exports = (err, req, resp, next) => {
    // body-parser flags malformed JSON with type "entity.parse.failed" (a
    // SyntaxError carrying a .body property). Never echo parser text: request
    // bodies may contain secrets, and parser wording varies by runtime.
    const parseFailed =
        err.type === "entity.parse.failed" ||
        (err instanceof SyntaxError && Object.prototype.hasOwnProperty.call(err, "body"));
    if (parseFailed) {
        return resp.status(400).json({
            success: false,
            message: "Invalid JSON body"
        })
    }

    err.statuscode = err.statuscode || err.statusCode || err.status || 500;
    err.message = err.message || "internal server error";

    //wrong mongodb id error(cast error)
    if (err.name === "CastError") {
        const message = `resource not found ${err.path}`;
        err = new ErrorHandler(message, 400);
    }
    //mongoose duplicate key error
    if (err.code === 11000) {
        const fields = Object.keys(err.keyValue || err.keyPattern || {});
        const message = fields.length
            ? `Duplicate ${fields.join(", ")} entered`
            : "Duplicate value entered";
        err = new ErrorHandler(message, 400);
    }
    // A missing/invalid/expired session is an authentication failure, not a
    // malformed request: return 401 so the frontend sends the user to login.
    if (err.name === "JsonWebTokenError") {
        err = new ErrorHandler("Json web token is invalid, please login again", 401);
    }
    if (err.name === "TokenExpiredError") {
        err = new ErrorHandler("Json web token is expired, please login again", 401);
    }

    resp.status(err.statuscode).json({
        success: false,
        message: err.message
    })
}
