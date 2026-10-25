const { test } = require("node:test");
const assert = require("node:assert/strict");
const errorMiddleware = require("../middleware/error");

const run = (error) => {
  const result = { status: null, body: null };
  const response = {
    status(code) {
      result.status = code;
      return this;
    },
    json(payload) {
      result.body = payload;
      return this;
    },
  };
  errorMiddleware(error, {}, response, () => {});
  return result;
};

test("expired and invalid JWTs map to 401, not 400", () => {
  const expired = new Error("jwt expired");
  expired.name = "TokenExpiredError";
  const expiredResult = run(expired);
  assert.equal(expiredResult.status, 401);
  assert.match(expiredResult.body.message, /expired/i);

  const invalid = new Error("invalid signature");
  invalid.name = "JsonWebTokenError";
  const invalidResult = run(invalid);
  assert.equal(invalidResult.status, 401);
  assert.match(invalidResult.body.message, /invalid/i);
});

test("duplicate-key errors stay 400 with or without key metadata", () => {
  const bare = new Error("duplicate key");
  bare.code = 11000;
  const bareResult = run(bare);
  assert.equal(bareResult.status, 400);
  assert.match(bareResult.body.message, /Duplicate value entered/);

  const keyed = new Error("duplicate key");
  keyed.code = 11000;
  keyed.keyValue = { email: "owner@gmail.com" };
  const keyedResult = run(keyed);
  assert.equal(keyedResult.status, 400);
  assert.match(keyedResult.body.message, /Duplicate email entered/);

  const patternOnly = new Error("duplicate key");
  patternOnly.code = 11000;
  patternOnly.keyPattern = { googleSubject: 1 };
  const patternResult = run(patternOnly);
  assert.equal(patternResult.status, 400);
  assert.match(patternResult.body.message, /Duplicate googleSubject entered/);
});

test("malformed JSON becomes a safe 400 without parser internals", () => {
  const parseError = new SyntaxError('Unexpected token } in JSON at position 3 in body "{\\"bad\\""');
  parseError.type = "entity.parse.failed";
  parseError.status = 400;
  parseError.statusCode = 400;
  parseError.body = '{bad';

  const result = run(parseError);
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { success: false, message: "Invalid JSON body" });
  assert.doesNotMatch(JSON.stringify(result.body), /Unexpected token|position|bad/);
});

test("statusCode and status are accepted when statuscode is absent", () => {
  const statusCodeError = new Error("teapot");
  statusCodeError.statusCode = 418;
  assert.equal(run(statusCodeError).status, 418);

  const statusError = new Error("unprocessable");
  statusError.status = 422;
  assert.equal(run(statusError).status, 422);

  const defaultError = new Error("boom");
  assert.equal(run(defaultError).status, 500);
});
