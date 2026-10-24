const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const policy = require("../utils/signInPolicy");

const ENV_KEYS = ["TEACHER_EMAILS", "TEST_STUDENT_EMAILS", "TEST_TEACHER_EMAILS"];
let snapshot = {};

beforeEach(() => {
  snapshot = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
});

test("college workspace accounts are accepted, in any case or spacing", () => {
  process.env.TEST_STUDENT_EMAILS = "";
  process.env.TEST_TEACHER_EMAILS = "";
  assert.equal(policy.isWorkspaceAccount("2023ugcs059@nitjsr.ac.in"), true);
  assert.equal(policy.isWorkspaceAccount("  Student.NIT@NITJSR.AC.IN "), true);
  assert.equal(policy.isAllowedSignInEmail("2023ugcs059@nitjsr.ac.in"), true);
});

test("look-alike domains are rejected", () => {
  process.env.TEST_STUDENT_EMAILS = "";
  process.env.TEST_TEACHER_EMAILS = "";
  assert.equal(policy.isWorkspaceAccount("attacker@notnitjsr.ac.in"), false);
  assert.equal(policy.isWorkspaceAccount("attacker@sub.nitjsr.ac.in"), false);
  assert.equal(policy.isWorkspaceAccount("attacker@nitjsr.ac.in.evil.com"), false);
  assert.equal(policy.isWorkspaceAccount("attacker@gmail.com"), false);
  assert.equal(policy.isAllowedSignInEmail(""), false);
});

test("gmail accounts are rejected unless listed as test students", () => {
  process.env.TEST_STUDENT_EMAILS = "";
  process.env.TEST_TEACHER_EMAILS = "";
  assert.equal(policy.isAllowedSignInEmail("testforshivansh059@gmail.com"), false);

  process.env.TEST_STUDENT_EMAILS = " testforshivansh059@gmail.com , 12shivanshsingha@gmail.com ";
  assert.equal(policy.isTestStudent("testforshivansh059@gmail.com"), true);
  assert.equal(policy.isTestStudent(" TESTFORSHIVANSH059@GMAIL.COM "), true);
  assert.equal(policy.isTestStudent("12shivanshsingha@gmail.com"), true);
  assert.equal(policy.isTestStudent("someone.else@gmail.com"), false);
  assert.equal(policy.isAllowedSignInEmail("someone.else@gmail.com"), false);
  assert.equal(policy.isAllowedSignInEmail("2023ugcs059@nitjsr.ac.in"), true);
});

test("teacher list is parsed from TEACHER_EMAILS with trim and case folding", () => {
  process.env.TEACHER_EMAILS = " 2023ugcs059@nitjsr.ac.in , guide@nitjsr.ac.in";
  assert.equal(policy.isProvisionedTeacher("2023ugcs059@nitjsr.ac.in"), true);
  assert.equal(policy.isProvisionedTeacher(" 2023UGCS059@nitjsr.ac.in"), true);
  assert.equal(policy.isProvisionedTeacher("guide@nitjsr.ac.in"), true);
  assert.equal(policy.isProvisionedTeacher("random@nitjsr.ac.in"), false);
  assert.equal(policy.isProvisionedTeacher(""), false);

  // Even if a Gmail is pasted into TEACHER_EMAILS, it can never bootstrap a
  // teacher; startup validation rejects this too.
  process.env.TEACHER_EMAILS = "owner@gmail.com";
  assert.equal(policy.isProvisionedTeacher("owner@gmail.com"), false);
});

test("empty or missing lists produce no entries", () => {
  assert.deepEqual(policy.parseEmailList(undefined), []);
  assert.deepEqual(policy.parseEmailList(""), []);
  assert.deepEqual(policy.parseEmailList(" , ,"), []);
  delete process.env.TEACHER_EMAILS;
  delete process.env.TEST_STUDENT_EMAILS;
  delete process.env.TEST_TEACHER_EMAILS;
  assert.deepEqual(policy.provisionedTeacherEmails(), []);
  assert.deepEqual(policy.testStudentEmails(), []);
  assert.deepEqual(policy.testTeacherEmails(), []);
  assert.equal(policy.isProvisionedTeacher("anyone@nitjsr.ac.in"), false);
  assert.equal(policy.isTestStudent("anyone@gmail.com"), false);
  assert.equal(policy.isTestTeacher("anyone@gmail.com"), false);
});

