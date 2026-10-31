const test = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("crypto");
const mongoose = require("mongoose");
const core = require("../utils/checkInProof");
const sessionCore = require("../utils/checkInSession");
const CheckInProof = require("../models/checkInProofModels");
const CheckInSession = require("../models/checkInSessionModels");
const Enrollment = require("../models/enrollmentModels");
const DeviceBindingRequest = require("../models/deviceBindingRequestModels");
const controller = require("../controllers/checkInProofController");
const route = require("../routes/checkInSessionRoute");
const client = require("../../attendance-frontend/src/acoustic/proofTransport");

const now = new Date("2026-10-25T10:00:00.000Z");
const activeSession = () => ({
  _id: "session-1",
  status: sessionCore.STATUS_ACTIVE,
  wave: 2,
  key: 12345678,
  keyIssuedAt: new Date(now.getTime() - 30_000),
  keyExpiresAt: new Date(now.getTime() + 90_000),
});

test("the browser and server sign exactly the same versioned message", () => {
  const fields = { sessionId: "session-1", wave: 2, key: 12345678, studentId: "student-9" };
  const expected = "bioattend-proof:v1|session=session-1|wave=2|key=12345678|student=student-9";

  assert.equal(core.buildProofMessage(fields), expected);
  assert.equal(client.buildProofMessage(fields), expected);
});

test("client and server share the same key and wave bounds", () => {
  assert.equal(sessionCore.MAX_WAVE, 1_000_000);
  assert.equal(core.MAX_WAVE, sessionCore.MAX_WAVE);
  assert.equal(client.MAX_WAVE, sessionCore.MAX_WAVE);
  assert.equal(client.MAX_KEY_VALUE, sessionCore.MAX_KEY_VALUE);
  assert.equal(client.MAX_KEY_VALUE, 15 ** 7 - 1);

  const base = { sessionId: "session-1", studentId: "student-9" };
  const maxFields = { ...base, wave: sessionCore.MAX_WAVE, key: sessionCore.MAX_KEY_VALUE };
  assert.equal(core.buildProofMessage(maxFields), client.buildProofMessage(maxFields));

  for (const build of [core.buildProofMessage, client.buildProofMessage]) {
    assert.throws(() => build({ ...base, wave: 0, key: sessionCore.MAX_KEY_VALUE + 1 }), /key/);
    assert.throws(() => build({ ...base, wave: sessionCore.MAX_WAVE + 1, key: 0 }), /wave/);
    assert.throws(() => build({ ...base, wave: 1.5, key: 0 }), /wave/);
    assert.doesNotThrow(() => build({ ...base, wave: 0, key: sessionCore.MAX_KEY_VALUE }));
    assert.doesNotThrow(() => build({ ...base, wave: sessionCore.MAX_WAVE, key: 0 }));
  }

  const wavePath = CheckInSession.schema.path("wave");
  assert.equal(wavePath.options.max, sessionCore.MAX_WAVE);
  assert.equal(wavePath.options.validate.validator(1.5), false);
  assert.equal(wavePath.options.validate.validator(0), true);

  const fractional = new CheckInSession({
    courseClass: new mongoose.Types.ObjectId(),
    teacher: new mongoose.Types.ObjectId(),
    room: new mongoose.Types.ObjectId(),
    wave: 1.5,
    key: 0,
    keyIssuedAt: new Date(),
    keyExpiresAt: new Date(),
  });
  assert.match(fractional.validateSync().errors.wave.message, /non-negative integer/);
});

test("message building rejects malformed identities, waves and keys", () => {
  assert.throws(() => core.buildProofMessage({ sessionId: "", wave: 0, key: 1, studentId: "s" }), /sessionId/);
  assert.throws(() => core.buildProofMessage({ sessionId: "s", wave: 0, key: 1, studentId: "" }), /studentId/);
  assert.throws(() => core.buildProofMessage({ sessionId: "a|b", wave: 0, key: 1, studentId: "s" }), /sessionId/);
  assert.throws(() => core.buildProofMessage({ sessionId: "s", wave: -1, key: 1, studentId: "s" }), /wave/);
  assert.throws(() => core.buildProofMessage({ sessionId: "s", wave: 1.5, key: 1, studentId: "s" }), /wave/);
  assert.throws(() => core.buildProofMessage({ sessionId: "s", wave: 0, key: -1, studentId: "s" }), /key/);
  assert.throws(
    () => core.buildProofMessage({ sessionId: "s", wave: 0, key: sessionCore.KEY_SPACE, studentId: "s" }),
    /key/
  );
});

