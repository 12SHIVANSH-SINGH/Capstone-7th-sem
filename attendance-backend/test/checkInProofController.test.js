const { test, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { webcrypto } = require("node:crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../models/userModels");
const CheckInSession = require("../models/checkInSessionModels");
const CheckInProof = require("../models/checkInProofModels");
const Enrollment = require("../models/enrollmentModels");
const DeviceBindingRequest = require("../models/deviceBindingRequestModels");
const route = require("../routes/checkInSessionRoute");
const errorMiddleware = require("../middleware/error");
const client = require("../../attendance-frontend/src/acoustic/proofTransport");

const SECRET = "proof-controller-route-secret-that-is-long-enough";
const { ObjectId } = mongoose.Types;

const staticSlots = {
  userFindById: [User, "findById"],
  sessionFindById: [CheckInSession, "findById"],
  enrollmentExists: [Enrollment, "exists"],
  deviceRequestExists: [DeviceBindingRequest, "exists"],
  proofFindOne: [CheckInProof, "findOne"],
  proofCreate: [CheckInProof, "create"],
};

let server;
let baseUrl;
const state = {};
const devices = {};

const setEnv = () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = SECRET;
  delete process.env.DEV_AUTH_ENABLED;
};

const testWithEnv = (name, fn) =>
  test(name, async () => {
    setEnv();
    await fn();
  });

// With --test-isolation=none, other test files can install their own model
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

const makeDevice = async (label) => {
  const pair = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  return {
    label,
    privateKey: pair.privateKey,
    publicKeyJwk: await webcrypto.subtle.exportKey("jwk", pair.publicKey),
    fingerprint: `fingerprint-${label}`,
  };
};

const makeUser = (overrides = {}) => ({
  _id: new ObjectId(),
  name: "Proof Student",
  email: " Student@NITJSR.ac.in ",
  role: "student",
  authProvider: "google",
  deviceBinding: {
    fingerprint: devices.student.fingerprint,
    publicKeyJwk: devices.student.publicKeyJwk,
    approvedAt: new Date(),
  },
  ...overrides,
});

const makeSession = (overrides = {}) => ({
  _id: new ObjectId(),
  courseClass: new ObjectId(),
  status: "active",
  wave: 2,
  key: 9876543,
  keyIssuedAt: new Date(Date.now() - 30_000),
  keyExpiresAt: new Date(Date.now() + 120_000),
  ...overrides,
});

const sign = async ({ sessionId, wave, key, studentId, device = devices.student }) =>
  client.signProofMessage(
    device.privateKey,
    client.buildProofMessage({ sessionId, wave, key, studentId }),
    webcrypto.subtle
  );

const tokenFor = (user) =>
  jwt.sign({ id: String(user._id) }, SECRET, { expiresIn: "1h" });

const validSignature = () => Buffer.alloc(64, 1).toString("base64");

const installBase = ({ user, session, enrolled = true, pending = null, existing = null }) => {
  mockStatic("userFindById", async (id) => {
    state.authLookup = String(id);
    return user;
  });
  mockStatic("sessionFindById", (id) => {
    state.sessionLookup = String(id);
    return {
      select: async (fields) => {
        state.sessionSelect = fields;
        return session;
      },
    };
  });
  mockStatic("enrollmentExists", async (query) => {
    state.enrollmentQueries.push(query);
    return enrolled ? { _id: new ObjectId() } : null;
  });
  mockStatic("deviceRequestExists", async (query) => {
    state.deviceQueries.push(query);
    return pending;
  });
  mockStatic("proofFindOne", async (query) => {
    state.proofQueries.push(query);
    return existing;
  });
  mockStatic("proofCreate", async (doc) => {
    state.created.push(doc);
    return { _id: state.proofId, createdAt: state.proofCreatedAt, ...doc };
  });
};

const postProof = async ({ sessionId, body, rawBody, token }) => {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Cookie = `token=${token}`;
  const response = await fetch(
    `${baseUrl}/api/v1/check-in-sessions/${encodeURIComponent(sessionId)}/proofs`,
    {
      method: "POST",
      headers,
      body: rawBody !== undefined ? rawBody : JSON.stringify(body),
    }
  );
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, body: json, text, headers: response.headers };
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
  devices.student = await makeDevice("student");
  devices.other = await makeDevice("other");
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  restoreStatics();
});

