/**
 * Startup checks for production configuration.
 *
 * The prototype ran for weeks with development defaults. These checks make a
 * missing or placeholder secret a startup failure instead of a silently
 * forgeable JWT. They are intentionally limited to production: development and
 * test keep working with the local config file.
 */

const { isTruthyFlag } = require("./envFlag");
const { configuredOrigins, rpIdFor } = require("./webauthn");

const PLACEHOLDER_SECRETS = new Set([
  "secret",
  "jwt_secret",
  "jwt-secret",
  "change-me",
  "changeme",
  "your_jwt_secret",
  "your-secret-key",
  "dev-secret",
  "test-secret",
  "password",
  "123456",
]);

const isProduction = (env = process.env) =>
  String(env.NODE_ENV || "").trim().toLowerCase() === "production";

const isPlaceholder = (value) => {
  const normalised = String(value || "").trim().toLowerCase();
  return !normalised || PLACEHOLDER_SECRETS.has(normalised) || /^(x+|\*+|\.+)$/.test(normalised);
};

const validateProductionEnv = (env = process.env) => {
  if (!isProduction(env)) return { ok: true, problems: [], warnings: [] };

  const problems = [];
  const warnings = [];
  const secret = String(env.JWT_SECRET || "");

  if (isPlaceholder(secret)) {
    problems.push("JWT_SECRET is missing or still a placeholder.");
  } else if (secret.length < 32) {
    problems.push("JWT_SECRET must be at least 32 characters in production.");
  }

  // Rotation support: the previous secret is verification-only. It must be a
  // real secret, and reusing the current value would make rotation a no-op.
  const previousSecret = String(env.JWT_SECRET_PREVIOUS || "").trim();
  if (previousSecret) {
    if (isPlaceholder(previousSecret) || previousSecret.length < 32) {
      problems.push("JWT_SECRET_PREVIOUS must be a real secret of at least 32 characters.");
    }
    if (previousSecret === secret) {
      problems.push("JWT_SECRET_PREVIOUS must differ from JWT_SECRET.");
    }
    warnings.push(
      "JWT_SECRET_PREVIOUS is set; remove it after the rotation window (normal session lifetime)."
    );
  }

  const dbUri = String(env.DB_URI || env.MONGODB_URI || "").trim();
  if (!/^mongodb(\+srv)?:\/\//.test(dbUri)) {
    problems.push("DB_URI must be a MongoDB connection string in production.");
  }

  if (!String(env.GOOGLE_CLIENT_ID || "").trim()) {
    warnings.push("GOOGLE_CLIENT_ID is not set; Google sign-in will return 503.");
  }

  const cookieDays = Number(env.COOKIE_EXPIRE);
  if (env.COOKIE_EXPIRE != null && (!Number.isFinite(cookieDays) || cookieDays <= 0)) {
    problems.push("COOKIE_EXPIRE must be a positive number of days.");
  }

  const adminHours = Number(env.SUPER_ADMIN_SESSION_HOURS);
  if (
    env.SUPER_ADMIN_SESSION_HOURS != null &&
    env.SUPER_ADMIN_SESSION_HOURS !== "" &&
    (!Number.isFinite(adminHours) || adminHours < 1 || adminHours > 72)
  ) {
    problems.push("SUPER_ADMIN_SESSION_HOURS must be between 1 and 72 hours.");
  }

  // SameSite is a deliberate deployment decision, not a spelling game. An
  // unrecognised value silently falls back to Lax, so fail startup instead.
  const sameSite = String(env.COOKIE_SAMESITE || "").trim().toLowerCase();
  if (sameSite && !["lax", "strict", "none"].includes(sameSite)) {
    problems.push("COOKIE_SAMESITE must be one of: lax, strict, none.");
  }
  if (sameSite === "none" && !String(env.CLIENT_URL || env.CLIENT_URLS || "").trim()) {
    warnings.push(
      "COOKIE_SAMESITE=none is set without CLIENT_URL/CLIENT_URLS; the recommended one-service deployment should use lax."
    );
  }

  // Do not fail startup for a deployment that intentionally has no console,
  // but make the lockout visible in the deploy log. The admin console is part
  // of the product, and an empty list is the usual reason it is unreachable.
  const superAdmins = String(env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (superAdmins.length === 0) {
    warnings.push(
      "SUPER_ADMIN_EMAILS is empty; no account can open /admin in this production deployment."
    );
  }

  // Rehearsal enrollment is for local/staging rehearsals only. A production
  // deploy must never accept a Gmail test address on a real class roster.
  if (isTruthyFlag(env.ALLOW_TEST_ROSTER_EMAILS)) {
    problems.push("ALLOW_TEST_ROSTER_EMAILS must not be enabled in production.");
  }

  // Passkey approval is part of the production admin console. Without a
  // resolvable origin the step-up endpoints fail closed and every destructive
  // admin action becomes unreachable, so catch the mistake at startup.
  const webauthnOrigins = configuredOrigins(env);
  const rpID = rpIdFor(env);
  if (!webauthnOrigins.length || !rpID) {
    problems.push(
      "WEBAUTHN_ORIGINS (or RENDER_EXTERNAL_URL) must provide the admin passkey origin in production."
    );
  } else {
    const insecure = webauthnOrigins.filter((origin) => !/^https:\/\//i.test(origin));
    if (insecure.length) {
      problems.push("WebAuthn origins must use HTTPS in production.");
    }

    const explicitRpID = String(env.WEBAUTHN_RP_ID || "").trim().toLowerCase();
    if (explicitRpID && !/^[a-z0-9.-]+$/.test(explicitRpID)) {
      problems.push("WEBAUTHN_RP_ID must be a domain name without a scheme or path.");
    } else {
      const validRpID = webauthnOrigins.every((origin) => {
        try {
          const host = new URL(origin).hostname.toLowerCase();
          return host === rpID || host.endsWith(`.${rpID}`);
        } catch (error) {
          return false;
        }
      });
      if (!validRpID) {
        problems.push("WEBAUTHN_RP_ID must be a suffix of every WebAuthn origin host.");
      }
    }
  }

  return { ok: problems.length === 0, problems, warnings };
};

const assertProductionEnv = (env = process.env, logger = console) => {
  const result = validateProductionEnv(env);
  for (const warning of result.warnings) logger.warn(`Configuration warning: ${warning}`);
  if (!result.ok) {
    throw new Error(result.problems.join(" "));
  }
  return result;
};

module.exports = {
  PLACEHOLDER_SECRETS,
  isProduction,
  isPlaceholder,
  validateProductionEnv,
  assertProductionEnv,
};