test("a real P-256 device signature verifies, and tampering fails", async () => {
  const pair = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const publicKeyJwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  const message = core.buildProofMessage({
    sessionId: "session-1",
    wave: 2,
    key: 12345678,
    studentId: "student-9",
  });
  const signature = await client.signProofMessage(pair.privateKey, message, webcrypto.subtle);

  assert.equal(Buffer.from(signature, "base64").length, core.SIGNATURE_BYTES);
  assert.equal(core.verifyProofSignature({ publicKeyJwk, message, signature }), true);
  assert.equal(core.verifyProofSignature({ publicKeyJwk, message: `${message}x`, signature }), false);

  const other = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const otherJwk = await webcrypto.subtle.exportKey("jwk", other.publicKey);
  assert.equal(core.verifyProofSignature({ publicKeyJwk: otherJwk, message, signature }), false);
  assert.equal(
    core.verifyProofSignature({ publicKeyJwk: { kty: "EC", crv: "P-384" }, message, signature }),
    false
  );
});

test("signature verification fails closed on malformed input", () => {
  const jwk = { kty: "EC", crv: "P-256", x: "bad", y: "bad" };
  assert.equal(core.verifyProofSignature({ publicKeyJwk: jwk, message: "x", signature: "not-base64" }), false);
  assert.equal(
    core.verifyProofSignature({ publicKeyJwk: jwk, message: "x", signature: Buffer.alloc(64).toString("base64") }),
    false
  );
  assert.equal(
    core.verifyProofSignature({ publicKeyJwk: null, message: "x", signature: Buffer.alloc(64).toString("base64") }),
    false
  );
  assert.equal(core.verifyProofSignature({ publicKeyJwk: jwk, message: "", signature: "x" }), false);
});

test("payload validation accepts only an integer wave/key and a 64-byte signature", () => {
  const signature = Buffer.alloc(64, 7).toString("base64");
  assert.deepEqual(core.validateProofPayload({ wave: 0, key: 0, signature }), {
    ok: true,
    payload: { wave: 0, key: 0, signature },
  });

  for (const body of [null, [], {}, { wave: -1, key: 0, signature }, { wave: 0, key: -1, signature }]) {
    assert.equal(core.validateProofPayload(body).ok, false);
  }
  assert.equal(core.validateProofPayload({ wave: 0, key: 0, signature: "short" }).ok, false);
  assert.equal(
    core.validateProofPayload({ wave: 0, key: 0, signature: Buffer.alloc(63).toString("base64") }).ok,
    false
  );
  assert.equal(
    core.validateProofPayload({ wave: 0, key: sessionCore.KEY_SPACE, signature }).ok,
    false
  );
});

test("a fresh current-wave proof is accepted", () => {
  const decision = core.evaluateProof({
    session: activeSession(),
    proof: null,
    wave: 2,
    key: 12345678,
    now,
  });
  assert.equal(decision.outcome, core.PROOF_OUTCOMES.ACCEPT);
  assert.equal(decision.status, 201);
});

test("closed sessions, stale waves, wrong keys and expired keys are rejected", () => {
  const closed = { ...activeSession(), status: sessionCore.STATUS_CLOSED };
  assert.equal(core.evaluateProof({ session: closed, wave: 2, key: 12345678, now }).status, 409);

  const wrongWave = core.evaluateProof({ session: activeSession(), wave: 1, key: 12345678, now });
  assert.equal(wrongWave.status, 409);
  assert.match(wrongWave.message, /no longer current/);

  const wrongKey = core.evaluateProof({ session: activeSession(), wave: 2, key: 999, now });
  assert.equal(wrongKey.status, 400);
  assert.match(wrongKey.message, /does not match/);

  const expiredSession = {
    ...activeSession(),
    keyExpiresAt: now,
  };
  const expired = core.evaluateProof({ session: expiredSession, wave: 2, key: 12345678, now });
  assert.equal(expired.status, 409);
  assert.match(expired.message, /expired/);

  // Expiry must not distinguish the right key from a wrong one.
  const expiredWrongKey = core.evaluateProof({ session: expiredSession, wave: 2, key: 999, now });
  assert.equal(expiredWrongKey.status, 409);
  assert.match(expiredWrongKey.message, /expired/);
  assert.doesNotMatch(expiredWrongKey.message, /does not match/);

  assert.equal(core.evaluateProof({ session: null, wave: 0, key: 0, now }).status, 404);
});

