const { test, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../models/userModels");
const Enrollment = require("../models/enrollmentModels");
const CheckInSession = require("../models/checkInSessionModels");
const route = require("../routes/checkInSessionRoute");
const errorMiddleware = require("../middleware/error");

const SECRET = "student-active-sessions-secret-that-is-long-enough";
const { ObjectId } = mongoose.Types;

const staticSlots = {
  userFindById: [User, "findById"],
  enrollmentDistinct: [Enrollment, "distinct"],
  sessionFind: [CheckInSession, "find"],
};

let server;
let baseUrl;
const state = {};

const setEnv = () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = SECRET;
  delete process.env.TEST_STUDENT_EMAILS;
  delete process.env.TEST_TEACHER_EMAILS;
  delete process.env.DEV_AUTH_ENABLED;
};

const testWithEnv = (name, fn) =>
  test(name, async () => {
    setEnv();
    await fn();
  });

// With --test-isolation=none, other test files may install their own model
// mocks while this file is running. Restore only a method we still own, and
// only to the value that was present when this test first replaced it.
const mockStatic = (key, fn) => {
  const [model, name] = staticSlots[key];
  if (!Object.hasOwn(state.baseline, key)) state.baseline[key] = model[name];
  state.ours[key].add(fn);
  model[name] = fn;
};

const restoreStatics = () => {
  for (const [key, [model, name]] of Object.entries(staticSlots)) {
    if (state.ours?.[key]?.has(model[name]) && Object.hasOwn(state.baseline || {}, key)) {
      model[name] = state.baseline[key];
    }
  }
};

const makeUser = (overrides = {}) => ({
  _id: new ObjectId(),
  name: "Active Session Student",
  email: "Student@NITJSR.ac.in",
  role: "student",
  authProvider: "google",
  ...overrides,
});

const tokenFor = (user) =>
  jwt.sign({ id: String(user._id) }, SECRET, { expiresIn: "1h" });

const makeSession = (overrides = {}) => ({
  _id: new ObjectId(),
  status: "active",
  wave: 0,
  key: 12345678,
  keyIssuedAt: new Date("2026-10-25T10:00:00.000Z"),
  keyExpiresAt: new Date("2026-10-25T10:02:00.000Z"),
  startedAt: new Date("2026-10-25T10:00:00.000Z"),
  closedAt: null,
  courseClass: {
    _id: new ObjectId(),
    courseCode: "CS301",
    title: "Computer Networks",
    section: "A",
  },
  room: { _id: new ObjectId(), roomNo: "B-204" },
  ...overrides,
});

const install = ({ user, classIds = [], sessions = [] }) => {
  mockStatic("userFindById", async (id) => {
    state.authLookup = String(id);
    return user;
  });
  mockStatic("enrollmentDistinct", async (field, query) => {
    state.distinctCall = { field, query };
    return classIds;
  });
  mockStatic("sessionFind", (query) => {
    state.sessionQuery = query;
    return {
      populate(fields) {
        state.populate = fields;
        return this;
      },
      sort(sort) {
        state.sort = sort;
        return this;
      },
      limit(limit) {
        state.limit = limit;
        return Promise.resolve(sessions);
      },
    };
  });
};

const getActive = async (token) => {
  const headers = {};
  if (token) headers.Cookie = `token=${token}`;
  const response = await fetch(`${baseUrl}/api/v1/student/check-in-sessions/active`, {
    headers,
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { response, body };
};

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/v1", route);
  app.use(errorMiddleware);
  server = app.listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  restoreStatics();
});

beforeEach(() => {
  state.baseline = {};
  state.ours = Object.fromEntries(Object.keys(staticSlots).map((key) => [key, new Set()]));
  state.distinctCall = null;
  state.sessionQuery = null;
  state.limit = null;
});

afterEach(() => {
  restoreStatics();
});

testWithEnv("anonymous callers get 401", async () => {
  install({ user: makeUser(), classIds: [new ObjectId()] });
  const { response, body } = await getActive();
  assert.equal(response.status, 401);
  assert.equal(body.success, false);
});

testWithEnv("teachers cannot use the student discovery route", async () => {
  const teacher = makeUser({ role: "teacher", email: "teacher@nitjsr.ac.in" });
  install({ user: teacher, classIds: [new ObjectId()] });
  const { response, body } = await getActive(tokenFor(teacher));
  assert.equal(response.status, 403);
  assert.equal(body.success, false);
});

testWithEnv("a student with no active enrollment gets an empty list", async () => {
  const student = makeUser();
  install({ user: student, classIds: [] });
  const { response, body } = await getActive(tokenFor(student));

  assert.equal(response.status, 200);
  assert.deepEqual(body, { success: true, sessions: [] });
  assert.deepEqual(state.distinctCall, {
    field: "class",
    query: { email: "student@nitjsr.ac.in", status: "active" },
  });
  assert.equal(state.sessionQuery, null);
});

testWithEnv("active sessions are returned for the student's own enrollments only", async () => {
  const student = makeUser();
  const classOne = new ObjectId();
  const classTwo = new ObjectId();
  const sessions = [
    makeSession({ courseClass: { _id: classOne, courseCode: "CS301", title: "Networks", section: "A" } }),
    makeSession({
      _id: new ObjectId(),
      wave: 1,
      key: 87654321,
      courseClass: { _id: classTwo, courseCode: "CS302", title: "Databases", section: "B" },
      room: { _id: new ObjectId(), roomNo: "C-101" },
    }),
  ];
  install({ user: student, classIds: [classOne, classTwo], sessions });

  const { response, body } = await getActive(tokenFor(student));

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.sessions.length, 2);
  assert.equal(body.sessions[0].class.courseCode, "CS301");
  assert.equal(body.sessions[1].class.courseCode, "CS302");
  assert.deepEqual(state.sessionQuery, {
    courseClass: { $in: [classOne, classTwo] },
    status: "active",
  });
  assert.deepEqual(state.sort, { startedAt: -1 });
  assert.equal(state.limit, 20);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

testWithEnv("the response never contains a key or key history", async () => {
  const student = makeUser();
  const classId = new ObjectId();
  install({
    user: student,
    classIds: [classId],
    sessions: [makeSession({ courseClass: { _id: classId, courseCode: "CS301", title: "Networks", section: "A" } })],
  });

  const { response, body } = await getActive(tokenFor(student));

  assert.equal(response.status, 200);
  assert.equal(Object.hasOwn(body.sessions[0], "key"), false);
  assert.equal(Object.hasOwn(body.sessions[0], "keyHistory"), false);
  assert.equal(JSON.stringify(body).includes("12345678"), false);
});

testWithEnv("malformed enrollment class ids are filtered out before the query", async () => {
  const student = makeUser();
  const classId = new ObjectId();
  install({
    user: student,
    classIds: ["not-an-object-id", null, classId],
    sessions: [makeSession({ courseClass: { _id: classId, courseCode: "CS301", title: "Networks", section: "A" } })],
  });

  const { response, body } = await getActive(tokenFor(student));

  assert.equal(response.status, 200);
  assert.equal(body.sessions.length, 1);
  assert.deepEqual(state.sessionQuery.courseClass.$in, [classId]);
});
