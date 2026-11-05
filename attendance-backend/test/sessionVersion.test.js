const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  tokenVersionOf,
  sessionVersionMatches,
  assertSessionVersion,
} = require("../utils/sessionVersion");

test("missing claims are version zero for pre-revocation tokens", () => {
  assert.equal(tokenVersionOf(undefined), 0);
  assert.equal(tokenVersionOf(null), 0);
  assert.equal(tokenVersionOf("2"), 2);
  assert.equal(tokenVersionOf(-1), 0);
  assert.equal(sessionVersionMatches({}, { tokenVersion: 0 }), true);
});

test("a token from before a bump is rejected", () => {
  assert.equal(sessionVersionMatches({ tokenVersion: 1 }, { tokenVersion: 2 }), false);
  assert.throws(
    () => assertSessionVersion({ tokenVersion: 1 }, { tokenVersion: 2 }),
    (error) => error.statuscode === 401 && /revoked/i.test(error.message)
  );
});

test("a current token is accepted", () => {
  assert.doesNotThrow(() => assertSessionVersion({ tokenVersion: 3 }, { tokenVersion: 3 }));
});
