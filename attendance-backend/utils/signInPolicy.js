/**
 * Google sign-in policy (shared by the auth controller and its unit tests).
 *
 * Production rule: only verified NIT Jamshedpur Google Workspace accounts
 * (nitjsr.ac.in) may sign in, and students must be on an active class roster.
 *
 * Testing rule: addresses listed in TEST_STUDENT_EMAILS (e.g. a couple of
 * friendly Gmail accounts) may also sign in and are treated as students.
 * They are never on a college roster, so the roster gate is skipped for them.
 * Remove the variable (or empty it) before the real pilot.
 *
 * The environment is read on every call so tests (and future config reloads)
 * always see the current values.
 */

const WORKSPACE_DOMAIN = "nitjsr.ac.in";

const normaliseEmail = (email) => String(email || "").trim().toLowerCase();

const parseEmailList = (value) =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

// Dev personas live on @dev.invalid and must never be usable through Google,
// even if someone pastes one into TEST_STUDENT_EMAILS by mistake.
const isDevEmail = (email) => normaliseEmail(email).endsWith("@dev.invalid");

const provisionedTeacherEmails = () =>
  parseEmailList(process.env.TEACHER_EMAILS).filter((email) => !isDevEmail(email));

const testStudentEmails = () =>
  parseEmailList(process.env.TEST_STUDENT_EMAILS).filter((email) => !isDevEmail(email));

const isProvisionedTeacher = (email) =>
  !isDevEmail(email) && provisionedTeacherEmails().includes(normaliseEmail(email));

const isTestStudent = (email) =>
  !isDevEmail(email) && testStudentEmails().includes(normaliseEmail(email));

const isWorkspaceAccount = (email) => normaliseEmail(email).endsWith(`@${WORKSPACE_DOMAIN}`);

const isAllowedSignInEmail = (email) => isWorkspaceAccount(email) || isTestStudent(email);

module.exports = {
  WORKSPACE_DOMAIN,
  normaliseEmail,
  parseEmailList,
  provisionedTeacherEmails,
  testStudentEmails,
  isProvisionedTeacher,
  isTestStudent,
  isWorkspaceAccount,
  isAllowedSignInEmail,
};