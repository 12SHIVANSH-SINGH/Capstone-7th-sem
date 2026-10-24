/**
 * Google sign-in policy (shared by the auth controller and its unit tests).
 *
 * Production rule: only verified NIT Jamshedpur Google Workspace accounts
 * (nitjsr.ac.in) may sign in. Students must be on an active class roster;
 * teachers are the accounts listed in TEACHER_EMAILS (which only bootstraps a
 * brand-new teacher account — it never promotes an existing student).
 *
 * Testing rule: two explicit allowlists let a handful of ordinary Google
 * accounts through the Workspace gate while the pilot is being prepared:
 *
 *   TEST_STUDENT_EMAILS  sign in as students and skip the roster gate
 *   TEST_TEACHER_EMAILS  sign in as teachers (the owner/teacher test account)
 *
 * Both are exact-match, comma-separated addresses. They are read from the
 * server environment, never shipped to the browser, and validated at startup.
 * There is deliberately no password path and no wildcard/domain match: an
 * address either appears in the list exactly or it does not. Test lists are
 * for non-college addresses only; a real college account belongs on a roster
 * or in TEACHER_EMAILS.
 *
 * Before a real pilot, empty both test variables. Removing an address blocks
 * new Google sign-ins, and the auth middleware re-checks the lists on every
 * request so a live session is rejected too. It does not demote the stored
 * role; delete or demote the user if that matters.
 *
 * The environment is read on every call so tests (and future config reloads)
 * always see the current values.
 */

const WORKSPACE_DOMAIN = "nitjsr.ac.in";

// Deliberately conservative: ASCII dot-atoms only, one address per entry, no
// display names, no wildcards. The local part may contain the RFC 5322 atom
// characters, but not a leading, trailing or consecutive dot. Length limits
// are checked separately in isValidEmail().
const LOCAL_ATOM = "[a-z0-9!#$%&'*+/=?^_`{|}~-]+";
const EMAIL_PATTERN = new RegExp(
  `^${LOCAL_ATOM}(?:\\.${LOCAL_ATOM})*@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$`
);

const MAX_TEST_ACCOUNTS = 10;
const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_LENGTH = 64;

const normaliseEmail = (email) => String(email || "").trim().toLowerCase();

const parseEmailList = (value) =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

const isValidEmail = (email) => {
  const value = normaliseEmail(email);
  if (!value || value.length > MAX_EMAIL_LENGTH) return false;
  const at = value.lastIndexOf("@");
  if (at <= 0 || at > MAX_LOCAL_LENGTH) return false;
  return EMAIL_PATTERN.test(value);
};

// Dev personas live on @dev.invalid and must never be usable through Google,
// even if someone pastes one into a test allowlist by mistake.
const isDevEmail = (email) => normaliseEmail(email).endsWith("@dev.invalid");

const provisionedTeacherEmails = () =>
  parseEmailList(process.env.TEACHER_EMAILS).filter((email) => !isDevEmail(email));

const testStudentEmails = () =>
  parseEmailList(process.env.TEST_STUDENT_EMAILS).filter((email) => !isDevEmail(email));

const testTeacherEmails = () =>
  parseEmailList(process.env.TEST_TEACHER_EMAILS).filter((email) => !isDevEmail(email));

const isWorkspaceAccount = (email) => normaliseEmail(email).endsWith(`@${WORKSPACE_DOMAIN}`);

// TEACHER_EMAILS only bootstraps a college account. Requiring the Workspace
// domain here means a Gmail pasted into TEACHER_EMAILS can never grant teacher
// access, even if startup validation were bypassed.
const isProvisionedTeacher = (email) =>
  isWorkspaceAccount(email) &&
  !isDevEmail(email) &&
  provisionedTeacherEmails().includes(normaliseEmail(email));

const isTestStudent = (email) =>
  !isWorkspaceAccount(email) && !isDevEmail(email) && testStudentEmails().includes(normaliseEmail(email));

const isTestTeacher = (email) =>
  !isWorkspaceAccount(email) && !isDevEmail(email) && testTeacherEmails().includes(normaliseEmail(email));

const isTestAccount = (email) => isTestStudent(email) || isTestTeacher(email);

const isAllowedSignInEmail = (email) => {
  const normalised = normaliseEmail(email);
  if (!normalised || isDevEmail(normalised)) return false;
  return isWorkspaceAccount(normalised) || isTestStudent(normalised) || isTestTeacher(normalised);
};

/**
 * Full identity gate for a verified Google token.
 *
 * A Workspace account must both claim the nitjsr.ac.in hosted domain and have
 * an email on that domain. A non-college address must match its test allowlist
 * exactly and can never stand in for a Workspace account: an address on the
 * college domain always needs the `hd` claim.
 *
 * `email_verified` must be the boolean `true`, not a truthy string.
 */
const isAllowedGoogleSignIn = ({ email, emailVerified = false, hostedDomain = "" } = {}) => {
  if (emailVerified !== true) return false;
  const normalised = normaliseEmail(email);
  if (!normalised || isDevEmail(normalised)) return false;

  if (isWorkspaceAccount(normalised)) {
    return normaliseEmail(hostedDomain) === WORKSPACE_DOMAIN;
  }

  return isTestStudent(normalised) || isTestTeacher(normalised);
};

