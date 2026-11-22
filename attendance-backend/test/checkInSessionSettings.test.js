const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const CheckInSession = require("../models/checkInSessionModels");
const { updateAttendanceSettings } = require("../controllers/checkInSessionController");

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

const makeSession = (overrides = {}) => {
  const session = {
    _id: new mongoose.Types.ObjectId(),
    teacher: new mongoose.Types.ObjectId(),
    courseClass: { courseCode: "CS101", title: "Demo", section: "A" },
    room: { roomNo: "101" },
    classSnapshot: { courseCode: "CS101", title: "Demo", section: "A", roomNo: "101" },
    status: "active",
    wave: 0,
    key: 1,
    keyIssuedAt: new Date(),
    keyExpiresAt: new Date(Date.now() + 60_000),
    startedAt: new Date(),
    rosterCount: 1,
    attendanceFinalized: false,
    autoMarkPresent: false,
    autoMarkPresentAt: null,
    autoMarkPresentBy: null,
    autoMarkPresentByEmail: "",
    isDemo: false,
    saveCalls: 0,
    async save() {
      this.saveCalls += 1;
      return this;
    },
    ...overrides,
  };
  return session;
};

const mockSession = (t, session) => {
  const query = {
    populate() {
      return query;
    },
    then(resolve) {
      resolve(session);
    },
  };
  t.mock.method(CheckInSession, "findOne", () => query);
};

const run = async (req, res) => {
  let error = null;
  await new Promise((resolve) => {
    updateAttendanceSettings(req, res, (nextError) => {
      error = nextError || null;
      resolve();
    });
    setTimeout(resolve, 0);
  });
  return error;
};

test("a teacher can enable auto-present for a live session", async (t) => {
  const session = makeSession();
  mockSession(t, session);
  const res = response();
  const error = await run(
    {
      params: { sessionId: String(session._id) },
      user: { _id: session.teacher, email: "teacher@nitjsr.ac.in" },
      body: { autoMarkPresent: true },
    },
    res
  );

  assert.equal(error, null);
  assert.equal(res.calls.status, 200);
  assert.equal(session.autoMarkPresent, true);
  assert.equal(session.autoMarkPresentByEmail, "teacher@nitjsr.ac.in");
  assert.ok(session.autoMarkPresentAt instanceof Date);
  assert.equal(session.saveCalls, 1);
  assert.equal(res.calls.body.session.autoMarkPresent, true);
});

test("a closed session cannot be switched to auto-present", async (t) => {
  const session = makeSession({ status: "closed" });
  mockSession(t, session);
  const res = response();
  const error = await run(
    {
      params: { sessionId: String(session._id) },
      user: { _id: session.teacher, email: "teacher@nitjsr.ac.in" },
      body: { autoMarkPresent: true },
    },
    res
  );

  assert.ok(error);
  assert.equal(error.statuscode, 409);
  assert.equal(session.saveCalls, 0);
});

test("the setting must be an explicit boolean", async (t) => {
  const session = makeSession();
  mockSession(t, session);
  const res = response();
  const error = await run(
    {
      params: { sessionId: String(session._id) },
      user: { _id: session.teacher, email: "teacher@nitjsr.ac.in" },
      body: { autoMarkPresent: "yes" },
    },
    res
  );

  assert.ok(error);
  assert.equal(error.statuscode, 400);
  assert.equal(session.saveCalls, 0);
});

test("repeating the same value does not write or audit again", async (t) => {
  const session = makeSession({ autoMarkPresent: true });
  mockSession(t, session);
  const res = response();
  const error = await run(
    {
      params: { sessionId: String(session._id) },
      user: { _id: session.teacher, email: "teacher@nitjsr.ac.in" },
      body: { autoMarkPresent: true },
    },
    res
  );

  assert.equal(error, null);
  assert.equal(session.saveCalls, 0);
  assert.equal(res.calls.status, 200);
});