test("a recorded proof retries idempotently, even after close or expiry", () => {
  const proof = { wave: 2, key: 12345678 };
  const closedAndExpired = {
    ...activeSession(),
    status: sessionCore.STATUS_CLOSED,
    keyExpiresAt: new Date(now.getTime() - 1000),
  };

  const duplicate = core.evaluateProof({ session: closedAndExpired, proof, wave: 2, key: 12345678, now });
  assert.equal(duplicate.outcome, core.PROOF_OUTCOMES.DUPLICATE);
  assert.equal(duplicate.status, 200);

  const conflict = core.evaluateProof({ session: activeSession(), proof, wave: 2, key: 999, now });
  assert.equal(conflict.outcome, core.PROOF_OUTCOMES.REJECT);
  assert.equal(conflict.status, 409);
  assert.match(conflict.message, /different proof/);
});

test("the proof view exposes evidence only, never an attendance decision", () => {
  const view = core.toProofView({
    _id: "proof-1",
    session: "session-1",
    wave: 2,
    key: 12345678,
    createdAt: new Date("2026-10-25T10:00:01.000Z"),
  });

  assert.deepEqual(view, {
    id: "proof-1",
    sessionId: "session-1",
    wave: 2,
    recordedAt: "2026-10-25T10:00:01.000Z",
    duplicate: false,
  });
  assert.equal(Object.hasOwn(view, "attendance"), false);
  assert.equal(Object.hasOwn(view, "present"), false);
  assert.equal(Object.hasOwn(view, "score"), false);
  assert.equal(Object.hasOwn(view, "key"), false);
  assert.equal(Object.hasOwn(view, "signature"), false);
  assert.equal(Object.hasOwn(view, "protocolVersion"), false);
  assert.equal(Object.hasOwn(view, "studentEmail"), false);
  assert.equal(Object.hasOwn(view, "deviceFingerprint"), false);
});

test("the teacher evidence view names the student and wave but leaks no secrets", () => {
  const view = core.toTeacherProofView({
    _id: "proof-1",
    studentEmail: " Student@NITJSR.ac.in ",
    wave: 2,
    createdAt: new Date("2026-10-25T10:00:01.000Z"),
    key: 12345678,
    signature: "secret-signature",
    protocolVersion: core.PROOF_MESSAGE_VERSION,
    deviceFingerprint: "fingerprint",
  });

  assert.deepEqual(view, {
    id: "proof-1",
    studentEmail: "student@nitjsr.ac.in",
    wave: 2,
    recordedAt: "2026-10-25T10:00:01.000Z",
  });
  for (const forbidden of [
    "key",
    "signature",
    "protocolVersion",
    "deviceFingerprint",
    "attendance",
    "present",
    "score",
  ]) {
    assert.equal(Object.hasOwn(view, forbidden), false, forbidden);
  }
});

test("the model has a unique per-student-wave proof and no scoring fields", () => {
  const unique = CheckInProof.schema
    .indexes()
    .find(([, options]) => options.name === "one_proof_per_student_wave");
  assert.ok(unique);
  assert.deepEqual(unique[0], { session: 1, student: 1, wave: 1 });
  assert.equal(unique[1].unique, true);

  const retention = CheckInProof.schema
    .indexes()
    .find(([, options]) => options.name === "proof_retention_1_day");
  assert.ok(retention);
  assert.deepEqual(retention[0], { createdAt: 1 });
  assert.equal(retention[1].expireAfterSeconds, 24 * 60 * 60);

  assert.equal(CheckInProof.schema.path("key").options.max, sessionCore.MAX_KEY_VALUE);
  assert.equal(CheckInProof.schema.path("wave").options.min, 0);
  assert.equal(CheckInProof.schema.path("wave").options.max, sessionCore.MAX_WAVE);
  for (const field of ["session", "courseClass", "student", "studentEmail", "deviceFingerprint"]) {
    assert.equal(CheckInProof.schema.path(field).options.required, true, field);
  }
  for (const forbidden of ["attendance", "present", "score", "status", "decision"]) {
    assert.equal(CheckInProof.schema.path(forbidden), undefined, forbidden);
  }
});

