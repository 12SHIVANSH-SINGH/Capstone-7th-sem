const { test } = require("node:test");
const assert = require("node:assert/strict");
const dev = require("../utils/devAuth");
const policy = require("../utils/signInPolicy");

test("dev auth requires both a non-production environment and the explicit flag", () => {
  const cases = [
    [{ NODE_ENV: "production", DEV_AUTH_ENABLED: "true" }, false],
    [{ NODE_ENV: "PRODUCTION", DEV_AUTH_ENABLED: "true" }, false],
    [{ NODE_ENV: " production ", DEV_AUTH_ENABLED: "true" }, false],
    [{ NODE_ENV: "development", DEV_AUTH_ENABLED: "false" }, false],
    [{ NODE_ENV: "development" }, false],
    [{ DEV_AUTH_ENABLED: "true" }, false],
    [{ NODE_ENV: "staging", DEV_AUTH_ENABLED: "true" }, false],
    [{ NODE_ENV: "test", DEV_AUTH_ENABLED: "true" }, true],
    [{ NODE_ENV: "development", DEV_AUTH_ENABLED: "TRUE" }, true],
  ];

  for (const [environment, expected] of cases) {
    assert.equal(dev.isDevAuthEnabled(environment), expected);
  }
});

test("production refuses DEV_AUTH_ENABLED instead of silently ignoring it", () => {
  assert.throws(
    () => dev.assertSafeDevConfiguration({ NODE_ENV: "production", DEV_AUTH_ENABLED: "true" }),
    /refused when NODE_ENV=production/
  );
  assert.throws(
    () => dev.assertSafeDevConfiguration({ NODE_ENV: " production ", DEV_AUTH_ENABLED: "true" }),
    /refused when NODE_ENV=production/
  );
  assert.doesNotThrow(() =>
    dev.assertSafeDevConfiguration({ NODE_ENV: "production", DEV_AUTH_ENABLED: "false" })
  );
  assert.doesNotThrow(() => dev.assertSafeDevConfiguration({ NODE_ENV: "development" }));
});

test("default personas use @dev.invalid and safe roles", () => {
  const accounts = dev.parseDevAccounts("");
  assert.equal(accounts.length, 4);
  assert.deepEqual(
    accounts.map((account) => account.role).sort(),
    ["student", "student", "student", "teacher"]
  );
  assert.ok(accounts.every((account) => account.email.endsWith("@dev.invalid")));
  assert.ok(accounts.every((account) => !account.email.includes("gmail")));
});

test("custom personas are parsed, lower-cased and de-duplicated", () => {
  const accounts = dev.parseDevAccounts(
    "Teacher:TEACHER:Demo Teacher:Teacher@Dev.Invalid, st1 : student : Student One : ST1@dev.invalid"
  );
  assert.deepEqual(accounts, [
    { key: "teacher", role: "teacher", name: "Demo Teacher", email: "teacher@dev.invalid" },
    { key: "st1", role: "student", name: "Student One", email: "st1@dev.invalid" },
  ]);
  assert.equal(dev.findDevAccount("ST1", accounts).email, "st1@dev.invalid");
  assert.equal(dev.findDevAccount("missing", accounts), null);
});

test("unsafe or malformed personas are rejected at startup", () => {
  assert.throws(() => dev.parseDevAccounts("student1:student:Name:person@gmail.com"), /dev\.invalid/);
  assert.throws(() => dev.parseDevAccounts("student1:student:Name:person@nitjsr.ac.in"), /dev\.invalid/);
  assert.throws(() => dev.parseDevAccounts("student1:admin:Name:student1@dev.invalid"), /teacher or student/);
  assert.throws(() => dev.parseDevAccounts("a:b:c"), /key:role:name:email/);
  assert.throws(
    () =>
      dev.parseDevAccounts(
        "student1:student:One:student1@dev.invalid,student1:student:Two:student2@dev.invalid"
      ),
    /duplicate key/
  );
  assert.throws(
    () =>
      dev.parseDevAccounts(
        "student1:student:One:person@dev.invalid,student2:student:Two:person@dev.invalid"
      ),
    /duplicate email/
  );
});

test("dev.invalid is rejected by Google/test-student policy even if it is in the env list", () => {
  process.env.TEST_STUDENT_EMAILS = "student1@dev.invalid,person@gmail.com";
  process.env.TEACHER_EMAILS = "teacher@dev.invalid,guide@nitjsr.ac.in";
  try {
    assert.equal(policy.isTestStudent("student1@dev.invalid"), false);
    assert.equal(policy.isTestStudent("person@gmail.com"), true);
    assert.equal(policy.isAllowedSignInEmail("student1@dev.invalid"), false);
    assert.equal(policy.isProvisionedTeacher("teacher@dev.invalid"), false);
    assert.equal(policy.isProvisionedTeacher("guide@nitjsr.ac.in"), true);
    assert.deepEqual(policy.testStudentEmails(), ["person@gmail.com"]);
  } finally {
    delete process.env.TEST_STUDENT_EMAILS;
    delete process.env.TEACHER_EMAILS;
  }
});

test("dev account API exists only when dev auth is on and never returns emails", async (t) => {
  process.env.NODE_ENV = "test";
  process.env.DEV_AUTH_ENABLED = "true";
  process.env.DEV_AUTH_ACCOUNTS = "student1:student:Demo Student:student1@dev.invalid";

  // Fresh require after the environment is set: app.js decides the mount once.
  delete require.cache[require.resolve("../app")];
  const app = require("../app");
  const server = app.listen(0);
  t.after(() => server.close());

  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/auth/dev/accounts`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.accounts, [{ key: "student1", role: "student", name: "Demo Student" }]);
    assert.equal(JSON.stringify(body).includes("student1@dev.invalid"), false);
  } finally {
    delete process.env.NODE_ENV;
    delete process.env.DEV_AUTH_ENABLED;
    delete process.env.DEV_AUTH_ACCOUNTS;
  }
});
