const { test } = require("node:test");
const assert = require("node:assert/strict");
const envCheck = require("../utils/validateEnv");

const validProduction = {
  NODE_ENV: "production",
  JWT_SECRET: "a".repeat(48),
  DB_URI: "mongodb+srv://user:pass@cluster.example.mongodb.net/attendance",
  GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com",
  COOKIE_EXPIRE: "7",
  SUPER_ADMIN_EMAILS: "12shivanshsingha@gmail.com",
  SUPER_ADMIN_SESSION_HOURS: "12",
  WEBAUTHN_ORIGINS: "https://bio-attend.onrender.com",
};

test("development and test never require production secrets", () => {
  for (const environment of ["development", "test", undefined]) {
    const result = envCheck.validateProductionEnv({ NODE_ENV: environment });
    assert.equal(result.ok, true);
    assert.deepEqual(result.problems, []);
  }
});

test("production refuses a missing, placeholder or short JWT secret", () => {
  const cases = [
    [{ ...validProduction, JWT_SECRET: "" }, /JWT_SECRET is missing/],
    [{ ...validProduction, JWT_SECRET: "change-me" }, /placeholder/],
    [{ ...validProduction, JWT_SECRET: "xxxxx" }, /placeholder|at least 32/],
    [{ ...validProduction, JWT_SECRET: "short-secret" }, /at least 32/],
  ];

  for (const [environment, pattern] of cases) {
    assert.throws(() => envCheck.assertProductionEnv(environment, { warn() {} }), pattern);
  }
});

test("a previous JWT secret is optional but must be a distinct real secret", () => {
  const previous = "b".repeat(48);
  assert.doesNotThrow(() =>
    envCheck.assertProductionEnv(
      { ...validProduction, JWT_SECRET_PREVIOUS: previous },
      { warn() {} }
    )
  );
  assert.throws(
    () =>
      envCheck.assertProductionEnv(
        { ...validProduction, JWT_SECRET_PREVIOUS: "short" },
        { warn() {} }
      ),
    /JWT_SECRET_PREVIOUS/
  );
  assert.throws(
    () =>
      envCheck.assertProductionEnv(
        { ...validProduction, JWT_SECRET_PREVIOUS: validProduction.JWT_SECRET },
        { warn() {} }
      ),
    /differ/
  );
});

test("production requires a MongoDB URI and a valid cookie lifetime", () => {
  assert.throws(
    () => envCheck.assertProductionEnv({ ...validProduction, DB_URI: "" }, { warn() {} }),
    /DB_URI/
  );
  assert.throws(
    () => envCheck.assertProductionEnv({ ...validProduction, DB_URI: "postgres://db" }, { warn() {} }),
    /DB_URI/
  );
  assert.throws(
    () => envCheck.assertProductionEnv({ ...validProduction, COOKIE_EXPIRE: "soon" }, { warn() {} }),
    /COOKIE_EXPIRE/
  );
  assert.throws(
    () => envCheck.assertProductionEnv({ ...validProduction, COOKIE_EXPIRE: "0" }, { warn() {} }),
    /COOKIE_EXPIRE/
  );
});

test("production refuses every truthy rehearsal roster flag", () => {
  for (const value of ["true", "1", "yes", "on", "TRUE"]) {
    assert.throws(
      () =>
        envCheck.assertProductionEnv(
          { ...validProduction, ALLOW_TEST_ROSTER_EMAILS: value },
          { warn() {} }
        ),
      /ALLOW_TEST_ROSTER_EMAILS/
    );
  }

  assert.doesNotThrow(() =>
    envCheck.assertProductionEnv(
      { ...validProduction, ALLOW_TEST_ROSTER_EMAILS: "false" },
      { warn() {} }
    )
  );
});

test("production warns when no super-admin can open the console", () => {
  const warnings = [];
  assert.doesNotThrow(() =>
    envCheck.assertProductionEnv(
      { ...validProduction, SUPER_ADMIN_EMAILS: "" },
      { warn: (message) => warnings.push(message) }
    )
  );
  assert.match(warnings[0], /SUPER_ADMIN_EMAILS is empty/);
});

