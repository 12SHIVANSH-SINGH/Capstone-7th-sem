const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const express = require("express");
const { OAuth2Client } = require("google-auth-library");

const User = require("../models/userModels");
const Enrollment = require("../models/enrollmentModels");
const googleAuthRoute = require("../routes/googleAuthRoute");
const errorMiddleware = require("../middleware/error");

let server;
let url;
let currentPayload;
let verifyError;
let verifyOptions;
let rosterAccess = false;
let rosterQuery;
let infoLines = [];

const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;
const originalEnrollmentExists = Enrollment.exists;
const originalConsoleInfo = console.info;

before(async () => {
  OAuth2Client.prototype.verifyIdToken = async (options) => {
    verifyOptions = options;
    if (verifyError) throw verifyError;
    return { getPayload: () => currentPayload };
  };
  Enrollment.exists = async (query) => {
    rosterQuery = query;
    return rosterAccess ? { _id: "enrollment" } : null;
  };
  console.info = (...args) => {
    infoLines.push(args.join(" "));
  };

  const app = express();
  app.use(express.json());
  // Mount the real router so the rate limiter and route path are exercised.
  app.use(googleAuthRoute);
  app.use(errorMiddleware);
  server = app.listen(0);
  await once(server, "listening");
  url = `http://127.0.0.1:${server.address().port}/auth/google`;
});

after(async () => {
  OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
  Enrollment.exists = originalEnrollmentExists;
  console.info = originalConsoleInfo;
  if (server) await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  currentPayload = undefined;
  verifyError = undefined;
  verifyOptions = undefined;
  rosterAccess = false;
  rosterQuery = undefined;
  infoLines = [];
});

// Set the baseline inside each test body, not in a beforeEach hook. With
// `--test-isolation=none`, Node pre-runs top-level beforeEach hooks while
// another file's async test can be in flight, so hook-time env writes race.
const setEnv = (overrides = {}) => {
  process.env.NODE_ENV = "test";
  process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
  process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-hs256";
  process.env.JWT_EXPIRE = "5d";
  process.env.COOKIE_EXPIRE = "2";
  process.env.TEACHER_EMAILS = "";
  process.env.TEST_STUDENT_EMAILS = "";
  process.env.TEST_TEACHER_EMAILS = "";
  Object.assign(process.env, overrides);
};

const testWithEnv = (name, fn) =>
  test(name, async (t) => {
    setEnv();
    await fn(t);
  });

const makeUser = (data, saveImpl) => {
  const user = new User(data);
  user.save = saveImpl || (async () => user);
  return user;
};

const post = (body) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

testWithEnv("an allowlisted test teacher is created once and audited after persistence", async (t) => {
  process.env.TEST_TEACHER_EMAILS = "owner@gmail.com";
  // A value that is not the test baseline, so a hard-coded audience fails too.
  process.env.GOOGLE_CLIENT_ID = "audience-under-test";
  currentPayload = {
    email: "owner@gmail.com",
    email_verified: true,
    sub: "google-sub-owner",
    name: "Owner",
  };

  let created;
  t.mock.method(User, "findOne", async () => null);
  t.mock.method(User, "create", async (doc) => {
    created = doc;
    return makeUser(doc);
  });

  const response = await post({ credential: "fake-credential" });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(created.role, "teacher");
  assert.equal(body.success, true);
  assert.equal(body.user.role, "teacher");
  assert.equal(body.user.email, "owner@gmail.com");
  assert.equal(body.user.googleSubject, undefined);
  assert.equal(body.user.deviceBinding, undefined);
  assert.deepEqual(verifyOptions, {
    idToken: "fake-credential",
    audience: "audience-under-test",
  });
  assert.match(response.headers.get("set-cookie"), /token=/);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/i);
  assert.equal(infoLines.length, 1);
  assert.match(infoLines[0], /\[auth\] test teacher sign-in: owner@gmail.com/);
  assert.match(infoLines[0], /\(new\)/);
});

testWithEnv("a test student is created as a student and audited", async (t) => {
  process.env.TEST_STUDENT_EMAILS = "student@gmail.com";
  currentPayload = {
    email: "student@gmail.com",
    email_verified: true,
    sub: "google-sub-student",
    name: "Student",
  };

  let created;
  t.mock.method(User, "findOne", async () => null);
  t.mock.method(User, "create", async (doc) => {
    created = doc;
    return makeUser(doc);
  });

  const response = await post({ credential: "fake-credential" });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(created.role, "student");
  assert.equal(body.user.role, "student");
  assert.match(infoLines[0], /\[auth\] test student sign-in: student@gmail.com/);
});

