const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const User = require("../models/userModels");
const admin = require("../controllers/adminController");

const runController = async (handler, req, res) => {
  let nextError = null;
  await new Promise((resolve) => {
    handler(req, res, (error) => {
      nextError = error || null;
      resolve();
    });
    setTimeout(resolve, 0);
  });
  if (nextError) throw nextError;
};

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

const adminUser = () => ({
  _id: new mongoose.Types.ObjectId(),
  email: "owner@nitjsr.ac.in",
  role: "superadmin",
  status: "active",
  tokenVersion: 4,
  isDemo: false,
});

const targetUser = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  name: "Target Student",
  email: "student@nitjsr.ac.in",
  role: "student",
  status: "active",
  tokenVersion: 2,
  isDemo: false,
  deviceBinding: {},
  async save() {
    this.saved = true;
    return this;
  },
  ...overrides,
});

const request = (target, body) => ({
  params: { userId: String(target._id) },
  body,
  user: adminUser(),
  cookies: {},
  headers: { "user-agent": "test" },
  ip: "127.0.0.1",
});

test("disabling an account bumps its session version", async (t) => {
  const target = targetUser();
  t.mock.method(User, "findById", async () => target);

  const res = response();
  await runController(admin.updateUser, request(target, { status: "disabled" }), res);

  assert.equal(target.status, "disabled");
  assert.equal(target.tokenVersion, 3);
  assert.equal(target.saved, true);
  assert.equal(res.calls.status, 200);
});

test("changing a role bumps its session version", async (t) => {
  const target = targetUser();
  t.mock.method(User, "findById", async () => target);

  const res = response();
  await runController(admin.updateUser, request(target, { role: "teacher" }), res);

  assert.equal(target.role, "teacher");
  assert.equal(target.tokenVersion, 3);
});

test("a profile-only edit does not sign the account out", async (t) => {
  const target = targetUser();
  t.mock.method(User, "findById", async () => target);

  const res = response();
  await runController(
    admin.updateUser,
    request(target, { name: "Renamed Student", phoneLabel: "Phone A" }),
    res
  );

  assert.equal(target.name, "Renamed Student");
  assert.equal(target.tokenVersion, 2);
  assert.equal(res.calls.status, 200);
});