test("production validates the shorter super-admin session lifetime", () => {
  for (const value of ["0", "-1", "73", "twelve"]) {
    assert.throws(
      () =>
        envCheck.assertProductionEnv(
          { ...validProduction, SUPER_ADMIN_SESSION_HOURS: value },
          { warn() {} }
        ),
      /SUPER_ADMIN_SESSION_HOURS/
    );
  }
  assert.doesNotThrow(() =>
    envCheck.assertProductionEnv(
      { ...validProduction, SUPER_ADMIN_SESSION_HOURS: "72" },
      { warn() {} }
    )
  );
});

test("COOKIE_SAMESITE only accepts lax, strict or none", () => {
  assert.throws(
    () =>
      envCheck.assertProductionEnv(
        { ...validProduction, COOKIE_SAMESITE: "sometimes" },
        { warn() {} }
      ),
    /COOKIE_SAMESITE/
  );
  assert.doesNotThrow(() =>
    envCheck.assertProductionEnv(
      {
        ...validProduction,
        COOKIE_SAMESITE: "none",
        CLIENT_URLS: "https://app.example.com",
      },
      { warn() {} }
    )
  );
});

test("production requires a resolvable HTTPS WebAuthn origin", () => {
  const withoutOrigin = {
    ...validProduction,
    WEBAUTHN_ORIGINS: "",
    CLIENT_URL: "",
    CLIENT_URLS: "",
    RENDER_EXTERNAL_URL: "",
  };

  assert.throws(
    () => envCheck.assertProductionEnv(withoutOrigin, { warn() {} }),
    /WEBAUTHN_ORIGINS/
  );
  assert.throws(
    () =>
      envCheck.assertProductionEnv(
        { ...validProduction, WEBAUTHN_ORIGINS: "http://bio.example.com" },
        { warn() {} }
      ),
    /HTTPS/
  );
  assert.doesNotThrow(() =>
    envCheck.assertProductionEnv(
      {
        ...validProduction,
        WEBAUTHN_ORIGINS: "",
        RENDER_EXTERNAL_URL: "https://bio.example.com",
      },
      { warn() {} }
    )
  );
});

test("the WebAuthn relying-party ID must match the configured origin", () => {
  assert.throws(
    () =>
      envCheck.assertProductionEnv(
        { ...validProduction, WEBAUTHN_RP_ID: "https://bio-attend.onrender.com" },
        { warn() {} }
      ),
    /domain name/
  );
  assert.throws(
    () =>
      envCheck.assertProductionEnv(
        { ...validProduction, WEBAUTHN_RP_ID: "other.example.com" },
        { warn() {} }
      ),
    /suffix/
  );
  assert.doesNotThrow(() =>
    envCheck.assertProductionEnv(
      { ...validProduction, WEBAUTHN_RP_ID: "onrender.com" },
      { warn() {} }
    )
  );
});

test("a complete production environment passes and warns about missing Google", () => {
  const warnings = [];
  assert.doesNotThrow(() =>
    envCheck.assertProductionEnv(validProduction, { warn: (message) => warnings.push(message) })
  );
  assert.deepEqual(warnings, []);

  assert.doesNotThrow(() =>
    envCheck.assertProductionEnv(
      { ...validProduction, GOOGLE_CLIENT_ID: "" },
      { warn: (message) => warnings.push(message) }
    )
  );
  assert.match(warnings[0], /GOOGLE_CLIENT_ID/);
});

test("production detection is case-insensitive and trims whitespace", () => {
  assert.equal(envCheck.isProduction({ NODE_ENV: "PRODUCTION" }), true);
  assert.equal(envCheck.isProduction({ NODE_ENV: "production" }), true);
  assert.equal(envCheck.isProduction({ NODE_ENV: "  production  " }), true);
  assert.equal(envCheck.isProduction({ NODE_ENV: "staging" }), false);
  assert.equal(envCheck.isProduction({ NODE_ENV: "production-ish" }), false);
});