testWithEnv("a listed test teacher promotes an existing student and logs the promotion", async (t) => {
  process.env.TEST_TEACHER_EMAILS = "owner@gmail.com";
  currentPayload = {
    email: "owner@gmail.com",
    email_verified: true,
    sub: "google-sub-owner",
    name: "Owner",
  };

  const user = makeUser({
    name: "Owner",
    email: "owner@gmail.com",
    role: "student",
    authProvider: "google",
    googleSubject: "google-sub-owner",
  });
  let saveCalls = 0;
  user.save = async () => {
    saveCalls += 1;
    return user;
  };
  t.mock.method(User, "findOne", async () => user);
  t.mock.method(User, "create", async () => {
    throw new Error("create should not be called for an existing user");
  });

  const response = await post({ credential: "fake-credential" });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(user.role, "teacher");
  assert.equal(saveCalls, 1);
  assert.equal(body.user.role, "teacher");
  assert.match(infoLines[0], /\(promoted\)/);
});

testWithEnv("removing a test teacher from the environment blocks the next sign-in", async (t) => {
  currentPayload = {
    email: "owner@gmail.com",
    email_verified: true,
    sub: "google-sub-owner",
  };

  const user = makeUser({
    name: "Owner",
    email: "owner@gmail.com",
    role: "teacher",
    authProvider: "google",
    googleSubject: "google-sub-owner",
  });
  let saveCalls = 0;
  user.save = async () => {
    saveCalls += 1;
    return user;
  };
  t.mock.method(User, "findOne", async () => user);
  t.mock.method(User, "create", async () => {
    throw new Error("create should not be called");
  });

  const response = await post({ credential: "fake-credential" });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.match(body.message, /NIT Jamshedpur Google Workspace/);
  assert.equal(saveCalls, 0);
  assert.equal(infoLines.length, 0);
});

testWithEnv("a failed save writes no test audit line", async (t) => {
  process.env.TEST_TEACHER_EMAILS = "owner@gmail.com";
  currentPayload = {
    email: "owner@gmail.com",
    email_verified: true,
    sub: "google-sub-owner",
  };

  const user = makeUser(
    {
      name: "Owner",
      email: "owner@gmail.com",
      role: "student",
      authProvider: "google",
      googleSubject: "google-sub-owner",
    },
    async () => {
      throw new Error("database write failed");
    }
  );
  t.mock.method(User, "findOne", async () => user);
  t.mock.method(User, "create", async () => {
    throw new Error("create should not be called");
  });

  const response = await post({ credential: "fake-credential" });

  assert.equal(response.status, 500);
  assert.equal(infoLines.length, 0);
});

testWithEnv("a first-sign-in duplicate-key race is recovered by re-reading the winner", async (t) => {
  process.env.TEST_TEACHER_EMAILS = "owner@gmail.com";
  currentPayload = {
    email: "owner@gmail.com",
    email_verified: true,
    sub: "google-sub-owner",
    name: "Owner",
  };

  const winner = makeUser({
    name: "Owner",
    email: "owner@gmail.com",
    role: "student",
    authProvider: "google",
    googleSubject: "google-sub-owner",
  });
  let findOneCalls = 0;
  t.mock.method(User, "findOne", async () => {
    findOneCalls += 1;
    return findOneCalls === 1 ? null : winner;
  });
  t.mock.method(User, "create", async () => {
    const error = new Error("duplicate key");
    error.code = 11000;
    error.keyPattern = { email: 1 };
    throw error;
  });

  const response = await post({ credential: "fake-credential" });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(findOneCalls, 2);
  assert.equal(winner.role, "teacher");
  assert.equal(body.user.role, "teacher");
  assert.match(infoLines[0], /\(promoted\)/);
});

testWithEnv("a different Google subject cannot bind an existing account", async (t) => {
  process.env.TEST_TEACHER_EMAILS = "owner@gmail.com";
  currentPayload = {
    email: "owner@gmail.com",
    email_verified: true,
    sub: "google-sub-attacker",
  };

  const user = makeUser({
    name: "Owner",
    email: "owner@gmail.com",
    role: "teacher",
    authProvider: "google",
    googleSubject: "google-sub-owner",
  });
  let saveCalls = 0;
  user.save = async () => {
    saveCalls += 1;
    return user;
  };
  t.mock.method(User, "findOne", async () => user);
  t.mock.method(User, "create", async () => {
    throw new Error("create should not be called");
  });

  const response = await post({ credential: "fake-credential" });

  assert.equal(response.status, 403);
  assert.equal(saveCalls, 0);
  assert.equal(infoLines.length, 0);
});