beforeEach(() => {
  proofSubmitLimiterReset();
  state.baseline = {};
  state.ours = Object.fromEntries(
    Object.keys(staticSlots).map((key) => [key, new Set()])
  );
  state.enrollmentQueries = [];
  state.deviceQueries = [];
  state.proofQueries = [];
  state.created = [];
  state.proofId = new ObjectId();
  state.proofCreatedAt = new Date("2026-10-25T10:00:01.000Z");
  state.authLookup = null;
  state.sessionLookup = null;
  state.sessionSelect = null;
});

afterEach(() => {
  restoreStatics();
  proofSubmitLimiterReset();
});

const proofSubmitLimiterReset = () => route.proofSubmitLimiter.reset();

testWithEnv("201 records the signed proof without deciding attendance or leaking evidence", async () => {
  const user = makeUser();
  const session = makeSession();
  installBase({ user, session });
  const signature = await sign({
    sessionId: session._id,
    wave: session.wave,
    key: session.key,
    studentId: user._id,
  });

  const result = await postProof({
    sessionId: session._id,
    token: tokenFor(user),
    body: { wave: session.wave, key: session.key, signature },
  });

  assert.equal(result.status, 201);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.deepEqual(result.body, {
    success: true,
    recorded: true,
    duplicate: false,
    attendanceDecided: false,
    proof: {
      id: String(state.proofId),
      sessionId: String(session._id),
      wave: session.wave,
      recordedAt: state.proofCreatedAt.toISOString(),
      duplicate: false,
    },
  });
  assert.deepEqual(Object.keys(result.body.proof).sort(), [
    "duplicate",
    "id",
    "recordedAt",
    "sessionId",
    "wave",
  ]);
  for (const forbidden of [
    "key",
    "signature",
    "protocolVersion",
    "studentEmail",
    "deviceFingerprint",
  ]) {
    assert.equal(Object.hasOwn(result.body.proof, forbidden), false, forbidden);
    assert.equal(result.text.includes(`"${forbidden}"`), false, forbidden);
  }
  assert.equal(state.created.length, 1);
  assert.deepEqual(state.created[0], {
    session: session._id,
    courseClass: session.courseClass,
    student: user._id,
    studentEmail: "student@nitjsr.ac.in",
    deviceFingerprint: devices.student.fingerprint,
    wave: session.wave,
    key: session.key,
    signature,
    protocolVersion: client.PROOF_MESSAGE_VERSION,
  });
  assert.equal(state.enrollmentQueries.length, 1);
  assert.deepEqual(state.enrollmentQueries[0], {
    class: session.courseClass,
    email: "student@nitjsr.ac.in",
    status: "active",
  });
  assert.equal(state.sessionSelect, "courseClass status wave key keyExpiresAt");
});

testWithEnv("200 returns the same proof for an exact retry and does not create again", async () => {
  const user = makeUser();
  const session = makeSession();
  const existing = {
    _id: new ObjectId(),
    session: session._id,
    wave: session.wave,
    key: session.key,
    createdAt: new Date("2026-10-25T09:00:00.000Z"),
  };
  installBase({ user, session, existing });
  const signature = await sign({
    sessionId: session._id,
    wave: session.wave,
    key: session.key,
    studentId: user._id,
  });

  const result = await postProof({
    sessionId: session._id,
    token: tokenFor(user),
    body: { wave: session.wave, key: session.key, signature },
  });

  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(result.body.duplicate, true);
  assert.equal(result.body.attendanceDecided, false);
  assert.equal(result.body.proof.id, String(existing._id));
  assert.equal(result.body.proof.duplicate, true);
  assert.equal(state.created.length, 0);
});

testWithEnv("401 refuses a proof without a session cookie", async () => {
  const user = makeUser();
  const session = makeSession();
  installBase({ user, session });

  const result = await postProof({
    sessionId: session._id,
    body: { wave: session.wave, key: session.key, signature: validSignature() },
  });

  assert.equal(result.status, 401);
  assert.match(result.body.message, /login/i);
  assert.equal(state.authLookup, null);
  assert.equal(state.sessionLookup, null);
});

testWithEnv("403 refuses a teacher and never reaches enrollment or storage", async () => {
  const user = makeUser({ role: "teacher" });
  const session = makeSession();
  installBase({ user, session });

  const result = await postProof({
    sessionId: session._id,
    token: tokenFor(user),
    body: { wave: session.wave, key: session.key, signature: validSignature() },
  });

  assert.equal(result.status, 403);
  assert.match(result.body.message, /permission/i);
  assert.equal(state.sessionLookup, null);
  assert.equal(state.enrollmentQueries.length, 0);
  assert.equal(state.created.length, 0);
});

