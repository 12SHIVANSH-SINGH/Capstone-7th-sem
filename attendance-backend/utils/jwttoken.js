const cookieOptions = require("./cookieOptions");

const sendToken = (user, statusCode, res) => {
    const token = user.getJWTtoken(); // ✅ Fix: Ensure method exists
  
    const options = cookieOptions(new Date(
      Date.now() + process.env.COOKIE_EXPIRE * 24 * 60 * 60 * 1000
    ));
  
    res.status(statusCode).cookie("token", token, options).json({
      success: true,
      token,
      user,
    });
  };
  
  module.exports = sendToken;
  
