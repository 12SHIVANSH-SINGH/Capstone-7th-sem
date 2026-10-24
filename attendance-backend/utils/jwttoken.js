const cookieOptions = require("./cookieOptions");
const presentUser = require("./presentUser");

const sendToken = (user, statusCode, res) => {
  const token = user.getJWTtoken();

  // COOKIE_EXPIRE is optional in production PaaS configs; default to 7 days.
  const configuredDays = Number(process.env.COOKIE_EXPIRE);
  const days = Number.isFinite(configuredDays) && configuredDays > 0 ? configuredDays : 7;

  const options = cookieOptions(new Date(Date.now() + days * 24 * 60 * 60 * 1000));

  // The JWT stays in the httpOnly cookie only. Returning it in JSON would let
  // page scripts read and exfiltrate it, which defeats the cookie flags.
  return res.status(statusCode).cookie("token", token, options).json({
    success: true,
    user: presentUser(user),
  });
};

module.exports = sendToken;
