const cookieOptions = require("./cookieOptions");
const presentUser = require("./presentUser");

const DEFAULT_SUPER_ADMIN_HOURS = 12;
const MAX_SUPER_ADMIN_HOURS = 72;

const superAdminSessionHours = () => {
  const configured = Number(process.env.SUPER_ADMIN_SESSION_HOURS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_SUPER_ADMIN_HOURS;
  }
  return Math.min(Math.max(configured, 1), MAX_SUPER_ADMIN_HOURS);
};

const sendToken = (user, statusCode, res) => {
  // Super admins are the highest-privilege accounts in the product. Give them
  // a shorter session than ordinary students/teachers, even if COOKIE_EXPIRE
  // is configured for a week. The default is 12 hours; the maximum is 72.
  const isSuperAdmin = user.role === "superadmin";
  const configuredDays = Number(process.env.COOKIE_EXPIRE);
  const days = Number.isFinite(configuredDays) && configuredDays > 0 ? configuredDays : 7;
  const adminHours = superAdminSessionHours();

  const token = user.getJWTtoken(
    isSuperAdmin ? { expiresIn: `${adminHours}h` } : {}
  );
  const lifetimeMs = isSuperAdmin
    ? adminHours * 60 * 60 * 1000
    : days * 24 * 60 * 60 * 1000;
  const options = cookieOptions(new Date(Date.now() + lifetimeMs));

  // The JWT stays in the httpOnly cookie only. Returning it in JSON would let
  // page scripts read and exfiltrate it, which defeats the cookie flags.
  return res.status(statusCode).cookie("token", token, options).json({
    success: true,
    user: presentUser(user),
  });
};

module.exports = sendToken;
module.exports.superAdminSessionHours = superAdminSessionHours;
module.exports.DEFAULT_SUPER_ADMIN_HOURS = DEFAULT_SUPER_ADMIN_HOURS;
module.exports.MAX_SUPER_ADMIN_HOURS = MAX_SUPER_ADMIN_HOURS;
