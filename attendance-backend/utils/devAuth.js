/**
 * Dev-only one-click identities.
 *
 * These accounts exist so two phones can sign in quickly while developing.
 * They are deliberately not passwords, not Google accounts and not reachable
 * in a production build:
 *
 *   - `isDevAuthEnabled()` requires NODE_ENV=development|test AND
 *     DEV_AUTH_ENABLED=true. Production is always false.
 *   - every persona email must end in @dev.invalid.
 *   - Google sign-in rejects @dev.invalid addresses.
 *   - the dev route is only mounted by app.js when the gate is open.
 *
 * Configure with DEV_AUTH_ACCOUNTS="key:role:name:email,...". If the variable
 * is absent, a small fixed set of local personas is used.
 */

const DEV_EMAIL_SUFFIX = "@dev.invalid";
const DEV_KEYS = new Set(["teacher", "student", "student1", "student2", "student3"]);

const DEFAULT_DEV_ACCOUNTS = [
  "teacher:teacher:Demo Teacher:teacher@dev.invalid",
  "student1:student:Demo Student One:student1@dev.invalid",
  "student2:student:Demo Student Two:student2@dev.invalid",
  "student3:student:Demo Student Three:student3@dev.invalid",
].join(",");

const isProduction = (env = process.env) =>
  String(env.NODE_ENV || "").trim().toLowerCase() === "production";

const flagIsOn = (env = process.env) =>
  String(env.DEV_AUTH_ENABLED || "").trim().toLowerCase() === "true";

const isDevAuthEnabled = (env = process.env) => {
  const environment = String(env.NODE_ENV || "").trim().toLowerCase();
  return (environment === "development" || environment === "test") && flagIsOn(env);
};

const normalise = (value) => String(value || "").trim();

const parseDevAccounts = (value = process.env.DEV_AUTH_ACCOUNTS) => {
  const source = normalise(value) || DEFAULT_DEV_ACCOUNTS;
  const accounts = [];
  const keys = new Set();
  const emails = new Set();

  for (const rawEntry of source.split(",")) {
    const entry = rawEntry.trim();
    if (!entry) continue;

    const parts = entry.split(":");
    if (parts.length !== 4) {
      throw new Error(
        "DEV_AUTH_ACCOUNTS entries must use key:role:name:email (for example student1:student:Demo Student:student1@dev.invalid)."
      );
    }

    const [rawKey, rawRole, rawName, rawEmail] = parts;
    const key = normalise(rawKey).toLowerCase();
    const role = normalise(rawRole).toLowerCase();
    const name = normalise(rawName);
    const email = normalise(rawEmail).toLowerCase();

    if (!/^[a-z0-9_-]{2,24}$/.test(key)) {
      throw new Error(`DEV_AUTH_ACCOUNTS key "${rawKey}" must be 2-24 lowercase letters, digits, _ or -.`);
    }
    if (!["teacher", "student"].includes(role)) {
      throw new Error(`DEV_AUTH_ACCOUNTS role for "${key}" must be teacher or student.`);
    }
    if (!name) {
      throw new Error(`DEV_AUTH_ACCOUNTS name for "${key}" is required.`);
    }
    if (!/^[a-z0-9._%+-]+@dev\.invalid$/.test(email)) {
      throw new Error(`DEV_AUTH_ACCOUNTS email for "${key}" must end in ${DEV_EMAIL_SUFFIX}.`);
    }
    if (keys.has(key)) throw new Error(`DEV_AUTH_ACCOUNTS contains duplicate key "${key}".`);
    if (emails.has(email)) throw new Error(`DEV_AUTH_ACCOUNTS contains duplicate email "${email}".`);

    keys.add(key);
    emails.add(email);
    accounts.push({ key, role, name, email });
  }

  if (accounts.length === 0) {
    throw new Error("DEV_AUTH_ACCOUNTS must contain at least one account.");
  }
  if (accounts.length > 10) {
    throw new Error("DEV_AUTH_ACCOUNTS supports at most 10 accounts.");
  }

  return accounts;
};

const isDevEmail = (email) =>
  normalise(email).toLowerCase().endsWith(DEV_EMAIL_SUFFIX);

const publicDevAccounts = (accounts = parseDevAccounts()) =>
  accounts.map(({ key, role, name }) => ({ key, role, name }));

const findDevAccount = (key, accounts = parseDevAccounts()) =>
  accounts.find((account) => account.key === normalise(key).toLowerCase()) || null;

const assertSafeDevConfiguration = (env = process.env) => {
  if (!flagIsOn(env)) return;
  if (isProduction(env)) {
    throw new Error("DEV_AUTH_ENABLED=true is refused when NODE_ENV=production.");
  }
  if (!isDevAuthEnabled(env)) {
    throw new Error(
      "DEV_AUTH_ENABLED=true requires NODE_ENV=development (or test). Start with: NODE_ENV=development DEV_AUTH_ENABLED=true npm run dev."
    );
  }
  parseDevAccounts(env.DEV_AUTH_ACCOUNTS);
};

module.exports = {
  DEV_EMAIL_SUFFIX,
  DEV_KEYS,
  DEFAULT_DEV_ACCOUNTS,
  isDevAuthEnabled,
  isProduction,
  flagIsOn,
  parseDevAccounts,
  isDevEmail,
  publicDevAccounts,
  findDevAccount,
  assertSafeDevConfiguration,
};
