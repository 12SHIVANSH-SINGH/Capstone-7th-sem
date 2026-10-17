const cookieOptions = require("./cookieOptions");

const sendToken = (user, statusCode, res) => {
    const token = user.getJWTtoken(); // ✅ Fix: Ensure method exists
  
    const options = cookieOptions(new Date(
      Date.now() + process.env.COOKIE_EXPIRE * 24 * 60 * 60 * 1000
    ));
  
    const safeUser = user.toObject ? user.toObject() : user;
    delete safeUser.password;

    res.status(statusCode).cookie("token", token, options).json({
      success: true,
      token,
      user: safeUser,
    });
  };
  
  module.exports = sendToken;
  
