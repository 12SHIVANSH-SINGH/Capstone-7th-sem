const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const User = require("../models/userModels");
const admin = require("../controllers/adminController");

const SECRET = "impersonation-test-secret-that-is-long-enough";

const runController = async (handler, req, res) => {
  let nextError = null;
  await new Promise((resolve) => {
    handler(req, res, (error) => {
      nextError = error || null;
      resolve();
    });
    // The controllers are wrapped by catchAsyncError, which does not return
    // the promise. A zero-delay tick lets a successful handler finish.
    setTimeout(resolve, 0);
  });
  if (nextError) throw nextError;
};

const response = () => {
  const calls = { cookies: [], cleared: [], status: null, body: null };
  return {
    calls,
    cookie(name, value, options) {
      calls.cookies.push({ name, value, options });
      return this;
    },
    clearCookie(name, options) {
      calls.cleared.push({ name, options });
      return this;
    },
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

const targetUser = (id) => ({
  _id: id,
  name: "Target Student",
  email: "student@nitjsr.ac.in",
  role: "student",
  status: "active",
  isDemo: false,
  getJWTtoken: (options) => {
    assert.equal(options.expiresIn, "15m");
    assert.equal(options.impersonatorVersion, 3);
    return "impersonation-jwt";
  },
});

const request = (overrides = {}) => ({
  params: { userId: String(overrides.targetId || new mongoose.Types.ObjectId()) },
  user: {
    _id: new mongoose.Types.ObjectId(),
    email: "owner@nitjsr.ac.in",
    role: "superadmin",
    tokenVersion: 3,
  },
  cookies: {},
  headers: { "user-agent": "test" },
  ip: "127.0.0.1",
  ...overrides,
});

test("cookie impersonation never returns the JWT in JSON", async (t) => {
  const targetId = new mongoose.Types.ObjectId();
  const target = targetUser(targetId);
  t.mock.method(User, "findById", async () => target);

  const res = response();
  await runController(
    admin.impersonate,
    request({ targetId, cookies: { token: "admin-cookie" } }),
    res
  );

  assert.equal(res.calls.status, 200);
  assert.equal(res.calls.body.success, true);
  assert.equal(res.calls.body.cookieSession, true);
  assert.equal("token" in res.calls.body, false);
  assert.deepEqual(
    res.calls.cookies.map((cookie) => cookie.name),
    ["admin_token", "token"]
  );
});

test("a bearer impersonation client still receives a token", async (t) => {
  const targetId = new mongoose.Types.ObjectId();
  t.mock.method(User, "findById", async () => targetUser(targetId));

  const res = response();
  await runController(admin.impersonate, request({ targetId }), res);

  assert.equal(res.calls.body.cookieSession, false);
  assert.equal(res.calls.body.token, "impersonation-jwt");
  assert.equal(res.calls.cookies.length, 0);
});

test("admin revocation bumps the target session version", async (t) => {
  const targetId = new mongoose.Types.ObjectId();
  const target = {
    _id: targetId,
    email: "student@nitjsr.ac.in",
    tokenVersion: 4,
    isDemo: false,
    save: async function save() {
      this.saved = true;
      return this;
    },
  };
  t.mock.method(User, "findById", async () => target);

  const res = response();
  const req = request({ targetId });
  req.params = { userId: String(targetId) };
  await runController(admin.revokeUserSessions, req, res);

  assert.equal(target.tokenVersion, 5);
  assert.equal(target.saved, true);
  assert.equal(res.calls.status, 200);
  assert.equal(res.calls.body.success, true);
});

test("stopping impersonation restores the admin cookie and clears the temporary one", async (t) => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = SECRET;
  process.env.SUPER_ADMIN_EMAILS = "owner@nitjsr.ac.in";

  const adminId = new mongoose.Types.ObjectId();
  const targetId = new mongoose.Types.ObjectId();
  const adminUser = {
    _id: adminId,
    name: "Owner",
    email: "owner@nitjsr.ac.in",
    role: "superadmin",
    status: "active",
    tokenVersion: 2,
    isDemo: false,
  };
  t.mock.method(User, "findById", async () => adminUser);

  const adminToken = jwt.sign(
    { id: String(adminId), tokenVersion: 2 },
    SECRET,
    { expiresIn: "1h" }
  );
  const targetToken = jwt.sign(
    { id: String(targetId), tokenVersion: 0, impersonatorId: String(adminId) },
    SECRET,
    { expiresIn: "15m" }
  );
  const req = {
    cookies: { admin_token: adminToken, token: targetToken },
    headers: { "user-agent": "test" },
    ip: "127.0.0.1",
  };
  const res = response();
  let nextError = null;

  await new Promise((resolve) => {
    admin.stopImpersonation(req, res, (error) => {
      nextError = error || null;
      resolve();
    });
    setTimeout(resolve, 0);
  });

  assert.equal(nextError, null);
  assert.equal(res.calls.status, 200);
  assert.equal(res.calls.cookies.length, 1);
  assert.equal(res.calls.cookies[0].name, "token");
  assert.equal(res.calls.cookies[0].value, adminToken);
  assert.deepEqual(
    res.calls.cleared.map((cookie) => cookie.name),
    ["admin_token"]
  );
  assert.equal(res.calls.body.user.email, "owner@nitjsr.ac.in");
});

test("stopping impersonation rejects an admin token from before a bump", async (t) => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = SECRET;
  process.env.SUPER_ADMIN_EMAILS = "owner@nitjsr.ac.in";

  const adminId = new mongoose.Types.ObjectId();
  const adminUser = {
    _id: adminId,
    email: "owner@nitjsr.ac.in",
    role: "superadmin",
    status: "active",
    tokenVersion: 2,
  };
  t.mock.method(User, "findById", async () => adminUser);

  const adminToken = jwt.sign(
    { id: String(adminId), tokenVersion: 1 },
    SECRET,
    { expiresIn: "1h" }
  );
  const req = {
    cookies: { admin_token: adminToken },
    headers: {},
    ip: "127.0.0.1",
    user: { _id: new mongoose.Types.ObjectId() },
  };
  const res = response();
  let nextError = null;

  await new Promise((resolve) => {
    admin.stopImpersonation(req, res, (error) => {
      nextError = error || null;
      resolve();
    });
  });

  assert.equal(nextError.statuscode, 401);
  assert.match(nextError.message, /no longer valid/i);
  assert.deepEqual(
    res.calls.cleared.map((cookie) => cookie.name),
    ["admin_token"]
  );
});
