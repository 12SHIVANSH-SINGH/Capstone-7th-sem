/**
 * Google sign-in policy (shared by the auth controller and its unit tests).
 *
 * Production rule: only verified NIT Jamshedpur Google Workspace accounts
 * (nitjsr.ac.in) may sign in. Students must be on an active class roster;
 * teachers are the accounts listed in TEACHER_EMAILS.
 *
 * Testing rule: two explicit allowlists let a handful of ordinary Google
 * accounts through the Workspace gate while the pilot is being prepared:
 *
 *   TEST_STUDENT_EMAILS  sign in as students and skip the roster gate
 *   TEST_TEACHER_EMAILS  sign in as teachers (the owner/admin test account)
 *
 * Both are exact-match, comma-separated addresses. They are read from the
 * server environment, never shipped to the browser, and validated at startup.
 * There is deliberately no password path and no wildcard/domain match: an
 * address either appears in the list exactly or it does not.
 *
 * Remove both variables (and rotate JWT_SECRET to revoke already-issued
 * cookies) before a real pilot.
 *
 * The environment is read on every call so tests (and future config reloads)
 * always see the current values.
 */

const WORKSPACE_DOMAIN = "nitjsr.ac.in";

// Deliberately conservative: one address per entry, no display names, no
// wildcards. Anything else is a configuration mistake and fails startup.
const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

const MAX_TEST_ACCOUNTS = 10;

const normaliseEmail = (email) => String(email || "").trim().toLowerCase();

const parseEmailList = (value) =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

// Dev personas live on @dev.invalid and must never be usable through Google,
// even if someone pastes one into a test allowlist by mistake.
const isDevEmail = (email) => normaliseEmail(email).endsWith("@dev.invalid");

const provisionedTeacherEmails = () =>
  parseEmailList(process.env.TEACHER_EMAILS).filter((email) => !isDevEmail(email));

const testStudentEmails = () =>
  parseEmailList(process.env.TEST_STUDENT_EMAILS).filter((email) => !isDevEmail(email));

const testTeacherEmails = () =>
  parseEmailList(process.env.TEST_TEACHER_EMAILS).filter((email) => !isDevEmail(email));

const isProvisionedTeacher = (email) =>
  !isDevEmail(email) && provisionedTeacherEmails().includes(normaliseEmail(email));

const isTestStudent = (email) =>
  !isDevEmail(email) && testStudentEmails().includes(normaliseEmail(email));

const isTestTeacher = (email) =>
  !isDevEmail(email) && testTeacherEmails().includes(normaliseEmail(email));

const isTestAccount = (email) => isTestStudent(email) || isTestTeacher(email);

const isWorkspaceAccount = (email) => normaliseEmail(email).endsWith(`@${WORKSPACE_DOMAIN}`);

const isAllowedSignInEmail = (email) =>
  isWorkspaceAccount(email) || isTestStudent(email) || isTestTeacher(email);

/**
 * Full identity gate for a verified Google token.
 *
 * A Workspace account must both claim the nitjsr.ac.in hosted domain and have
 * an email on that domain; a test account must match its allowlist exactly.
 * `hd` is only present on Workspace tokens, so a Gmail address that is not
 * allowlisted fails here even if `email_verified` is true.
 */
const isAllowedGoogleSignIn = ({ email, emailVerified = false, hostedDomain = "" } = {}) => {
  if (!emailVerified) return false;
  const normalised = normaliseEmail(email);
  if (isDevEmail(normalised)) return false;

  const workspaceAccount =
    normaliseEmail(hostedDomain) === WORKSPACE_DOMAIN && isWorkspaceAccount(normalised);

  return workspaceAccount || isTestStudent(normalised) || isTestTeacher(normalised);
};

/**
 * Decide the role for an identity that already passed the gate.
 *
 * - Test teachers, provisioned teachers and existing teachers are teachers.
 * - Test students and rostered students are students.
 * - Everyone else is refused with the roster message.
 *
 * `testAccount` is returned so the controller can write a loud audit line for
 * non-college sign-ins.
 */
const resolveSignInRole = ({ email, existingRole = null, hasRosterAccess = false } = {}) => {
  const normalised = normaliseEmail(email);
  const testTeacher = isTestTeacher(normalised);

  if (existingRole === "teacher" || testTeacher || isProvisionedTeacher(normalised)) {
    return { allowed: true, role: "teacher", testAccount: testTeacher };
  }

  const testStudent = isTestStudent(normalised);
  if (testStudent || hasRosterAccess) {
    return { allowed: true, role: "student", testAccount: testStudent };
  }

  return { allowed: false, role: null, testAccount: false };
};

/**
 * Startup validation for the test allowlists.
 *
 * A typo must stop the server instead of silently leaving an account unable to
 * sign in (or, worse, matching more than intended). The lists are also checked
 * for overlap because a single address cannot be both a test student and a
 * test teacher.
 */
const validateTestAccountConfig = (env = process.env) => {
  const problems = [];
  const lists = [
    ["TEST_STUDENT_EMAILS", parseEmailList(env.TEST_STUDENT_EMAILS)],
    ["TEST_TEACHER_EMAILS", parseEmailList(env.TEST_TEACHER_EMAILS)],
  ];

  for (const [name, list] of lists) {
    if (list.length > MAX_TEST_ACCOUNTS) {
      problems.push(`${name} supports at most ${MAX_TEST_ACCOUNTS} addresses.`);
    }

    const seen = new Set();
    for (const email of list) {
      if (!EMAIL_PATTERN.test(email)) {
        problems.push(`${name} entry "${email}" is not a valid email address.`);
      }
      if (isDevEmail(email)) {
        problems.push(`${name} must not contain @dev.invalid addresses.`);
      }
      if (seen.has(email)) {
        problems.push(`${name} contains "${email}" more than once.`);
      }
      seen.add(email);
    }
  }

  const students = lists[0][1];
  const teachers = lists[1][1];
  for (const email of students) {
    if (teachers.includes(email)) {
      problems.push(
        `"${email}" is in both TEST_STUDENT_EMAILS and TEST_TEACHER_EMAILS; keep one role per address.`
      );
    }
  }

  return { ok: problems.length === 0, problems };
};

const assertSafeTestAccountConfig = (env = process.env) => {
  const result = validateTestAccountConfig(env);
  if (!result.ok) {
    throw new Error(result.problems.join(" "));
  }
  return result;
};

module.exports = {
  WORKSPACE_DOMAIN,
  EMAIL_PATTERN,
  MAX_TEST_ACCOUNTS,
  normaliseEmail,
  parseEmailList,
  provisionedTeacherEmails,
  testStudentEmails,
  testTeacherEmails,
  isProvisionedTeacher,
  isTestStudent,
  isTestTeacher,
  isTestAccount,
  isWorkspaceAccount,
  isAllowedSignInEmail,
  isAllowedGoogleSignIn,
  resolveSignInRole,
  validateTestAccountConfig,
  assertSafeTestAccountConfig,
};
