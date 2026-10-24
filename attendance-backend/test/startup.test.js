const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const backendDir = path.resolve(__dirname, "..");

const runStartup = (overrides) =>
  spawnSync(process.execPath, ["index.js"], {
    cwd: backendDir,
    env: {
      ...process.env,
      NODE_ENV: "test",
      DEV_AUTH_ENABLED: "",
      TEACHER_EMAILS: "",
      TEST_STUDENT_EMAILS: "",
      TEST_TEACHER_EMAILS: "",
      ...overrides,
    },
    encoding: "utf8",
    timeout: 10000,
  });

const assertRefused = (result, fragment) => {
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing to start:/);
  assert.match(result.stderr, fragment);
  assert.doesNotMatch(result.stdout, /server is working/);
};

test("a malformed TEST_TEACHER_EMAILS stops startup before listening", () => {
  assertRefused(runStartup({ TEST_TEACHER_EMAILS: "not-an-email" }), /not a valid email address/);
});

test("a college address in TEST_TEACHER_EMAILS stops startup", () => {
  assertRefused(
    runStartup({ TEST_TEACHER_EMAILS: "2023ugcs059@nitjsr.ac.in" }),
    /non-college test accounts/
  );
});

test("an overlap between TEACHER_EMAILS and TEST_STUDENT_EMAILS stops startup", () => {
  assertRefused(
    runStartup({
      TEACHER_EMAILS: "shared@nitjsr.ac.in",
      TEST_STUDENT_EMAILS: "shared@nitjsr.ac.in",
    }),
    /both TEACHER_EMAILS and TEST_STUDENT_EMAILS/
  );
});

test("a Gmail in TEACHER_EMAILS stops startup", () => {
  assertRefused(
    runStartup({ TEACHER_EMAILS: "owner@gmail.com" }),
    /must be an @nitjsr\.ac\.in address/
  );
});

test("the same validation runs in production", () => {
  assertRefused(
    runStartup({
      NODE_ENV: "production",
      JWT_SECRET: "a-production-secret-that-is-long-enough",
      DB_URI: "mongodb://127.0.0.1:27018/bio-attend-startup-test",
      COOKIE_EXPIRE: "7",
      TEST_TEACHER_EMAILS: "2023ugcs059@nitjsr.ac.in",
    }),
    /non-college test accounts/
  );
});
