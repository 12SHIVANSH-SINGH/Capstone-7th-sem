const { test } = require("node:test");
const assert = require("node:assert/strict");
const { cookieOptions, sameSitePolicy } = require("../utils/cookieOptions");

const env = (overrides = {}) => ({ NODE_ENV: "test", ...overrides });

test("the default is a first-party Lax cookie", () => {
  const options = cookieOptions(undefined, env());

  assert.deepEqual(options, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
  });
});

test("production is Secure and still Lax for the one-service deployment", () => {
  const options = cookieOptions(new Date("2030-01-01T00:00:00Z"), env({ NODE_ENV: "production" }));

  assert.equal(options.httpOnly, true);
  assert.equal(options.secure, true);
  assert.equal(options.sameSite, "lax");
  assert.equal(options.path, "/");
  assert.ok(options.expires instanceof Date);
});

test("split hosting can opt into SameSite=None, which forces Secure", () => {
  const options = cookieOptions(undefined, env({ NODE_ENV: "production", COOKIE_SAMESITE: "none" }));

  assert.equal(options.sameSite, "none");
  assert.equal(options.secure, true);
});

test("Strict is honoured when explicitly configured", () => {
  assert.equal(sameSitePolicy(env({ COOKIE_SAMESITE: " STRICT " })), "strict");
});

test("an unknown SameSite value falls back to Lax", () => {
  assert.equal(sameSitePolicy(env({ COOKIE_SAMESITE: "sometimes" })), "lax");
});