testWithEnv("an unverified email, a missing subject or a bad token is refused", async (t) => {
  process.env.TEST_TEACHER_EMAILS = "owner@gmail.com";
  t.mock.method(User, "findOne", async () => {
    throw new Error("the gate must run before the database");
  });
  t.mock.method(User, "create", async () => {
    throw new Error("the gate must run before the database");
  });

  currentPayload = {
    email: "owner@gmail.com",
    email_verified: "false",
    sub: "google-sub-owner",
  };
  let response = await post({ credential: "fake-credential" });
  assert.equal(response.status, 403);

  currentPayload = {
    email: "owner@gmail.com",
    email_verified: true,
  };
  response = await post({ credential: "fake-credential" });
  assert.equal(response.status, 403);

  verifyError = new Error("invalid token");
  response = await post({ credential: "fake-credential" });
  assert.equal(response.status, 401);

  assert.equal(infoLines.length, 0);
});

testWithEnv("a college account without the hosted-domain claim is refused", async (t) => {
  t.mock.method(User, "findOne", async () => {
    throw new Error("the gate must run before the database");
  });
  t.mock.method(User, "create", async () => {
    throw new Error("the gate must run before the database");
  });

  currentPayload = {
    email: "2023ugcs059@nitjsr.ac.in",
    email_verified: true,
    sub: "google-sub-college",
  };
  const response = await post({ credential: "fake-credential" });
  assert.equal(response.status, 403);
  // The hosted-domain gate must fail before any roster lookup.
  assert.equal(rosterQuery, undefined);
});

testWithEnv("a rostered college student signs in as a student", async (t) => {
  rosterAccess = true;
  currentPayload = {
    email: "2023ugcs059@nitjsr.ac.in",
    email_verified: true,
    hostedDomain: "nitjsr.ac.in",
    hd: "nitjsr.ac.in",
    sub: "google-sub-college",
    name: "College Student",
  };

  let created;
  t.mock.method(User, "findOne", async () => null);
  t.mock.method(User, "create", async (doc) => {
    created = doc;
    return makeUser(doc);
  });

  const response = await post({ credential: "fake-credential" });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(created.role, "student");
  assert.equal(body.user.role, "student");
  assert.deepEqual(rosterQuery, {
    email: "2023ugcs059@nitjsr.ac.in",
    status: "active",
  });
  assert.equal(infoLines.length, 0);
});

testWithEnv("TEACHER_EMAILS bootstraps a new college teacher but does not promote a student", async (t) => {
  process.env.TEACHER_EMAILS = "guide@nitjsr.ac.in";
  rosterAccess = true;
  currentPayload = {
    email: "guide@nitjsr.ac.in",
    email_verified: true,
    hd: "nitjsr.ac.in",
    sub: "google-sub-guide",
    name: "Guide",
  };

  let created;
  t.mock.method(User, "findOne", async () => null);
  t.mock.method(User, "create", async (doc) => {
    created = doc;
    return makeUser(doc);
  });

  let response = await post({ credential: "fake-credential" });
  assert.equal(response.status, 200);
  assert.equal(created.role, "teacher");

  // The same address, now an existing student, is not promoted by the list.
  const student = makeUser({
    name: "Guide",
    email: "guide@nitjsr.ac.in",
    role: "student",
    authProvider: "google",
    googleSubject: "google-sub-guide",
  });
  let saveCalls = 0;
  student.save = async () => {
    saveCalls += 1;
    return student;
  };
  t.mock.method(User, "findOne", async () => student);
  response = await post({ credential: "fake-credential" });
  assert.equal(response.status, 200);
  assert.equal(student.role, "student");
  assert.equal(saveCalls, 1);
});