testWithEnv("403 refuses a student with no active enrollment and queries status active", async () => {
  const user = makeUser();
  const session = makeSession();
  installBase({ user, session, enrolled: false });
  const signature = await sign({
    sessionId: session._id,
    wave: session.wave,
    key: session.key,
    studentId: user._id,
  });

  const result = await postProof({
    sessionId: session._id,
    token: tokenFor(user),
    body: { wave: session.wave, key: session.key, signature },
  });

  assert.equal(result.status, 403);
  assert.match(result.body.message, /not on this class roster/i);
  assert.deepEqual(state.enrollmentQueries, [
    {
      class: session.courseClass,
      email: "student@nitjsr.ac.in",
      status: "active",
    },
  ]);
  assert.equal(state.deviceQueries.length, 0);
  assert.equal(state.created.length, 0);
});

testWithEnv("403 refuses missing or unapproved device bindings", async () => {
  const session = makeSession();
  const signature = await sign({
    sessionId: session._id,
    wave: session.wave,
    key: session.key,
    studentId: new ObjectId(),
  });
  const variants = [
    makeUser({ deviceBinding: undefined }),
    makeUser({
      deviceBinding: {
        fingerprint: devices.student.fingerprint,
        publicKeyJwk: devices.student.publicKeyJwk,
      },
    }),
    makeUser({
      deviceBinding: {
        fingerprint: devices.student.fingerprint,
        approvedAt: new Date(),
      },
    }),
  ];

  for (const user of variants) {
    installBase({ user, session });
    const result = await postProof({
      sessionId: session._id,
      token: tokenFor(user),
      body: { wave: session.wave, key: session.key, signature },
    });
    assert.equal(result.status, 403);
    assert.match(result.body.message, /not approved for attendance/i);
  }
  assert.equal(state.created.length, 0);
});

testWithEnv("403 refuses an approved browser while a device change is pending", async () => {
  const user = makeUser();
  const session = makeSession();
  installBase({ user, session, pending: { _id: new ObjectId(), status: "pending" } });
  const signature = await sign({
    sessionId: session._id,
    wave: session.wave,
    key: session.key,
    studentId: user._id,
  });

  const result = await postProof({
    sessionId: session._id,
    token: tokenFor(user),
    body: { wave: session.wave, key: session.key, signature },
  });

  assert.equal(result.status, 403);
  assert.match(result.body.message, /awaiting teacher review/i);
  assert.deepEqual(state.deviceQueries, [{ student: user._id, status: "pending" }]);
  assert.equal(state.created.length, 0);
});

testWithEnv("403 refuses a signature made by another device or for another student", async () => {
  const user = makeUser();
  const session = makeSession();
  installBase({ user, session });

  const wrongDevice = await sign({
    sessionId: session._id,
    wave: session.wave,
    key: session.key,
    studentId: user._id,
    device: devices.other,
  });
  let result = await postProof({
    sessionId: session._id,
    token: tokenFor(user),
    body: { wave: session.wave, key: session.key, signature: wrongDevice },
  });
  assert.equal(result.status, 403);
  assert.match(result.body.message, /signature is invalid/i);

  const wrongStudent = await sign({
    sessionId: session._id,
    wave: session.wave,
    key: session.key,
    studentId: new ObjectId(),
  });
  result = await postProof({
    sessionId: session._id,
    token: tokenFor(user),
    body: { wave: session.wave, key: session.key, signature: wrongStudent },
  });
  assert.equal(result.status, 403);
  assert.match(result.body.message, /signature is invalid/i);
  assert.equal(state.created.length, 0);
});

testWithEnv("409 rejects closed, expired and stale-wave proofs", async () => {
  const session = makeSession();
  const user = makeUser();
  const bodyFor = async (candidate, wave, key) => ({
    wave,
    key,
    signature: await sign({
      sessionId: candidate._id,
      wave,
      key,
      studentId: user._id,
    }),
  });

  const cases = [
    {
      session: makeSession({ status: "closed" }),
      wave: 2,
      key: 9876543,
      message: /closed/i,
    },
    {
      session: makeSession({ keyExpiresAt: new Date(Date.now() - 1000) }),
      wave: 2,
      key: 9876543,
      message: /expired/i,
    },
    {
      session: makeSession({ wave: 3 }),
      wave: 2,
      key: 9876543,
      message: /no longer current/i,
    },
  ];

  for (const entry of cases) {
    installBase({ user, session: entry.session });
    const result = await postProof({
      sessionId: entry.session._id,
      token: tokenFor(user),
      body: await bodyFor(entry.session, entry.wave, entry.key),
    });
    assert.equal(result.status, 409, entry.message);
    assert.match(result.body.message, entry.message);
  }
  assert.equal(state.created.length, 0);
});