test("test teachers are allowlisted, case folded and never students", () => {
  process.env.TEST_STUDENT_EMAILS = "";
  process.env.TEST_TEACHER_EMAILS = " owner@gmail.com , second@gmail.com ";

  assert.equal(policy.isTestTeacher("owner@gmail.com"), true);
  assert.equal(policy.isTestTeacher(" OWNER@GMAIL.COM "), true);
  assert.equal(policy.isTestTeacher("second@gmail.com"), true);
  assert.equal(policy.isTestTeacher("someone.else@gmail.com"), false);
  assert.equal(policy.isTestStudent("owner@gmail.com"), false);
  assert.equal(policy.isAllowedSignInEmail("owner@gmail.com"), true);
  assert.equal(policy.isAllowedSignInEmail("someone.else@gmail.com"), false);

  // Test lists are for non-college addresses only.
  process.env.TEST_TEACHER_EMAILS = "guide@nitjsr.ac.in";
  assert.equal(policy.isTestTeacher("guide@nitjsr.ac.in"), false);
});

test("isTestAccount recognises either list but rejects dev and college addresses", () => {
  process.env.TEST_STUDENT_EMAILS = "student@gmail.com";
  process.env.TEST_TEACHER_EMAILS = "owner@gmail.com";

  assert.equal(policy.isTestAccount("student@gmail.com"), true);
  assert.equal(policy.isTestAccount("owner@gmail.com"), true);
  assert.equal(policy.isTestAccount("someone.else@gmail.com"), false);
  assert.equal(policy.isTestAccount("guide@nitjsr.ac.in"), false);

  process.env.TEST_STUDENT_EMAILS = "dev@dev.invalid";
  assert.equal(policy.isTestAccount("dev@dev.invalid"), false);
});

test("the Google gate needs a verified identity on the college domain or an allowlist", () => {
  process.env.TEST_STUDENT_EMAILS = "student@gmail.com";
  process.env.TEST_TEACHER_EMAILS = "owner@gmail.com";

  assert.equal(
    policy.isAllowedGoogleSignIn({
      email: "2023ugcs059@nitjsr.ac.in",
      emailVerified: true,
      hostedDomain: "nitjsr.ac.in",
    }),
    true
  );
  assert.equal(
    policy.isAllowedGoogleSignIn({ email: "owner@gmail.com", emailVerified: true }),
    true
  );
  assert.equal(
    policy.isAllowedGoogleSignIn({ email: "student@gmail.com", emailVerified: true }),
    true
  );

  // A workspace-looking address without the hosted-domain claim is not enough.
  assert.equal(
    policy.isAllowedGoogleSignIn({
      email: "2023ugcs059@nitjsr.ac.in",
      emailVerified: true,
      hostedDomain: "gmail.com",
    }),
    false
  );
  assert.equal(
    policy.isAllowedGoogleSignIn({ email: "owner@gmail.com", emailVerified: false }),
    false
  );
  assert.equal(
    policy.isAllowedGoogleSignIn({ email: "owner@gmail.com", emailVerified: "false" }),
    false
  );
  assert.equal(
    policy.isAllowedGoogleSignIn({ email: "someone.else@gmail.com", emailVerified: true }),
    false
  );
  assert.equal(
    policy.isAllowedGoogleSignIn({ email: "x@dev.invalid", emailVerified: true }),
    false
  );

  // A college address in a test list still cannot skip the hosted-domain
  // claim; test lists are only for non-college accounts.
  process.env.TEST_STUDENT_EMAILS = "2023ugcs059@nitjsr.ac.in";
  assert.equal(
    policy.isAllowedGoogleSignIn({
      email: "2023ugcs059@nitjsr.ac.in",
      emailVerified: true,
    }),
    false
  );
});

