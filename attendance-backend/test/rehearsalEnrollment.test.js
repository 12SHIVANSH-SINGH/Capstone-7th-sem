const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  isEnabled,
  allowedTestEmails,
  rosterOptions,
} = require("../utils/rehearsalEnrollment");

test("rehearsal enrollment needs the flag, a non-production env and test students", () => {
  const base = {
    NODE_ENV: "test",
    ALLOW_TEST_ROSTER_EMAILS: "true",
    TEST_STUDENT_EMAILS: "tester1@gmail.com,tester2@gmail.com",
  };

  assert.equal(isEnabled(base), true);
  assert.equal(isEnabled({ ...base, NODE_ENV: "development" }), true);
  assert.equal(isEnabled({ ...base, NODE_ENV: "production" }), false);
  assert.equal(isEnabled({ ...base, ALLOW_TEST_ROSTER_EMAILS: "false" }), false);
  assert.equal(isEnabled({ ...base, ALLOW_TEST_ROSTER_EMAILS: "tru" }), false);
  assert.equal(isEnabled({ ...base, ALLOW_TEST_ROSTER_EMAILS: "" }), false);
});

test("roster options expose only the exact allowlisted addresses when enabled", () => {
  const env = {
    NODE_ENV: "test",
    ALLOW_TEST_ROSTER_EMAILS: "yes",
    TEST_STUDENT_EMAILS: " Tester1@Gmail.com , tester2@gmail.com ",
  };

  assert.deepEqual(allowedTestEmails(env), ["tester1@gmail.com", "tester2@gmail.com"]);
  assert.deepEqual(rosterOptions(env), {
    allowedTestEmails: ["tester1@gmail.com", "tester2@gmail.com"],
  });
  assert.deepEqual(
    rosterOptions({ ...env, NODE_ENV: "production" }),
    { allowedTestEmails: [] }
  );
  assert.deepEqual(
    rosterOptions({ ...env, ALLOW_TEST_ROSTER_EMAILS: "0" }),
    { allowedTestEmails: [] }
  );
});
