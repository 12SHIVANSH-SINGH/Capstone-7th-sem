const ErrorHandler = require("./errorhandler");

const tokenVersionOf = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
};

const sessionVersionMatches = (decoded, user) =>
  tokenVersionOf(decoded?.tokenVersion) === tokenVersionOf(user?.tokenVersion);

/**
 * Fail closed when a token was issued before the account's session version
 * changed. Missing claims are version 0 so tokens issued before this field
 * existed keep working for accounts that have never been revoked.
 */
const assertSessionVersion = (
  decoded,
  user,
  message = "Your session has been revoked. Please sign in again."
) => {
  if (!sessionVersionMatches(decoded, user)) {
    throw new ErrorHandler(message, 401);
  }
};

module.exports = { tokenVersionOf, sessionVersionMatches, assertSessionVersion };
