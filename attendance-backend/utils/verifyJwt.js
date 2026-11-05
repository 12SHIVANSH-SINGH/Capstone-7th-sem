const jwt = require("jsonwebtoken");

/**
 * Verify a JWT against the current secret and, during a rotation window, the
 * previous secret. Signing always uses JWT_SECRET. The previous secret is
 * verification-only so live sessions survive one deploy without weakening
 * newly issued tokens.
 */
const candidates = (env = process.env) =>
  [env.JWT_SECRET, env.JWT_SECRET_PREVIOUS]
    .map((secret) => String(secret || "").trim())
    .filter(Boolean);

const verifyJwt = (token, options = {}, env = process.env) => {
  const secrets = candidates(env);
  let failure = null;

  for (const secret of secrets) {
    try {
      return jwt.verify(token, secret, { algorithms: ["HS256"], ...options });
    } catch (error) {
      // Keep an expiry error if one occurred: the caller distinguishes an
      // ended session from a malformed or forged token.
      if (!failure || error.name === "TokenExpiredError") failure = error;
    }
  }

  if (!failure) {
    throw new jwt.JsonWebTokenError("JWT secret is not configured");
  }
  throw failure;
};

module.exports = { candidates, verifyJwt };
