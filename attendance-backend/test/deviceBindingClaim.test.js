const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const DeviceBindingRequest = require("../models/deviceBindingRequestModels");
const { claimDeviceBinding } = require("../controllers/googleAuthController");
const { fingerprintPublicKey } = require("../utils/deviceBinding");

const X = "a".repeat(43);
const Y = "b".repeat(43);
const publicKeyJwk = { kty: "EC", crv: "P-256", x: X, y: Y };

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

const student = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  email: "2023ugcs059@nitjsr.ac.in",
  role: "student",
  authProvider: "google",
  deviceBinding: undefined,
  tokenVersion: 0,
  markModified() {},
  async save() {
    this.saved = true;
    return this;
  },
  ...overrides,
});

const run = async (handler, req, res) => {
  let error = null;
  await new Promise((resolve) => {
    handler(req, res, (nextError) => {
      error = nextError || null;
      resolve();
    });
    setTimeout(resolve, 0);
  });
  if (error) throw error;
};

test("a first binding waits for teacher approval instead of self-approving", async (t) => {
  process.env.NODE_ENV = "test";
  const user = student();
  t.mock.method(DeviceBindingRequest, "findOneAndUpdate", async (filter, update) => {
    assert.equal(String(filter.student), String(user._id));
    assert.equal(filter.fingerprint, fingerprintPublicKey(publicKeyJwk));
    assert.equal(update.$set.publicKeyJwk.d, undefined);
    assert.equal(update.$set.status, "pending");
    return { _id: new mongoose.Types.ObjectId() };
  });

  const res = response();
  await run(
    claimDeviceBinding,
    { user, body: { publicKeyJwk }, headers: {}, ip: "127.0.0.1", cookies: {} },
    res
  );

  assert.equal(res.calls.status, 202);
  assert.equal(res.calls.body.status, "review");
  assert.equal(res.calls.body.firstBinding, true);
  assert.equal(user.deviceBinding, undefined);
});

test("private key material is rejected and never stored", async (t) => {
  const user = student();
  t.mock.method(DeviceBindingRequest, "findOneAndUpdate", async () => {
    throw new Error("must not write a private key");
  });

  const res = response();
  let error = null;
  await new Promise((resolve) => {
    claimDeviceBinding(
      { user, body: { publicKeyJwk: { ...publicKeyJwk, d: "private" } }, headers: {}, ip: "127.0.0.1" },
      res,
      (nextError) => {
        error = nextError;
        resolve();
      }
    );
  });

  assert.equal(error.statuscode, 400);
  assert.match(error.message, /private key/i);
  assert.equal(user.deviceBinding, undefined);
});

test("a test-student allowlist account auto-approves for rehearsals", async (t) => {
  const previousTestStudents = process.env.TEST_STUDENT_EMAILS;
  process.env.TEST_STUDENT_EMAILS = "rehearsal@gmail.com";
  t.after(() => {
    if (previousTestStudents === undefined) delete process.env.TEST_STUDENT_EMAILS;
    else process.env.TEST_STUDENT_EMAILS = previousTestStudents;
  });

  const user = student({ email: "rehearsal@gmail.com", authProvider: "google" });
  const res = response();
  await run(
    claimDeviceBinding,
    { user, body: { publicKeyJwk }, headers: {}, ip: "127.0.0.1", cookies: {} },
    res
  );

  assert.equal(res.calls.status, 201);
  assert.equal(res.calls.body.status, "approved");
  assert.equal(res.calls.body.testAutoApproved, true);
  assert.equal(res.calls.body.devAutoApproved, false);
  assert.equal(user.deviceBinding.fingerprint, fingerprintPublicKey(publicKeyJwk));
  assert.equal(user.saved, true);
});

test("the same already-approved device stays approved", async (t) => {
  const user = student({
    deviceBinding: { fingerprint: fingerprintPublicKey(publicKeyJwk), publicKeyJwk },
  });

  const res = response();
  await run(
    claimDeviceBinding,
    { user, body: { publicKeyJwk }, headers: {}, ip: "127.0.0.1", cookies: {} },
    res
  );

  assert.equal(res.calls.status, 200);
  assert.equal(res.calls.body.status, "approved");
  assert.equal(user.saved, true);
  assert.ok(user.deviceBinding.lastSeenAt instanceof Date);
});