test("roles resolve to teacher, student or a roster refusal", () => {
  process.env.TEACHER_EMAILS = "guide@nitjsr.ac.in";
  process.env.TEST_STUDENT_EMAILS = "student@gmail.com";
  process.env.TEST_TEACHER_EMAILS = "owner@gmail.com";

  assert.deepEqual(policy.resolveSignInRole({ email: "owner@gmail.com" }), {
    allowed: true,
    role: "teacher",
    testAccount: true,
  });
  assert.deepEqual(policy.resolveSignInRole({ email: "student@gmail.com" }), {
    allowed: true,
    role: "student",
    testAccount: true,
  });
  assert.deepEqual(policy.resolveSignInRole({ email: "guide@nitjsr.ac.in" }), {
    allowed: true,
    role: "teacher",
    testAccount: false,
  });
  assert.deepEqual(
    policy.resolveSignInRole({ email: "2023ugcs059@nitjsr.ac.in", hasRosterAccess: true }),
    { allowed: true, role: "student", testAccount: false }
  );
  assert.equal(
    policy.resolveSignInRole({ email: "2023ugcs059@nitjsr.ac.in" }).allowed,
    false
  );
  assert.equal(
    policy.resolveSignInRole({ email: "2023ugcs059@nitjsr.ac.in", existingRole: "student" })
      .allowed,
    false
  );
  assert.equal(
    policy.resolveSignInRole({ email: "2023ugcs059@nitjsr.ac.in", existingRole: "teacher" }).role,
    "teacher"
  );

  // Regression: TEACHER_EMAILS provisions a new teacher only. It must not
  // promote an existing student or let them skip the roster gate.
  assert.equal(
    policy.resolveSignInRole({
      email: "2023ugcs059@nitjsr.ac.in",
      existingRole: "student",
    }).allowed,
    false
  );
  assert.deepEqual(
    policy.resolveSignInRole({
      email: "2023ugcs059@nitjsr.ac.in",
      existingRole: "student",
      hasRosterAccess: true,
    }),
    { allowed: true, role: "student", testAccount: false }
  );

  // A listed test teacher is an explicit grant, including promotion of an
  // existing student.
  assert.deepEqual(
    policy.resolveSignInRole({ email: "owner@gmail.com", existingRole: "student" }),
    { allowed: true, role: "teacher", testAccount: true }
  );

  // A removed Gmail test teacher is not a teacher any more.
  assert.equal(
    policy.resolveSignInRole({
      email: "removed@gmail.com",
      existingRole: "teacher",
    }).allowed,
    false
  );
  // If that address was deliberately moved to the student list, it resolves
  // as a student and the controller demotes it.
  process.env.TEST_STUDENT_EMAILS = "removed@gmail.com";
  assert.deepEqual(
    policy.resolveSignInRole({
      email: "removed@gmail.com",
      existingRole: "teacher",
    }),
    { allowed: true, role: "student", testAccount: true }
  );
});

