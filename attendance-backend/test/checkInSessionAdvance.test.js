const { test, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../models/userModels");
const CheckInSession = require("../models/checkInSessionModels");
const CheckInProof = require("../models/checkInProofModels");
const route = require("../routes/checkInSessionRoute");
const errorMiddleware = require("../middleware/error");
const sessionCore = require("../utils/checkInSession");

const SECRET = "session-advance-secret-that-is-long-enough";
const { ObjectId } = mongoose.Types;

const staticSlots = {
  userFindById: [User, "findById"],
  sessionFindOne: [CheckInSession, "findOne"],
  sessionFindOneAndUpdate: [CheckInSession, "findOneAndUpdate"],
  proofExists: [CheckInProof, "exists"],
};

let server;
let baseUrl;
const state = {};

const setEnv = () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = SECRET;
  delete process.env.DEV_AUTH_ENABLED;
  delete process.env.TEST_STUDENT_EMAILS;
  delete process.env.TEST_TEACHER_EMAILS;
};

const testWithEnv = (name, fn) =>
  test(name, async () => {
    setEnv();
    await fn();
  });

// With --test-isolation=none, restore only methods this file actually replaced.
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
  name: "Advance Teacher",
  email: "teacher@nitjsr.ac.in",
  role: "teacher",
  authProvider: "google",
  ...overrides,
});

const tokenFor = (user) =>
  jwt.sign({ id: String(user._id) }, SECRET, { expiresIn: "1h" });

const makeSession = (overrides = {}) => ({
  _id: new ObjectId(),
  status: "active",
  wave: 0,
  key: 111111,
  keyIssuedAt: new Date("2026-10-29T10:00:00.000Z"),
  keyExpiresAt: new Date("2026-10-29T10:02:00.000Z"),
  startedAt: new Date("2026-10-29T10:00:00.000Z"),
  closedAt: null,
  keyHistory: [],
  teacher: new ObjectId(),
  courseClass: {
    _id: new ObjectId(),
    courseCode: "CS301",
    title: "Computer Networks",
    section: "A",
  },
  room: { _id: new ObjectId(), roomNo: "B-204" },
  ...overrides,
});

const install = ({ user, session, evidence = true, updated = undefined }) => {
  mockStatic("userFindById", async (id) => {
    state.authLookup = String(id);
    return user;
  });
  mockStatic("sessionFindOne", (query) => {
    state.sessionQuery = query;
    return {
      populate: async (fields) => {
        state.populate = fields;
        return session;
      },
    };
  });
  mockStatic("proofExists", async (query) => {
    state.evidenceQuery = query;
    return evidence ? { _id: new ObjectId() } : null;
  });
  mockStatic("sessionFindOneAndUpdate", (filter, update, options) => {
    state.updateFilter = filter;
    state.update = update;
    state.updateOptions = options;
    return {
      populate: async (fields) => {
        state.updatePopulate = fields;
        if (updated !== undefined) return updated;
        const pushed = update?.$push?.keyHistory?.$each || [];
        const history = [...(session.keyHistory || []), ...pushed].slice(
          -sessionCore.MAX_KEY_HISTORY
        );
        return { ...session, ...update.$set, keyHistory: history };
      },
    };
  });
};

const advance = async (sessionId, token) => {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Cookie = `token=${token}`;
  const response = await fetch(
    `${baseUrl}/api/v1/check-in-sessions/${encodeURIComponent(sessionId)}/advance`,
    { method: "POST", headers, body: "{}" }
  );
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { response, body, text };
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
  state.authLookup = null;
  state.sessionQuery = null;
  state.evidenceQuery = null;
  state.updateFilter = null;
  state.update = null;
  state.updateOptions = null;
});

afterEach(() => {
  restoreStatics();
});

testWithEnv("anonymous callers get 401", async () => {
  install({ user: makeUser(), session: makeSession() });
  const { response, body } = await advance(new ObjectId());
  assert.equal(response.status, 401);
  assert.equal(body.success, false);
  assert.equal(state.evidenceQuery, null);
});

testWithEnv("students cannot advance a wave", async () => {
  const student = makeUser({ role: "student", email: "student@nitjsr.ac.in" });
  install({ user: student, session: makeSession() });
  const { response, body } = await advance(new ObjectId(), tokenFor(student));
  assert.equal(response.status, 403);
  assert.equal(body.success, false);
});

testWithEnv("a session the teacher does not own is not found", async () => {
  const teacher = makeUser();
  install({ user: teacher, session: null });
  const { response, body } = await advance(new ObjectId(), tokenFor(teacher));
  assert.equal(response.status, 404);
  assert.equal(body.success, false);
  assert.equal(state.evidenceQuery, null);
});

testWithEnv("a closed session cannot advance", async () => {
  const teacher = makeUser();
  install({ user: teacher, session: makeSession({ status: "closed" }) });
  const { response, body } = await advance(new ObjectId(), tokenFor(teacher));
  assert.equal(response.status, 409);
  assert.match(body.message, /closed/);
  assert.equal(state.evidenceQuery, null);
});

