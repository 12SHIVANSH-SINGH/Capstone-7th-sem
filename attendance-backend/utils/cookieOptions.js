const isProduction = (env = process.env) =>
  String(env.NODE_ENV || "").trim().toLowerCase() === "production";

const SAMESITE_VALUES = ["lax", "strict", "none"];

/**
 * Cookie policy for the one-service deployment.
 *
 * Browser sessions are first-party when React and the API share an origin,
 * so Lax is the default and the safer choice. SameSite=None is still supported
 * for a deliberate split deployment, but it must be explicit: it widens the
 * cross-site request surface and browsers require Secure with it.
 */
const sameSitePolicy = (env = process.env) => {
  const configured = String(env.COOKIE_SAMESITE || "")
    .trim()
    .toLowerCase();
  if (SAMESITE_VALUES.includes(configured)) return configured;
  return "lax";
};

const cookieOptions = (expires, env = process.env) => {
  const sameSite = sameSitePolicy(env);
  return {
    ...(expires ? { expires } : {}),
    httpOnly: true,
    // SameSite=None is ignored by browsers unless the cookie is Secure. In
    // production Render terminates TLS, so both paths set it. Local HTTP
    // development stays non-Secure so the cookie is usable there.
    secure: isProduction(env) || sameSite === "none",
    sameSite,
    path: "/",
  };
};

module.exports = cookieOptions;
module.exports.cookieOptions = cookieOptions;
module.exports.sameSitePolicy = sameSitePolicy;
module.exports.SAMESITE_VALUES = SAMESITE_VALUES;
