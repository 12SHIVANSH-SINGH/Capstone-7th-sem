const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const User = require("../models/userModels");
const DeviceBindingRequest = require("../models/deviceBindingRequestModels");
const { decideDeviceReview } = require("../controllers/googleAuthController");
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

test("approving one device retires other pending requests", async (t) => {
  const previousTestStudents = process.env.TEST_STUDENT_EMAILS;
  process.env.TEST_STUDENT_EMAILS = "rehearsal@gmail.com";
  t.after(() => {
    if (previousTestStudents === undefined) delete process.env.TEST_STUDENT_EMAILS;
    else process.env.TEST_STUDENT_EMAILS = previousTestStudents;
  });

  const studentId = new mongoose.Types.ObjectId();
  const reviewId = new mongoose.Types.ObjectId();
  const student = {
    _id: studentId,
    email: "rehearsal@gmail.com",
    deviceBinding: undefined,
    tokenVersion: 0,
    markModified() {},
    async save() {
      this.saved = true;
      return this;
    },
  };
  // Mongoose returns a thenable Query; model both .select() and await.
  const studentQuery = {
    select: () => student,
    then: (resolve, reject) => Promise.resolve(student).then(resolve, reject),
  };

  const review = {
    _id: reviewId,
    student: studentId,
    fingerprint: fingerprintPublicKey(publicKeyJwk),
    publicKeyJwk,
    status: "pending",
    async save() {
      this.saved = true;
      return this;
    },
  };

  t.mock.method(User, "findById", () => studentQuery);
  t.mock.method(DeviceBindingRequest, "findOne", async () => review);
  let updateFilter = null;
  let updatePayload = null;
  t.mock.method(DeviceBindingRequest, "updateMany", async (filter, update) => {
    updateFilter = filter;
    updatePayload = update;
    return { modifiedCount: 2 };
  });

  const res = response();
  await new Promise((resolve, reject) => {
    decideDeviceReview(
      {
        params: { reviewId: String(reviewId) },
        body: { decision: "approved" },
        user: { _id: new mongoose.Types.ObjectId(), role: "teacher" },
        headers: {},
        ip: "127.0.0.1",
        cookies: {},
      },
      res,
      (error) => (error ? reject(error) : resolve())
    );
    setTimeout(resolve, 0);
  });

  assert.equal(res.calls.status, 200);
  assert.equal(review.status, "approved");
  assert.equal(review.saved, true);
  assert.equal(student.saved, true);
  assert.equal(student.deviceBinding.fingerprint, review.fingerprint);
  assert.equal(student.deviceBinding.publicKeyJwk.d, undefined);
  assert.equal(String(updateFilter.student), String(studentId));
  assert.equal(updateFilter.status, "pending");
  assert.equal(String(updateFilter._id.$ne), String(reviewId));
  assert.equal(updatePayload.$set.status, "rejected");
});