testWithEnv("400 rejects a well-signed wrong key on an active fresh session", async () => {
  const user = makeUser();
  const session = makeSession();
  installBase({ user, session });
  const wrongKey = session.key + 1;
  const signature = await sign({
    sessionId: session._id,
    wave: session.wave,
    key: wrongKey,
    studentId: user._id,
  });

  const result = await postProof({
    sessionId: session._id,
    token: tokenFor(user),
    body: { wave: session.wave, key: wrongKey, signature },
  });

  assert.equal(result.status, 400);
  assert.match(result.body.message, /does not match/i);
  assert.equal(state.created.length, 0);
});

testWithEnv("404 rejects an invalid id and a valid but missing session", async () => {
  const user = makeUser();
  installBase({ user, session: null });

  let result = await postProof({
    sessionId: "not-an-object-id",
    token: tokenFor(user),
    body: { wave: 0, key: 1, signature: validSignature() },
  });
  assert.equal(result.status, 404);
  assert.match(result.body.message, /not found/i);
  assert.equal(state.sessionLookup, null);

  result = await postProof({
    sessionId: new ObjectId(),
    token: tokenFor(user),
    body: { wave: 0, key: 1, signature: validSignature() },
  });
  assert.equal(result.status, 404);
  assert.equal(state.enrollmentQueries.length, 0);
});