test("startup validation rejects malformed, duplicated and overlapping lists", () => {
  assert.deepEqual(
    policy.validateTestAccountConfig({
      TEACHER_EMAILS: "guide@nitjsr.ac.in",
      TEST_STUDENT_EMAILS: "student@gmail.com",
      TEST_TEACHER_EMAILS: "owner@gmail.com",
    }),
    { ok: true, problems: [] }
  );

  const bad = policy.validateTestAccountConfig({
    TEST_STUDENT_EMAILS: "student@gmail.com,student@gmail.com,not-an-email",
    TEST_TEACHER_EMAILS: "owner@gmail.com,student@gmail.com,dev@dev.invalid",
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.problems.some((problem) => problem.includes("not a valid email")), true);
  assert.equal(bad.problems.some((problem) => problem.includes("more than once")), true);
  assert.equal(bad.problems.some((problem) => problem.includes("both TEST_STUDENT")), true);
  assert.equal(bad.problems.some((problem) => problem.includes("@dev.invalid")), true);

  // Cross-list overlaps with TEACHER_EMAILS are the silent-escalation path.
  const teacherOverlap = policy.validateTestAccountConfig({
    TEACHER_EMAILS: "shared@nitjsr.ac.in",
    TEST_STUDENT_EMAILS: "shared@nitjsr.ac.in",
  });
  assert.equal(teacherOverlap.ok, false);
  assert.equal(
    teacherOverlap.problems.some((problem) => problem.includes("both TEACHER_EMAILS")),
    true
  );

  const teacherTestTeacherOverlap = policy.validateTestAccountConfig({
    TEACHER_EMAILS: "shared@nitjsr.ac.in",
    TEST_TEACHER_EMAILS: "shared@nitjsr.ac.in",
  });
  assert.equal(teacherTestTeacherOverlap.ok, false);
  assert.equal(
    teacherTestTeacherOverlap.problems.some((problem) =>
      problem.includes("both TEACHER_EMAILS and TEST_TEACHER_EMAILS")
    ),
    true
  );

  // Test lists are non-college only; TEACHER_EMAILS is college only.
  const workspaceTestTeacher = policy.validateTestAccountConfig({
    TEST_TEACHER_EMAILS: "2023ugcs059@nitjsr.ac.in",
  });
  assert.equal(workspaceTestTeacher.ok, false);
  assert.equal(
    workspaceTestTeacher.problems.some((problem) => problem.includes("non-college test accounts")),
    true
  );

  const workspaceTestStudent = policy.validateTestAccountConfig({
    TEST_STUDENT_EMAILS: "2023ugcs059@nitjsr.ac.in",
  });
  assert.equal(workspaceTestStudent.ok, false);

  const gmailProvisionedTeacher = policy.validateTestAccountConfig({
    TEACHER_EMAILS: "owner@gmail.com",
  });
  assert.equal(gmailProvisionedTeacher.ok, false);
  assert.equal(
    gmailProvisionedTeacher.problems.some((problem) => problem.includes("@nitjsr.ac.in address")),
    true
  );

  const many = Array.from({ length: policy.MAX_TEST_ACCOUNTS + 1 }, (_, index) => `a${index}@gmail.com`);
  const tooManyTeacher = policy.validateTestAccountConfig({ TEST_TEACHER_EMAILS: many.join(",") });
  assert.equal(tooManyTeacher.ok, false);
  assert.equal(tooManyTeacher.problems.some((problem) => problem.includes("at most")), true);

  const tooManyStudent = policy.validateTestAccountConfig({ TEST_STUDENT_EMAILS: many.join(",") });
  assert.equal(tooManyStudent.ok, false);
  assert.equal(tooManyStudent.problems.some((problem) => problem.includes("at most")), true);

  assert.throws(
    () => policy.assertSafeTestAccountConfig({ TEST_TEACHER_EMAILS: "owner" }),
    /not a valid email/
  );
  assert.doesNotThrow(() =>
    policy.assertSafeTestAccountConfig({ TEST_TEACHER_EMAILS: "owner@gmail.com" })
  );
});

test("email validation rejects dot-atom, length and whitespace mistakes", () => {
  assert.equal(policy.isValidEmail("first.last+tag@nitjsr.ac.in"), true);
  assert.equal(policy.isValidEmail("a@b.co"), true);
  assert.equal(policy.isValidEmail(" OWNER@GMAIL.COM "), true);

  assert.equal(policy.isValidEmail("a..b@gmail.com"), false);
  assert.equal(policy.isValidEmail(".a@gmail.com"), false);
  assert.equal(policy.isValidEmail("a.@gmail.com"), false);
  assert.equal(policy.isValidEmail("a@gmail..com"), false);
  assert.equal(policy.isValidEmail("a b@gmail.com"), false);
  assert.equal(policy.isValidEmail("a@b"), false);
  assert.equal(policy.isValidEmail("a@bücher.de"), false);
  assert.equal(policy.isValidEmail(""), false);
  assert.equal(policy.isValidEmail(`${"a".repeat(65)}@gmail.com`), false);
  assert.equal(policy.isValidEmail(`${"a".repeat(250)}@gmail.com`), false);
});

test("an issued session is allowed only while its account is still eligible", () => {
  process.env.TEACHER_EMAILS = "guide@nitjsr.ac.in";
  process.env.TEST_STUDENT_EMAILS = "student@gmail.com";
  process.env.TEST_TEACHER_EMAILS = "owner@gmail.com";

  const google = (email, role = "student") => ({ email, authProvider: "google", role });

  assert.equal(policy.isSessionAllowed(google("guide@nitjsr.ac.in", "teacher")), true);
  assert.equal(policy.isSessionAllowed(google("owner@gmail.com", "teacher")), true);
  assert.equal(policy.isSessionAllowed(google("student@gmail.com")), true);
  assert.equal(policy.isSessionAllowed(google("removed@gmail.com", "teacher")), false);
  assert.equal(policy.isSessionAllowed(google("x@dev.invalid", "teacher")), false);
  assert.equal(policy.isSessionAllowed(null), false);

  // Regression: a stale teacher-role row cannot read as a teacher when the
  // address now appears only in TEST_STUDENT_EMAILS (or in no list at all).
  assert.equal(policy.isSessionAllowed(google("student@gmail.com", "teacher")), false);
  process.env.TEST_STUDENT_EMAILS = "owner@gmail.com";
  process.env.TEST_TEACHER_EMAILS = "";
  assert.equal(policy.isSessionAllowed(google("owner@gmail.com", "teacher")), false);
  assert.equal(policy.isSessionAllowed(google("guide@nitjsr.ac.in", "teacher")), true);

  // Dev personas work only while the dev gate is open.
  const devUser = { email: "teacher@dev.invalid", authProvider: "dev", role: "teacher" };
  assert.equal(policy.isSessionAllowed(devUser, { devAuthEnabled: true }), true);
  assert.equal(policy.isSessionAllowed(devUser, { devAuthEnabled: false }), false);

  // Legacy records without authProvider are treated as Google.
  assert.equal(
    policy.isSessionAllowed({ email: "guide@nitjsr.ac.in", role: "teacher" }),
    true
  );
  assert.equal(
    policy.isSessionAllowed({ email: "removed@gmail.com", role: "teacher" }),
    false
  );
  assert.equal(
    policy.isSessionAllowed({ email: "guide@nitjsr.ac.in", authProvider: "other" }),
    false
  );
});