test("the model stores a base64 signature and the protocol version", () => {
  const base = {
    session: new mongoose.Types.ObjectId(),
    courseClass: new mongoose.Types.ObjectId(),
    student: new mongoose.Types.ObjectId(),
    studentEmail: "student@nitjsr.ac.in",
    deviceFingerprint: "fingerprint",
    wave: 0,
    key: 42,
  };
  const signature = Buffer.alloc(64, 7).toString("base64");
  const doc = new CheckInProof({ ...base, signature });

  assert.equal(doc.validateSync(), undefined);
  assert.equal(doc.protocolVersion, core.PROOF_MESSAGE_VERSION);
  assert.equal(CheckInProof.schema.path("signature").options.required, true);
  assert.equal(
    CheckInProof.schema.path("protocolVersion").options.default,
    core.PROOF_MESSAGE_VERSION
  );

  assert.ok(new CheckInProof(base).validateSync().errors.signature);
  assert.ok(new CheckInProof({ ...base, signature: "not-base64" }).validateSync().errors.signature);
});

const invokeController = (handler, req) =>
  new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ status: this.statusCode, body });
        return this;
      },
    };
    handler(req, res, (error) => resolve({ status: error?.statuscode || 0, error }));
  });

const controllerFixture = async () => {
  const sessionId = new mongoose.Types.ObjectId();
  const studentId = new mongoose.Types.ObjectId();
  const courseClass = new mongoose.Types.ObjectId();
  const pair = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const publicKeyJwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  const session = {
    _id: sessionId,
    courseClass,
    status: sessionCore.STATUS_ACTIVE,
    wave: 0,
    key: 42,
    keyExpiresAt: new Date(Date.now() + 60_000),
  };
  const message = core.buildProofMessage({ sessionId, wave: 0, key: 42, studentId });
  const signature = await client.signProofMessage(pair.privateKey, message, webcrypto.subtle);
  const req = {
    params: { sessionId: String(sessionId) },
    body: { wave: 0, key: 42, signature },
    user: {
      _id: studentId,
      email: "student@nitjsr.ac.in",
      deviceBinding: {
        fingerprint: "device-fingerprint",
        publicKeyJwk,
        approvedAt: new Date(),
      },
    },
  };
  return { session, sessionId, studentId, signature, req };
};

test("the controller rejects a proof while a device change is pending", async () => {
  const { session, req } = await controllerFixture();
  const originals = {
    findById: CheckInSession.findById,
    enrollmentExists: Enrollment.exists,
    pendingExists: DeviceBindingRequest.exists,
    proofFindOne: CheckInProof.findOne,
    proofCreate: CheckInProof.create,
  };
  const created = [];
  try {
    CheckInSession.findById = () => ({ select: async () => session });
    Enrollment.exists = async () => ({ _id: "enrollment" });
    DeviceBindingRequest.exists = async () => ({ _id: "pending-request" });
    CheckInProof.findOne = async () => null;
    CheckInProof.create = async (doc) => {
      created.push(doc);
      return doc;
    };

    const result = await invokeController(controller.submitProof, req);
    assert.equal(result.status, 403);
    assert.equal(
      result.error.message,
      "A device change is awaiting teacher review. This browser cannot submit proofs until it is approved."
    );
    assert.equal(created.length, 0);
  } finally {
    CheckInSession.findById = originals.findById;
    Enrollment.exists = originals.enrollmentExists;
    DeviceBindingRequest.exists = originals.pendingExists;
    CheckInProof.findOne = originals.proofFindOne;
    CheckInProof.create = originals.proofCreate;
  }
});

