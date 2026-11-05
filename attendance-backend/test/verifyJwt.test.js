const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const { candidates, verifyJwt } = require("../utils/verifyJwt");

const CURRENT = "current-secret-that-is-long-enough";
const PREVIOUS = "previous-secret-that-is-long-enough";
const env = { JWT_SECRET: CURRENT, JWT_SECRET_PREVIOUS: PREVIOUS };

test("tokens signed with the current secret verify", () => {
  const token = jwt.sign({ id: "user-1" }, CURRENT, { expiresIn: "1h" });
  assert.equal(verifyJwt(token, {}, env).id, "user-1");
});

test("tokens signed with the previous secret verify during rotation", () => {
  const token = jwt.sign({ id: "user-2" }, PREVIOUS, { expiresIn: "1h" });
  assert.equal(verifyJwt(token, {}, env).id, "user-2");
});

test("a token signed with an unknown secret is rejected", () => {
  const token = jwt.sign({ id: "user-3" }, "some-other-secret", { expiresIn: "1h" });
  assert.throws(() => verifyJwt(token, {}, env), /invalid signature/i);
});

test("an expired previous-secret token reports expiry, not forgery", () => {
  const token = jwt.sign({ id: "user-4" }, PREVIOUS, { expiresIn: "-1s" });
  assert.throws(() => verifyJwt(token, {}, env), (error) => error.name === "TokenExpiredError");
});

test("no configured secret fails closed", () => {
  const token = jwt.sign({ id: "user-5" }, CURRENT, { expiresIn: "1h" });
  assert.throws(() => verifyJwt(token, {}, {}), /not configured/i);
});

test("blank and duplicate candidates are removed", () => {
  assert.deepEqual(candidates({ JWT_SECRET: CURRENT, JWT_SECRET_PREVIOUS: "" }), [CURRENT]);
  assert.deepEqual(candidates({}), []);
});
