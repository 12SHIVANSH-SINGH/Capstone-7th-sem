/**
 * Rehearsal enrollment (Layer 2.4b0).
 *
 * The real roster is college-only. That rule is an identity control, not a
 * convenience, so it is not relaxed globally. When the owner needs to rehearse
 * the student shell with a Gmail TEST_STUDENT_EMAILS account, this helper lets
 * exactly those allowlisted addresses onto a roster in a non-production
 * environment. Production startup refuses the flag outright.
 */

const { isProduction } = require("./validateEnv");
const { parseEmailList } = require("./signInPolicy");
const { isTruthyFlag } = require("./envFlag");

const isEnabled = (env = process.env) =>
  !isProduction(env) && isTruthyFlag(env.ALLOW_TEST_ROSTER_EMAILS);

const allowedTestEmails = (env = process.env) =>
  isEnabled(env) ? parseEmailList(env.TEST_STUDENT_EMAILS) : [];

// Shape expected by parseRosterText. Kept as a function so the controller reads
// the current environment at request time, not at module load.
const rosterOptions = (env = process.env) => ({
  allowedTestEmails: allowedTestEmails(env),
});

module.exports = { isEnabled, allowedTestEmails, rosterOptions };