/**
 * Decide the role for an identity that already passed the gate.
 *
 * - A listed test teacher is an explicit grant and is (re)promoted to teacher.
 * - A real Workspace teacher stays a teacher. TEACHER_EMAILS only provisions a
 *   brand-new account; it never promotes an existing student.
 * - Test students and rostered students are students.
 * - Everyone else is refused with the roster message.
 *
 * `testAccount` means "this email is on a test list", not "the winning branch
 * was a test branch", so the controller audits every test sign-in.
 */
const resolveSignInRole = ({ email, existingRole = null, hasRosterAccess = false } = {}) => {
  const normalised = normaliseEmail(email);
  const workspaceAccount = isWorkspaceAccount(normalised);
  const testTeacher = isTestTeacher(normalised);
  const testStudent = isTestStudent(normalised);
  const testAccount = testTeacher || testStudent;

  // An explicit test-teacher listing wins, including promotion of an existing
  // student. Removing the listing revokes the next sign-in at the Google gate.
  if (testTeacher) {
    return { allowed: true, role: "teacher", testAccount: true };
  }

  // Existing real teachers are never demoted by removing TEACHER_EMAILS.
  if (workspaceAccount && existingRole === "teacher") {
    return { allowed: true, role: "teacher", testAccount: false };
  }

  // TEACHER_EMAILS bootstraps a new account only, matching its documentation.
  if (workspaceAccount && existingRole === null && isProvisionedTeacher(normalised)) {
    return { allowed: true, role: "teacher", testAccount: false };
  }

  if (testStudent || hasRosterAccess) {
    return { allowed: true, role: "student", testAccount };
  }

  return { allowed: false, role: null, testAccount };
};

/**
 * Is an already-issued session still allowed?
 *
 * The JWT only carries a user id, so the middleware must decide whether the
 * account behind it is still eligible. This is what makes removing a Gmail
 * test account from the environment take effect immediately instead of after
 * the JWT expires. Dev personas require the dev gate to still be open.
 */
const isSessionAllowed = (user, { devAuthEnabled = false } = {}) => {
  if (!user) return false;
  if (user.authProvider === "dev") return devAuthEnabled;
  if (user.authProvider === "google" || !user.authProvider) {
    if (!isAllowedSignInEmail(user.email)) return false;
    // A Gmail account that was demoted in the database must not keep reading
    // as a teacher through an old cookie. Only a current TEST_TEACHER_EMAILS
    // entry can back a non-college teacher session. Workspace teachers are
    // unaffected: their role comes from a real college account.
    if (user.role === "teacher" && !isWorkspaceAccount(user.email)) {
      return isTestTeacher(user.email);
    }
    return true;
  }
  return false;
};

/**
 * Startup validation for all three sign-in lists.
 *
 * A typo must stop the server instead of silently leaving an account unable to
 * sign in (or, worse, matching more than intended). Every pair of lists is
 * checked for overlap because one address cannot hold two roles.
 */
const validateTestAccountConfig = (env = process.env) => {
  const problems = [];
  const lists = [
    {
      name: "TEACHER_EMAILS",
      emails: parseEmailList(env.TEACHER_EMAILS),
      max: null,
      workspaceOnly: true,
    },
    {
      name: "TEST_STUDENT_EMAILS",
      emails: parseEmailList(env.TEST_STUDENT_EMAILS),
      max: MAX_TEST_ACCOUNTS,
      workspaceOnly: false,
    },
    {
      name: "TEST_TEACHER_EMAILS",
      emails: parseEmailList(env.TEST_TEACHER_EMAILS),
      max: MAX_TEST_ACCOUNTS,
      workspaceOnly: false,
    },
  ];

  for (const { name, emails, max, workspaceOnly } of lists) {
    if (max !== null && emails.length > max) {
      problems.push(`${name} supports at most ${max} addresses.`);
    }

    const seen = new Set();
    for (const email of emails) {
      if (!isValidEmail(email)) {
        problems.push(`${name} entry "${email}" is not a valid email address.`);
      }
      if (isDevEmail(email)) {
        problems.push(`${name} must not contain @dev.invalid addresses.`);
      }
      if (workspaceOnly && !isWorkspaceAccount(email)) {
        problems.push(`${name} entry "${email}" must be an @${WORKSPACE_DOMAIN} address.`);
      }
      if (!workspaceOnly && isWorkspaceAccount(email)) {
        problems.push(
          `${name} is for non-college test accounts; put "${email}" in TEACHER_EMAILS or on a class roster.`
        );
      }
      if (seen.has(email)) {
        problems.push(`${name} contains "${email}" more than once.`);
      }
      seen.add(email);
    }
  }

  for (let first = 0; first < lists.length; first += 1) {
    for (let second = first + 1; second < lists.length; second += 1) {
      const a = lists[first];
      const b = lists[second];
      for (const email of a.emails) {
        if (b.emails.includes(email)) {
          problems.push(
            `"${email}" is in both ${a.name} and ${b.name}; keep one role per address.`
          );
        }
      }
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
  MAX_EMAIL_LENGTH,
  MAX_LOCAL_LENGTH,
  normaliseEmail,
  isValidEmail,
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
  isSessionAllowed,
  validateTestAccountConfig,
  assertSafeTestAccountConfig,
};
