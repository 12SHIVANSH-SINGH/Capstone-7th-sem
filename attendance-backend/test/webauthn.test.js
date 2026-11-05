const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const { configuredOrigins, rpIdFor, webauthnConfig } = require("../utils/webauthn");
const {
  STEP_UP_COOKIE,
  stepUpState,
  stepUpCookieOptions,
} = require("../utils/adminStepUp");
const {
  requireAdminStepUp,
  requireAdminStepUpForUserChange,
} = require("../middleware/adminStepUp");

const SECRET = "webauthn-test-secret-that-is-long-enough";
const ENV = { JWT_SECRET: SECRET };

// The middleware reads process.env, while the pure helpers accept an explicit
// environment. Keep the global mutation inside one call so the shared-process
// test mode cannot leak a secret from another suite.
const withSecret = (fn) => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SECRET;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
};

const adminUser = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  email: "owner@nitjsr.ac.in",
  role: "superadmin",
  status: "active",
  tokenVersion: 2,
  ...overrides,
});

const stepUpToken = (user, extra = {}) =>
  jwt.sign(
    {
      id: String(user._id),
      tokenVersion: user.tokenVersion,
      stepUp: true,
      scope: "admin",
    },
    SECRET,
    { expiresIn: "5m", ...extra }
  );

const request = (user, token) => ({
  user,
  cookies: token ? { [STEP_UP_COOKIE]: token } : {},
  headers: {},
  ip: "203.0.113.7",
});

const response = () => {
  const calls = { status: null, body: null };
  return {
    calls,
    status(code) {
      calls.status = code;
      return this;
    },
    json(body) {
      calls.body = body;
      return this;
    },
  };
};

test("origins come from explicit configuration, never a request header", () => {
  const env = {
    NODE_ENV: "production",
    WEBAUTHN_ORIGINS: " https://bio-attend.onrender.com/ , https://app.example.com ",
    CLIENT_URLS: "https://ignored.example.com",
    RENDER_EXTERNAL_URL: "https://render.example.com",
  };

  assert.deepEqual(configuredOrigins(env), [
    "https://bio-attend.onrender.com",
    "https://app.example.com",
  ]);
  assert.equal(rpIdFor(env), "bio-attend.onrender.com");
});

test("client URLs and Render's URL are server-side fallbacks", () => {
  assert.deepEqual(
    configuredOrigins({ NODE_ENV: "production", CLIENT_URLS: "https://app.example.com" }),
    ["https://app.example.com"]
  );
  assert.deepEqual(
    configuredOrigins({ NODE_ENV: "production", RENDER_EXTERNAL_URL: "https://bio.onrender.com" }),
    ["https://bio.onrender.com"]
  );
  assert.deepEqual(configuredOrigins({ NODE_ENV: "production" }), []);
});

test("local development accepts localhost origins", () => {
  const config = webauthnConfig({ NODE_ENV: "development" });
  assert.ok(config.origins.includes("http://localhost:3000"));
  assert.equal(config.rpID, "localhost");
  assert.equal(config.rpName, "Bio Attend");
});

test("RP id and RP name can be overridden", () => {
  const config = webauthnConfig({
    NODE_ENV: "production",
    WEBAUTHN_ORIGINS: "https://app.example.com",
    WEBAUTHN_RP_ID: "auth.example.com",
    WEBAUTHN_RP_NAME: "Bio Attend Admin",
  });
  assert.equal(config.rpID, "auth.example.com");
  assert.equal(config.rpName, "Bio Attend Admin");
});

test("a fresh passkey assertion is accepted for the same account", () => {
  const user = adminUser();
  const state = stepUpState(request(user, stepUpToken(user)), ENV);

  assert.equal(state.ok, true);
  assert.equal(state.claims.stepUp, true);
});

test("missing, foreign, stale and over-long assertions are rejected", () => {
  const user = adminUser();
  const other = adminUser();
  const cases = [
    [request(user), "missing"],
    [request(user, stepUpToken(other)), "wrong-user"],
    [request({ ...user, tokenVersion: 3 }, stepUpToken(user)), "stale-session"],
    [
      request(
        user,
        jwt.sign(
          { id: String(user._id), tokenVersion: user.tokenVersion, stepUp: true, scope: "session" },
          SECRET,
          { expiresIn: "5m" }
        )
      ),
      "wrong-scope",
    ],
    [
      request(
        user,
        jwt.sign(
          { id: String(user._id), tokenVersion: user.tokenVersion, stepUp: true, scope: "admin" },
          SECRET,
          { expiresIn: "1h" }
        )
      ),
      "lifetime-too-long",
    ],
  ];

  for (const [req, reason] of cases) {
    const state = stepUpState(req, ENV);
    assert.equal(state.ok, false, reason);
    assert.equal(state.reason, reason);
  }
});

test("the guard returns 428 instead of 403 when approval is missing", () => {
  const user = adminUser();
  const res = response();
  let nextError = null;

  withSecret(() =>
    requireAdminStepUp(request(user, null), res, (error) => {
      nextError = error || null;
    })
  );

  assert.equal(nextError, null);
  assert.equal(res.calls.status, 428);
  assert.equal(res.calls.body.code, "step_up_required");
});

test("the guard rejects a normal session token as step-up", () => {
  const user = adminUser();
  const normal = jwt.sign(
    { id: String(user._id), tokenVersion: user.tokenVersion },
    SECRET,
    { expiresIn: "5m" }
  );
  const res = response();

  withSecret(() => requireAdminStepUp(request(user, normal), res, () => {}));

  assert.equal(res.calls.status, 428);
  assert.equal(res.calls.body.reason, "wrong-scope");
});

test("the guard lets an approved assertion through", () => {
  const user = adminUser();
  let called = false;

  withSecret(() =>
    requireAdminStepUp(request(user, stepUpToken(user)), response(), (error) => {
      called = !error;
    })
  );

  assert.equal(called, true);
});

test("only role or status user edits need approval", () => {
  const user = adminUser();
  const profileOnly = { body: { name: "New name" }, user, cookies: {}, headers: {} };
  const sensitive = { body: { status: "disabled" }, user, cookies: {}, headers: {} };
  let profileNext = false;
  const res = response();
  let sensitiveNext = false;

  withSecret(() => {
    requireAdminStepUpForUserChange(profileOnly, res, () => {
      profileNext = true;
    });
    requireAdminStepUpForUserChange(sensitive, res, () => {
      sensitiveNext = true;
    });
  });

  assert.equal(profileNext, true);
  assert.equal(sensitiveNext, false);
  assert.equal(res.calls.status, 428);
});

test("the step-up cookie is narrowed to the admin API", () => {
  const options = stepUpCookieOptions(new Date("2030-01-01T00:00:00Z"));
  assert.equal(options.httpOnly, true);
  assert.equal(options.path, "/api/v1/admin");
  assert.ok(options.expires instanceof Date);
});
