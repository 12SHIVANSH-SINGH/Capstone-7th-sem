const cookieOptions = require("./cookieOptions");
const { verifyJwt } = require("./verifyJwt");
const { sessionVersionMatches } = require("./sessionVersion");

const STEP_UP_COOKIE = "admin_step_up";
const STEP_UP_HEADER = "x-admin-step-up";
const STEP_UP_MINUTES = 5;
const STEP_UP_MAX_AGE_SECONDS = STEP_UP_MINUTES * 60;

const stepUpExpiry = (now = Date.now()) => new Date(now + STEP_UP_MINUTES * 60 * 1000);

const stepUpCookieOptions = (expires = stepUpExpiry()) => ({
  ...cookieOptions(expires),
  // Narrow the cookie to the admin API; the rest of the site cannot read or
  // replay it, even though it is HttpOnly already.
  path: "/api/v1/admin",
});

const stepUpTokenFromRequest = (req) => {
  const cookieToken = String(req?.cookies?.[STEP_UP_COOKIE] || "").trim();
  if (cookieToken) return cookieToken;
  const headerToken = String(req?.headers?.[STEP_UP_HEADER] || "").trim();
  return headerToken;
};

const signStepUpToken = (user) =>
  user.getJWTtoken({
    expiresIn: `${STEP_UP_MINUTES}m`,
    stepUp: true,
    scope: "admin",
  });

const setStepUpCookie = (res, token, expires = stepUpExpiry()) => {
  res.cookie(STEP_UP_COOKIE, token, stepUpCookieOptions(expires));
};

const clearStepUpCookie = (res) => {
  res.clearCookie(STEP_UP_COOKIE, stepUpCookieOptions());
};

/**
 * Returns null when no assertion is present, otherwise a reason code. The
 * guard below turns any non-ok state into 428 so the client knows a passkey
 * is required rather than merely forbidden.
 */
const stepUpState = (req, env = process.env) => {
  const token = stepUpTokenFromRequest(req);
  if (!token) return { ok: false, reason: "missing" };

  let decoded;
  try {
    decoded = verifyJwt(token, {}, env);
  } catch (error) {
    return { ok: false, reason: "invalid-token" };
  }

  if (decoded?.stepUp !== true || decoded?.scope !== "admin") {
    return { ok: false, reason: "wrong-scope" };
  }
  if (!req?.user?._id || String(decoded.id) !== String(req.user._id)) {
    return { ok: false, reason: "wrong-user" };
  }
  if (req.user.role !== "superadmin" || req.user.status === "disabled") {
    return { ok: false, reason: "account-not-eligible" };
  }
  if (!sessionVersionMatches(decoded, req.user)) {
    return { ok: false, reason: "stale-session" };
  }
  if (
    !Number.isFinite(decoded.exp) ||
    !Number.isFinite(decoded.iat) ||
    decoded.exp - decoded.iat > STEP_UP_MAX_AGE_SECONDS
  ) {
    return { ok: false, reason: "lifetime-too-long" };
  }

  return { ok: true, reason: "", claims: decoded };
};

module.exports = {
  STEP_UP_COOKIE,
  STEP_UP_HEADER,
  STEP_UP_MAX_AGE_SECONDS,
  STEP_UP_MINUTES,
  clearStepUpCookie,
  setStepUpCookie,
  signStepUpToken,
  stepUpCookieOptions,
  stepUpExpiry,
  stepUpState,
  stepUpTokenFromRequest,
};