testWithEnv("400 rejects malformed proof bodies and malformed JSON", async () => {
  const user = makeUser();
  const session = makeSession();
  installBase({ user, session });

  let result = await postProof({
    sessionId: session._id,
    token: tokenFor(user),
    body: { wave: session.wave, key: session.key, signature: "too-short" },
  });
  assert.equal(result.status, 400);
  assert.match(result.body.message, /64-byte P-256 ECDSA signature/i);
  assert.equal(state.sessionLookup, null);

  const badBodies = [
    {
      body: {
        wave: session.wave,
        key: session.key,
        signature: Buffer.alloc(66, 1).toString("base64"),
      },
      message: /64-byte P-256 ECDSA signature/i,
    },
    {
      body: { wave: session.wave, key: 1.5, signature: validSignature() },
      message: /key must be an integer/i,
    },
    {
      body: { wave: 1.5, key: session.key, signature: validSignature() },
      message: /wave must be a non-negative integer/i,
    },
    {
      body: { wave: 1_000_001, key: session.key, signature: validSignature() },
      message: /wave must be a non-negative integer/i,
    },
    {
      body: { wave: session.wave, key: 15 ** 7, signature: validSignature() },
      message: /key must be an integer/i,
    },
  ];
  for (const entry of badBodies) {
    result = await postProof({
      sessionId: session._id,
      token: tokenFor(user),
      body: entry.body,
    });
    assert.equal(result.status, 400, entry.message);
    assert.match(result.body.message, entry.message);
  }
  assert.equal(state.sessionLookup, null);

  result = await postProof({
    sessionId: session._id,
    token: tokenFor(user),
    rawBody: '{"wave":2,',
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.message, "Invalid JSON body");
  assert.equal(state.created.length, 0);
});

const throwDuplicateKey = () => {
  mockStatic("proofCreate", async (doc) => {
    state.created.push(doc);
    const error = new Error("E11000 duplicate key error");
    error.code = 11000;
    throw error;
  });
};

testWithEnv("11000 race with the same key returns 200 duplicate and reuses the raced proof", async () => {
  const user = makeUser();
  const session = makeSession();
  installBase({ user, session });
  const raced = {
    _id: new ObjectId(),
    session: session._id,
    wave: session.wave,
    key: session.key,
    createdAt: new Date("2026-10-25T09:30:00.000Z"),
  };
  let lookups = 0;
  mockStatic("proofFindOne", async (query) => {
    state.proofQueries.push(query);
    lookups += 1;
    return lookups === 1 ? null : raced;
  });
  throwDuplicateKey();
  const signature = await sign({
    sessionId: session._id,
    wave: session.wave,
    key: session.key,
    studentId: user._id,
  });

  const result = await postProof({
    sessionId: session._id,
    token: tokenFor(user),
    body: { wave: session.wave, key: session.key, signature },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.duplicate, true);
  assert.equal(result.body.proof.id, String(raced._id));
  assert.equal(state.created.length, 1);
  assert.equal(lookups, 2);
});

testWithEnv("11000 race with a different key returns 409 conflict", async () => {
  const user = makeUser();
  const session = makeSession();
  installBase({ user, session });
  const raced = {
    _id: new ObjectId(),
    session: session._id,
    wave: session.wave,
    key: session.key + 1,
    createdAt: new Date(),
  };
  let lookups = 0;
  mockStatic("proofFindOne", async (query) => {
    state.proofQueries.push(query);
    lookups += 1;
    return lookups === 1 ? null : raced;
  });
  throwDuplicateKey();
  const signature = await sign({
    sessionId: session._id,
    wave: session.wave,
    key: session.key,
    studentId: user._id,
  });

  const result = await postProof({
    sessionId: session._id,
    token: tokenFor(user),
    body: { wave: session.wave, key: session.key, signature },
  });

  assert.equal(result.status, 409);
  assert.match(result.body.message, /different proof/i);
  assert.equal(lookups, 2);
});

testWithEnv("11000 with no raced document falls through instead of returning a proof", async () => {
  const user = makeUser();
  const session = makeSession();
  installBase({ user, session });
  let lookups = 0;
  mockStatic("proofFindOne", async (query) => {
    state.proofQueries.push(query);
    lookups += 1;
    return null;
  });
  throwDuplicateKey();
  const signature = await sign({
    sessionId: session._id,
    wave: session.wave,
    key: session.key,
    studentId: user._id,
  });

  const result = await postProof({
    sessionId: session._id,
    token: tokenFor(user),
    body: { wave: session.wave, key: session.key, signature },
  });

  // The controller rethrows; the global duplicate-key mapping answers 400.
  assert.ok(result.status === 400 || result.status >= 500);
  assert.equal(result.body.success, false);
  assert.equal(result.body.duplicate, undefined);
  assert.equal(lookups, 2);
});

testWithEnv("an unexpected create failure reaches the error middleware as 500", async () => {
  const user = makeUser();
  const session = makeSession();
  installBase({ user, session });
  mockStatic("proofCreate", async () => {
    throw new Error("database unavailable");
  });
  const signature = await sign({
    sessionId: session._id,
    wave: session.wave,
    key: session.key,
    studentId: user._id,
  });

  const result = await postProof({
    sessionId: session._id,
    token: tokenFor(user),
    body: { wave: session.wave, key: session.key, signature },
  });

  assert.equal(result.status, 500);
  assert.equal(result.body.success, false);
});

testWithEnv("the mounted limiter returns 429 after 60 requests for one student and reset clears it", async () => {
  const student = makeUser();
  const teacher = makeUser({ role: "teacher" });
  const session = makeSession();
  const users = new Map([
    [String(student._id), student],
    [String(teacher._id), teacher],
  ]);
  installBase({ user: student, session });
  mockStatic("userFindById", async (id) => users.get(String(id)) || null);
  const malformed = { wave: session.wave, key: session.key, signature: "too-short" };
  const studentToken = tokenFor(student);

  for (let index = 0; index < 60; index += 1) {
    const result = await postProof({
      sessionId: session._id,
      token: studentToken,
      body: malformed,
    });
    assert.equal(result.status, 400, `request ${index + 1}`);
  }

  const limited = await postProof({
    sessionId: session._id,
    token: studentToken,
    body: malformed,
  });
  assert.equal(limited.status, 429);
  assert.match(limited.body.message, /Too many proof submissions/);

  const anonymous = await postProof({ sessionId: session._id, body: malformed });
  assert.equal(anonymous.status, 401);
  const teacherResult = await postProof({
    sessionId: session._id,
    token: tokenFor(teacher),
    body: malformed,
  });
  assert.equal(teacherResult.status, 403);

  proofSubmitLimiterReset();
  const afterReset = await postProof({
    sessionId: session._id,
    token: studentToken,
    body: malformed,
  });
  assert.equal(afterReset.status, 400);
});
