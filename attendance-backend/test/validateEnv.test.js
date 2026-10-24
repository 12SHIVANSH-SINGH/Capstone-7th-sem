const { test } = require("node:test");
const assert = require("node:assert/strict");
const envCheck = require("../utils/validateEnv");

const validProduction = {
  NODE_ENV: "production",
  JWT_SECRET: "a".repeat(48),
  DB_URI: "mongodb+srv://user:pass@cluster.example.mongodb.net/attendance",
  GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com",
  COOKIE_EXPIRE: "7",
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
