/**
 * Startup checks for production configuration.
 *
 * The prototype ran for weeks with development defaults. These checks make a
 * missing or placeholder secret a startup failure instead of a silently
 * forgeable JWT. They are intentionally limited to production: development and
 * test keep working with the local config file.
 */

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
  String(env.NODE_ENV || "").toLowerCase() === "production";

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
