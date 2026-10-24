const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");

const User = require("../models/userModels");
const isAuthenticated = require("../middleware/auth");
const { isAuth } = require("../controllers/userController");
const errorMiddleware = require("../middleware/error");

let server;
let baseUrl;
const SECRET = "middleware-test-secret-that-is-long-enough";

before(async () => {
  const app = express();
  app.use(cookieParser());
  app.get("/protected", isAuthenticated, (req, res) => {
    res.status(200).json({ success: true, role: req.user.role });
  });
  app.get("/islogin", isAuth);
  app.use(errorMiddleware);
  server = app.listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

// Set the baseline inside each test body, not in a beforeEach hook:
// `--test-isolation=none` pre-runs top-level hooks while another file's async
// test can be in flight, and these tests exercise env re-checks per request.
const setEnv = (overrides = {}) => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = SECRET;
  process.env.TEACHER_EMAILS = "guide@nitjsr.ac.in";
  process.env.TEST_STUDENT_EMAILS = "";
  process.env.TEST_TEACHER_EMAILS = "owner@gmail.com";
  delete process.env.DEV_AUTH_ENABLED;
  Object.assign(process.env, overrides);
};

const testWithEnv = (name, fn) =>
  test(name, async (t) => {
    setEnv();
    await fn(t);
  });

const makeUser = (data) =>
  new User({
    name: "Test User",
    authProvider: "google",
    ...data,
  });

const tokenFor = (user) => jwt.sign({ id: String(user._id) }, SECRET, { expiresIn: "1h" });

const get = (path, user) =>
  fetch(`${baseUrl}${path}`, {
    headers: user ? { Cookie: `token=${tokenFor(user)}` } : {},
  });

testWithEnv("a live college teacher session is accepted", async (t) => {
  const user = makeUser({
    email: "guide@nitjsr.ac.in",
    role: "teacher",
    googleSubject: "google-sub-guide",
    deviceBinding: { fingerprint: "abc" },
  });
  t.mock.method(User, "findById", async (id) => {
    assert.equal(String(id), String(user._id));
    return user;
  });

  const response = await get("/protected", user);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.role, "teacher");

  const login = await get("/islogin", user);
  const loginBody = await login.json();
  assert.equal(login.status, 200);
  assert.equal(loginBody.user.email, "guide@nitjsr.ac.in");
  assert.equal(loginBody.user.googleSubject, undefined);
  assert.equal(loginBody.user.deviceBinding, undefined);
});

testWithEnv("a listed Gmail test teacher session is accepted", async (t) => {
  const user = makeUser({ email: "owner@gmail.com", role: "teacher" });
  t.mock.method(User, "findById", async () => user);

  const response = await get("/protected", user);
  assert.equal(response.status, 200);
});

testWithEnv("removing the Gmail test teacher from the environment revokes the live session", async (t) => {
  process.env.TEST_TEACHER_EMAILS = "";
  const user = makeUser({ email: "owner@gmail.com", role: "teacher" });
  t.mock.method(User, "findById", async () => user);

  const response = await get("/protected", user);
  assert.equal(response.status, 401);

  const login = await get("/islogin", user);
  assert.equal(login.status, 401);
});

testWithEnv("a dev persona needs the dev gate to still be open", async (t) => {
  const user = makeUser({
    email: "teacher@dev.invalid",
    role: "teacher",
    authProvider: "dev",
  });
  t.mock.method(User, "findById", async () => user);

  let response = await get("/protected", user);
  assert.equal(response.status, 401);

  process.env.DEV_AUTH_ENABLED = "true";
  response = await get("/protected", user);
  assert.equal(response.status, 200);
});

testWithEnv("a missing token or a missing user is refused", async (t) => {
  t.mock.method(User, "findById", async () => null);

  const noToken = await fetch(`${baseUrl}/protected`);
  assert.equal(noToken.status, 401);

  const missingUser = makeUser({ email: "guide@nitjsr.ac.in", role: "teacher" });
  const response = await get("/protected", missingUser);
  assert.equal(response.status, 401);
});

testWithEnv("expired, invalid and staffelessly forged tokens are 401", async (t) => {
  const user = makeUser({ email: "guide@nitjsr.ac.in", role: "teacher" });
  t.mock.method(User, "findById", async () => user);

  const expired = jwt.sign({ id: String(user._id) }, SECRET, { expiresIn: -10 });
  let response = await fetch(`${baseUrl}/protected`, {
    headers: { Cookie: `token=${expired}` },
  });
  assert.equal(response.status, 401);
  assert.match((await response.json()).message, /expired/i);

  response = await fetch(`${baseUrl}/protected`, {
    headers: { Cookie: "token=not-a-jwt" },
  });
  assert.equal(response.status, 401);
  assert.match((await response.json()).message, /invalid/i);

  const forged = jwt.sign({ id: String(user._id) }, "a-different-secret-that-is-long-enough", {
    expiresIn: "1h",
  });
  response = await fetch(`${baseUrl}/protected`, {
    headers: { Cookie: `token=${forged}` },
  });
  assert.equal(response.status, 401);
  assert.match((await response.json()).message, /invalid/i);
});
