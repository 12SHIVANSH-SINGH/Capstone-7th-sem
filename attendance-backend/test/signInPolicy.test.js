const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const policy = require("../utils/signInPolicy");

const originalTeacherEmails = process.env.TEACHER_EMAILS;
const originalTestStudents = process.env.TEST_STUDENT_EMAILS;
const originalTestTeachers = process.env.TEST_TEACHER_EMAILS;

after(() => {
  if (originalTeacherEmails === undefined) delete process.env.TEACHER_EMAILS;
  else process.env.TEACHER_EMAILS = originalTeacherEmails;
  if (originalTestStudents === undefined) delete process.env.TEST_STUDENT_EMAILS;
  else process.env.TEST_STUDENT_EMAILS = originalTestStudents;
  if (originalTestTeachers === undefined) delete process.env.TEST_TEACHER_EMAILS;
  else process.env.TEST_TEACHER_EMAILS = originalTestTeachers;
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
    policy.isAllowedGoogleSignIn({ email: "someone.else@gmail.com", emailVerified: true }),
    false
  );
  assert.equal(
    policy.isAllowedGoogleSignIn({ email: "x@dev.invalid", emailVerified: true }),
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
  // A test teacher removed from the environment still resolves by role when
  // called directly; the Google gate rejects the identity before this point.
  assert.equal(
    policy.resolveSignInRole({ email: "removed@gmail.com", existingRole: "teacher" }).role,
    "teacher"
  );
});

test("startup validation rejects malformed, duplicated and overlapping test lists", () => {
  assert.deepEqual(
    policy.validateTestAccountConfig({
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

  const many = Array.from({ length: policy.MAX_TEST_ACCOUNTS + 1 }, (_, index) => `a${index}@gmail.com`);
  const tooMany = policy.validateTestAccountConfig({ TEST_TEACHER_EMAILS: many.join(",") });
  assert.equal(tooMany.ok, false);
  assert.equal(tooMany.problems.some((problem) => problem.includes("at most")), true);

  assert.throws(
    () => policy.assertSafeTestAccountConfig({ TEST_TEACHER_EMAILS: "owner" }),
    /not a valid email/
  );
  assert.doesNotThrow(() =>
    policy.assertSafeTestAccountConfig({ TEST_TEACHER_EMAILS: "owner@gmail.com" })
  );
});