test("accept and duplicate log one structured line and never leak evidence", async () => {
  const { session, sessionId, studentId, signature, req } = await controllerFixture();
  const originals = {
    findById: CheckInSession.findById,
    enrollmentExists: Enrollment.exists,
    pendingExists: DeviceBindingRequest.exists,
    proofFindOne: CheckInProof.findOne,
    proofCreate: CheckInProof.create,
  };
  const originalInfo = console.info;
  const created = [];
  const logs = [];
  try {
    console.info = (...args) => logs.push(args.join(" "));
    CheckInSession.findById = () => ({ select: async () => session });
    Enrollment.exists = async () => ({ _id: "enrollment" });
    DeviceBindingRequest.exists = async () => null;
    CheckInProof.findOne = async () => null;
    CheckInProof.create = async (doc) => {
      created.push(doc);
      return { _id: new mongoose.Types.ObjectId(), createdAt: new Date(), ...doc };
    };

    const accepted = await invokeController(controller.submitProof, req);
    assert.equal(accepted.status, 201);
    assert.equal(accepted.body.recorded, true);
    assert.equal(accepted.body.duplicate, false);
    assert.equal(accepted.body.attendanceDecided, false);
    assert.equal(created[0].signature, signature);
    assert.equal(created[0].protocolVersion, core.PROOF_MESSAGE_VERSION);
    for (const field of [
      "key",
      "signature",
      "protocolVersion",
      "studentEmail",
      "deviceFingerprint",
    ]) {
      assert.equal(Object.hasOwn(accepted.body.proof, field), false, field);
    }

    assert.equal(logs.length, 1);
    assert.deepEqual(JSON.parse(logs[0]), {
      event: "check_in_proof",
      sessionId: String(sessionId),
      studentId: String(studentId),
      wave: 0,
      outcome: "accept",
    });
    assert.equal(logs[0].includes(signature), false);
    assert.equal(logs[0].includes(req.user.email), false);
    assert.equal(logs[0].includes("device-fingerprint"), false);

    CheckInProof.findOne = async () => ({
      _id: new mongoose.Types.ObjectId(),
      session: sessionId,
      wave: 0,
      key: 42,
      createdAt: new Date(),
      signature,
      protocolVersion: core.PROOF_MESSAGE_VERSION,
    });
    CheckInProof.create = async () => {
      throw new Error("duplicate must not create");
    };

    const duplicate = await invokeController(controller.submitProof, req);
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.body.recorded, true);
    assert.equal(duplicate.body.duplicate, true);
    assert.equal(duplicate.body.attendanceDecided, false);
    assert.equal(Object.hasOwn(duplicate.body.proof, "signature"), false);
    assert.equal(logs.length, 2);
    assert.equal(JSON.parse(logs[1]).outcome, "duplicate");
  } finally {
    console.info = originalInfo;
    CheckInSession.findById = originals.findById;
    Enrollment.exists = originals.enrollmentExists;
    DeviceBindingRequest.exists = originals.pendingExists;
    CheckInProof.findOne = originals.proofFindOne;
    CheckInProof.create = originals.proofCreate;
  }
});

test("proof submissions are rate limited per student after the auth guards", () => {
  const limiter = route.proofSubmitLimiter;
  limiter.reset();
  const call = (id) => {
    const state = { status: 200, next: false, body: null, headers: {} };
    limiter(
      { user: { _id: id }, ip: "127.0.0.1" },
      {
        set(name, value) {
          state.headers[name] = value;
          return this;
        },
        status(code) {
          state.status = code;
          return this;
        },
        json(body) {
          state.body = body;
          return this;
        },
      },
      () => {
        state.next = true;
      }
    );
    return state;
  };

  try {
    for (let index = 0; index < 60; index += 1) {
      assert.equal(call("student-a").next, true, `request ${index + 1}`);
    }
    const blocked = call("student-a");
    assert.equal(blocked.next, false);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.message, "Too many proof submissions. Wait a minute and try again.");
    assert.equal(call("student-b").next, true);

    const layer = route.stack.find(
      (entry) => entry.route?.path === "/check-in-sessions/:sessionId/proofs"
    );
    const handlers = layer.route.stack.map((entry) => entry.handle);
    assert.equal(handlers.at(-1), controller.submitProof);
    assert.equal(handlers.at(-2), limiter);
  } finally {
    limiter.reset();
  }
});
