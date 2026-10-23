const { test } = require("node:test");
const assert = require("node:assert/strict");
const sendToken = require("../utils/jwttoken");

const fakeResponse = () => {
  const calls = { cookie: null, status: null, json: null };
  return {
    calls,
    cookie(name, value, options) {
      calls.cookie = { name, value, options };
      return this;
    },
    status(code) {
      calls.status = code;
      return this;
    },
    json(body) {
      calls.json = body;
      return this;
    },
  };
};

test("the JWT is set as an httpOnly cookie and never returned in the body", () => {
  const response = fakeResponse();
  const user = {
    getJWTtoken: () => "header.payload.signature",
    toObject: () => ({ name: "Demo Student", email: "student1@dev.invalid", role: "student" }),
  };

  sendToken(user, 200, response);

  assert.equal(response.calls.status, 200);
  assert.equal(response.calls.cookie.name, "token");
  assert.equal(response.calls.cookie.value, "header.payload.signature");
  assert.equal(response.calls.cookie.options.httpOnly, true);
  assert.ok(response.calls.cookie.options.expires instanceof Date);
  assert.equal(JSON.stringify(response.calls.json).includes("header.payload.signature"), false);
  assert.equal("token" in response.calls.json, false);
  assert.equal(response.calls.json.user.email, "student1@dev.invalid");
});

test("a missing COOKIE_EXPIRE still produces a valid cookie expiry", () => {
  const previous = process.env.COOKIE_EXPIRE;
  delete process.env.COOKIE_EXPIRE;
  try {
    const response = fakeResponse();
    sendToken({ getJWTtoken: () => "jwt", toObject: () => ({}) }, 201, response);
    const expires = response.calls.cookie.options.expires;
    assert.ok(expires instanceof Date);
    assert.ok(Number.isFinite(expires.getTime()));
    const days = (expires.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    assert.ok(days > 6.9 && days <= 7.01);
  } finally {
    if (previous === undefined) delete process.env.COOKIE_EXPIRE;
    else process.env.COOKIE_EXPIRE = previous;
  }
});
