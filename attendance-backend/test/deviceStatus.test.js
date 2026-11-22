const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const DeviceBindingRequest = require("../models/deviceBindingRequestModels");
const { getDeviceBindingStatus } = require("../controllers/googleAuthController");

const APPROVED = "a".repeat(64);
const OTHER = "b".repeat(64);

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

const user = (deviceBinding) => ({
  _id: new mongoose.Types.ObjectId(),
  email: "student@nitjsr.ac.in",
  role: "student",
  deviceBinding,
});

const mockPending = (t, requests) => {
  t.mock.method(DeviceBindingRequest, "find", () => ({
    select() {
      return this;
    },
    async lean() {
      return requests;
    },
  }));
};

const run = async (req, res) => {
  let error = null;
  await new Promise((resolve) => {
    getDeviceBindingStatus(req, res, (nextError) => {
      error = nextError || null;
      resolve();
    });
    setTimeout(resolve, 0);
  });
  return error;
};

test("an approved browser is not blocked by another browser's pending request", async (t) => {
  mockPending(t, [{ fingerprint: OTHER }]);
  const res = response();
  const error = await run(
    {
      user: user({ fingerprint: APPROVED }),
      query: { fingerprint: APPROVED },
    },
    res
  );

  assert.equal(error, null);
  assert.equal(res.calls.status, 200);
  assert.deepEqual(res.calls.body, {
    success: true,
    status: "approved",
    pendingReview: true,
    currentDeviceApproved: true,
  });
});

test("a new browser is in review when its own fingerprint is pending", async (t) => {
  mockPending(t, [{ fingerprint: OTHER }]);
  const res = response();
  const error = await run(
    {
      user: user({ fingerprint: APPROVED }),
      query: { fingerprint: OTHER },
    },
    res
  );

  assert.equal(error, null);
  assert.equal(res.calls.body.status, "review");
  assert.equal(res.calls.body.pendingReview, false);
  assert.equal(res.calls.body.currentDeviceApproved, false);
});

test("an unknown browser is unbound rather than review", async (t) => {
  mockPending(t, []);
  const res = response();
  await run(
    {
      user: user({ fingerprint: APPROVED }),
      query: { fingerprint: "c".repeat(64) },
    },
    res
  );

  assert.equal(res.calls.body.status, "unbound");
  assert.equal(res.calls.body.pendingReview, false);
});

test("legacy status without a fingerprint keeps the student-wide answer", async (t) => {
  mockPending(t, [{ fingerprint: OTHER }]);
  const res = response();
  await run(
    {
      user: user({ fingerprint: APPROVED }),
      query: {},
    },
    res
  );

  assert.equal(res.calls.body.status, "review");
  assert.equal(res.calls.body.pendingReview, true);
});

test("an invalid fingerprint is rejected instead of falling back silently", async (t) => {
  mockPending(t, []);
  const res = response();
  const error = await run(
    {
      user: user({ fingerprint: APPROVED }),
      query: { fingerprint: "not-a-fingerprint" },
    },
    res
  );

  assert.ok(error);
  assert.equal(error.statuscode, 400);
  assert.match(error.message, /valid device fingerprint/i);
});
