const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const policy = require("../utils/signInPolicy");

const originalTeacherEmails = process.env.TEACHER_EMAILS;
const originalTestStudents = process.env.TEST_STUDENT_EMAILS;

after(() => {
  if (originalTeacherEmails === undefined) delete process.env.TEACHER_EMAILS;
  else process.env.TEACHER_EMAILS = originalTeacherEmails;
  if (originalTestStudents === undefined) delete process.env.TEST_STUDENT_EMAILS;
  else process.env.TEST_STUDENT_EMAILS = originalTestStudents;
});

test("college workspace accounts are accepted, in any case or spacing", () => {
  process.env.TEST_STUDENT_EMAILS = "";
  assert.equal(policy.isWorkspaceAccount("2023ugcs059@nitjsr.ac.in"), true);
  assert.equal(policy.isWorkspaceAccount("  Student.NIT@NITJSR.AC.IN "), true);
  assert.equal(policy.isAllowedSignInEmail("2023ugcs059@nitjsr.ac.in"), true);
});

test("look-alike domains are rejected", () => {
  process.env.TEST_STUDENT_EMAILS = "";
  assert.equal(policy.isWorkspaceAccount("attacker@notnitjsr.ac.in"), false);
  assert.equal(policy.isWorkspaceAccount("attacker@sub.nitjsr.ac.in"), false);
  assert.equal(policy.isWorkspaceAccount("attacker@nitjsr.ac.in.evil.com"), false);
  assert.equal(policy.isWorkspaceAccount("attacker@gmail.com"), false);
  assert.equal(policy.isAllowedSignInEmail(""), false);
});

test("gmail accounts are rejected unless listed as test students", () => {
  process.env.TEST_STUDENT_EMAILS = "";
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
  assert.deepEqual(policy.provisionedTeacherEmails(), []);
  assert.deepEqual(policy.testStudentEmails(), []);
  assert.equal(policy.isProvisionedTeacher("anyone@nitjsr.ac.in"), false);
  assert.equal(policy.isTestStudent("anyone@gmail.com"), false);
});