testWithEnv("an existing college teacher stays a teacher after TEACHER_EMAILS is emptied", async (t) => {
  currentPayload = {
    email: "guide@nitjsr.ac.in",
    email_verified: true,
    hd: "nitjsr.ac.in",
    sub: "google-sub-guide",
  };

  const user = makeUser({
    name: "Guide",
    email: "guide@nitjsr.ac.in",
    role: "teacher",
    authProvider: "google",
    googleSubject: "google-sub-guide",
  });
  t.mock.method(User, "findOne", async () => user);
  t.mock.method(User, "create", async () => {
    throw new Error("create should not be called");
  });

  const response = await post({ credential: "fake-credential" });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(user.role, "teacher");
  assert.equal(body.user.role, "teacher");
  assert.equal(infoLines.length, 0);
});

testWithEnv("a test teacher moved to the student list is demoted on the next sign-in", async (t) => {
  process.env.TEST_STUDENT_EMAILS = "owner@gmail.com";
  currentPayload = {
    email: "owner@gmail.com",
    email_verified: true,
    sub: "google-sub-owner",
    name: "Owner",
  };

  const user = makeUser({
    name: "Owner",
    email: "owner@gmail.com",
    role: "teacher",
    authProvider: "google",
    googleSubject: "google-sub-owner",
  });
  let saveCalls = 0;
  user.save = async () => {
    saveCalls += 1;
    return user;
  };
  t.mock.method(User, "findOne", async () => user);
  t.mock.method(User, "create", async () => {
    throw new Error("create should not be called");
  });

  const response = await post({ credential: "fake-credential" });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(user.role, "student");
  assert.equal(body.user.role, "student");
  assert.equal(saveCalls, 1);
  assert.match(infoLines[0], /\[auth\] test student sign-in: owner@gmail.com/);
  assert.match(infoLines[0], /\(demoted\)/);
});

testWithEnv("a dev.invalid identity is refused before the Google gate", async (t) => {
  t.mock.method(User, "findOne", async () => {
    throw new Error("the gate must run before the database");
  });
  t.mock.method(User, "create", async () => {
    throw new Error("the gate must run before the database");
  });

  currentPayload = {
    email: "teacher@dev.invalid",
    email_verified: true,
    sub: "google-sub-dev",
  };
  const response = await post({ credential: "fake-credential" });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.match(body.message, /Dev test identities cannot sign in with Google/);
  assert.equal(infoLines.length, 0);
});

testWithEnv("a duplicated Google subject is refused, not retried as an email race", async (t) => {
  process.env.TEST_TEACHER_EMAILS = "second@gmail.com";
  currentPayload = {
    email: "second@gmail.com",
    email_verified: true,
    sub: "shared-google-subject",
  };

  let findOneCalls = 0;
  t.mock.method(User, "findOne", async () => {
    findOneCalls += 1;
    return null;
  });
  t.mock.method(User, "create", async () => {
    const error = new Error("duplicate key");
    error.code = 11000;
    // Real drivers can report either shape; the controller must not treat
    // this as the email race.
    error.keyValue = { googleSubject: 1 };
    throw error;
  });

  const response = await post({ credential: "fake-credential" });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.match(body.message, /already linked to another account/);
  assert.equal(findOneCalls, 1);
  assert.equal(infoLines.length, 0);
});

testWithEnv("a Google subject collision while saving an existing account is refused", async (t) => {
  process.env.TEST_TEACHER_EMAILS = "owner@gmail.com";
  currentPayload = {
    email: "owner@gmail.com",
    email_verified: true,
    sub: "google-sub-owner",
  };

  const user = makeUser({
    name: "Owner",
    email: "owner@gmail.com",
    role: "student",
    authProvider: "google",
    googleSubject: "google-sub-owner",
  });
  user.save = async () => {
    const error = new Error("duplicate key");
    error.code = 11000;
    error.keyPattern = { googleSubject: 1 };
    throw error;
  };
  t.mock.method(User, "findOne", async () => user);
  t.mock.method(User, "create", async () => {
    throw new Error("create should not be called");
  });

  const response = await post({ credential: "fake-credential" });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.match(body.message, /already linked to another account/);
  assert.equal(infoLines.length, 0);
});

testWithEnv("the real route rate-limits repeated sign-in attempts", async () => {
  // No valid payload is needed: the limiter runs before the controller. Drive
  // well past the 30-request window so this fails if the limiter is removed
  // from the route, regardless of requests made by earlier tests.
  const statuses = [];
  for (let index = 0; index < 40; index += 1) {
    const response = await post({ credential: "fake-credential" });
    statuses.push(response.status);
  }
  assert.ok(statuses.includes(429), `expected a 429, got ${[...new Set(statuses)]}`);
});