testWithEnv("a wave with no accepted evidence cannot advance", async () => {
  const teacher = makeUser();
  const session = makeSession();
  install({ user: teacher, session, evidence: false });
  const { response, body } = await advance(session._id, tokenFor(teacher));

  assert.equal(response.status, 409);
  assert.match(body.message, /No phone has recorded evidence/);
  assert.deepEqual(state.evidenceQuery, { session: session._id, wave: 0 });
  assert.equal(state.update, null);
});

testWithEnv("advancing archives the old key, mints the next wave and hides old keys", async () => {
  const teacher = makeUser();
  const session = makeSession({ teacher: teacher._id });
  install({ user: teacher, session, evidence: true });

  const { response, body } = await advance(session._id, tokenFor(teacher));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(body.success, true);
  assert.equal(body.session.wave, 1);
  assert.equal(body.session.key, state.update.$set.key);
  assert.notEqual(body.session.key, session.key);
  assert.equal(body.session.keyExpired, false);
  assert.equal(body.session.waveHistory.length, 1);
  assert.deepEqual(body.session.waveHistory[0], {
    wave: 0,
    keyIssuedAt: "2026-10-29T10:00:00.000Z",
    keyExpiresAt: "2026-10-29T10:02:00.000Z",
  });
  assert.equal(JSON.stringify(body).includes(String(session.key)), false);
  assert.equal(JSON.stringify(body).includes("keyHistory"), false);

  assert.deepEqual(state.updateFilter, {
    _id: session._id,
    teacher: teacher._id,
    status: "active",
    wave: 0,
  });
  assert.equal(state.update.$set.wave, 1);
  assert.ok(state.update.$set.keyIssuedAt instanceof Date);
  assert.ok(state.update.$set.keyExpiresAt instanceof Date);
  assert.equal(
    state.update.$set.keyExpiresAt.getTime() - state.update.$set.keyIssuedAt.getTime(),
    sessionCore.KEY_TTL_MS
  );
  assert.equal(state.update.$push.keyHistory.$each.length, 1);
  assert.deepEqual(state.update.$push.keyHistory.$each[0], {
    wave: 0,
    key: session.key,
    keyIssuedAt: session.keyIssuedAt,
    keyExpiresAt: session.keyExpiresAt,
  });
  assert.equal(state.update.$push.keyHistory.$slice, -sessionCore.MAX_KEY_HISTORY);
  assert.equal(state.updateOptions.new, true);
  assert.equal(state.updateOptions.runValidators, true);
});

testWithEnv("a concurrent advance loses cleanly instead of overwriting the winner", async () => {
  const teacher = makeUser();
  const session = makeSession({ teacher: teacher._id });
  install({ user: teacher, session, evidence: true, updated: null });

  const { response, body } = await advance(session._id, tokenFor(teacher));
  assert.equal(response.status, 409);
  assert.match(body.message, /changed before the wave could advance/);
});

testWithEnv("the teacher evidence view lists submissions and no attendance decision", async () => {
  const teacher = makeUser();
  const session = makeSession({ teacher: teacher._id });
  install({ user: teacher, session });

  const proofOne = {
    _id: new ObjectId(),
    studentEmail: "Student@NITJSR.ac.in",
    wave: 0,
    createdAt: new Date("2026-10-29T10:01:00.000Z"),
    key: 111111,
    signature: "secret",
  };
  const proofTwo = {
    _id: new ObjectId(),
    studentEmail: "second@nitjsr.ac.in",
    wave: 1,
    createdAt: new Date("2026-10-29T10:03:00.000Z"),
  };
  let evidenceQuery = null;
  let selectedFields = null;
  let sort = null;
  let limit = null;
  const originalFind = CheckInProof.find;
  CheckInProof.find = (query) => {
    evidenceQuery = query;
    return {
      select(fields) {
        selectedFields = fields;
        return this;
      },
      sort(value) {
        sort = value;
        return this;
      },
      limit(value) {
        limit = value;
        return Promise.resolve([proofOne, proofTwo]);
      },
    };
  };

  try {
    const headers = { Cookie: `token=${tokenFor(teacher)}` };
    const response = await fetch(
      `${baseUrl}/api/v1/check-in-sessions/${session._id}/proofs`,
      { headers }
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(evidenceQuery, { session: session._id });
    assert.equal(selectedFields, "studentEmail wave createdAt");
    assert.deepEqual(sort, { createdAt: 1 });
    assert.equal(limit, 500);
    assert.equal(body.success, true);
    assert.equal(body.attendanceDecided, false);
    assert.equal(body.total, 2);
    assert.deepEqual(body.byWave, [
      { wave: 0, count: 1 },
      { wave: 1, count: 1 },
    ]);
    assert.deepEqual(body.proofs, [
      {
        id: String(proofOne._id),
        studentEmail: "student@nitjsr.ac.in",
        wave: 0,
        recordedAt: "2026-10-29T10:01:00.000Z",
      },
      {
        id: String(proofTwo._id),
        studentEmail: "second@nitjsr.ac.in",
        wave: 1,
        recordedAt: "2026-10-29T10:03:00.000Z",
      },
    ]);
    for (const forbidden of ["key", "signature", "protocolVersion", "deviceFingerprint", "attendance"]) {
      assert.equal(JSON.stringify(body).includes(`"${forbidden}"`), false, forbidden);
    }
  } finally {
    CheckInProof.find = originalFind;
  }
});
