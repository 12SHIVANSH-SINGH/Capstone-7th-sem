const { test, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const serverLib = require("../utils/webauthnServer");
const AdminPasskey = require("../models/adminPasskeyModels");
const WebAuthnChallenge = require("../models/webauthnChallengeModels");

// Pin the WebAuthn origin for this file so the result does not depend on
// whether another suite has changed NODE_ENV in the shared-process mode.
const TEST_SECRET = "admin-passkey-test-secret-that-is-long-enough";
const previousWebauthnEnv = {
  NODE_ENV: process.env.NODE_ENV,
  JWT_SECRET: process.env.JWT_SECRET,
  WEBAUTHN_ORIGINS: process.env.WEBAUTHN_ORIGINS,
};
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = TEST_SECRET;
process.env.WEBAUTHN_ORIGINS = "http://localhost:3000";

// Another suite may have changed these globals before this file's tests run
// in --test-isolation=none mode. Re-pin them for every test.
beforeEach(() => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.WEBAUTHN_ORIGINS = "http://localhost:3000";
});

after(() => {
  for (const [key, value] of Object.entries(previousWebauthnEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const CONTROLLER_PATH = require.resolve("../controllers/adminPasskeyController");

const loadController = (t, mocks = {}) => {
  for (const [name, implementation] of Object.entries(mocks)) {
    t.mock.method(serverLib, name, implementation);
  }
  // The controller destructures library functions at require time, so drop
  // its cache after installing the mocks.
  delete require.cache[CONTROLLER_PATH];
  return require(CONTROLLER_PATH);
};

const response = () => {
  const calls = { status: null, body: null, cookies: [] };
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
    cookie(name, value, options) {
      calls.cookies.push({ name, value, options });
      return this;
    },
  };
};

const run = async (handler, req, res) => {
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

const adminRequest = (body = {}) => ({
  user: {
    _id: new mongoose.Types.ObjectId(),
    email: "owner@nitjsr.ac.in",
    name: "Owner",
    role: "superadmin",
    status: "active",
    tokenVersion: 1,
    getJWTtoken(options = {}) {
      const { expiresIn = "5m", ...extraClaims } = options;
      return jwt.sign(
        { id: String(this._id), tokenVersion: this.tokenVersion, ...extraClaims },
        TEST_SECRET,
        { expiresIn, algorithm: "HS256" }
      );
    },
  },
  body,
  headers: {},
  cookies: {},
  ip: "203.0.113.7",
});

const passkeyDocument = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  credentialId: "credential-id",
  publicKey: "public-key",
  counter: 0,
  transports: ["internal"],
  deviceType: "singleDevice",
  backedUp: false,
  createdAt: new Date("2026-11-05T10:00:00.000Z"),
  lastUsedAt: null,
  async save() {
    this.saved = true;
    return this;
  },
  ...overrides,
});

// Query mocks need both shapes the controller uses: a bare .lean() for
// existence checks and a sorted .lean() for the passkey summary.
const findResult = (rows = []) => ({
  lean: async () => rows,
  sort: () => ({ lean: async () => rows }),
});

test("the first passkey can be enrolled without an existing passkey", async (t) => {
  let storedChallenge = null;
  const controller = loadController(t, {
    generateRegistrationOptions: async (options) => {
      assert.equal(options.rpID, "localhost");
      assert.equal(options.userName, "owner@nitjsr.ac.in");
      return { challenge: "first-challenge", rp: { id: options.rpID, name: options.rpName } };
    },
  });

  t.mock.method(AdminPasskey, "find", () => findResult([]));
  t.mock.method(WebAuthnChallenge, "deleteMany", async () => ({ deletedCount: 0 }));
  t.mock.method(WebAuthnChallenge, "create", async (entry) => {
    storedChallenge = entry;
    return entry;
  });

  const req = adminRequest();
  const res = response();
  await run(controller.registrationOptions, req, res);

  assert.equal(res.calls.status, 200);
  assert.equal(res.calls.body.options.challenge, "first-challenge");
  assert.equal(storedChallenge.kind, "registration");
  assert.equal(String(storedChallenge.user), String(req.user._id));
});

test("an additional passkey requires a step-up assertion", async (t) => {
  const controller = loadController(t, {
    generateRegistrationOptions: async () => ({ challenge: "unused" }),
  });
  t.mock.method(AdminPasskey, "find", () =>
    findResult([passkeyDocument({ credentialId: "existing" })])
  );

  const req = adminRequest();
  const res = response();
  await run(controller.registrationOptions, req, res);

  assert.equal(res.calls.status, 428);
  assert.equal(res.calls.body.code, "step_up_required");
});

test("registration verification saves only the public credential", async (t) => {
  const newPasskey = passkeyDocument({ credentialId: "new-credential" });
  const controller = loadController(t, {
    verifyRegistrationResponse: async () => ({
      verified: true,
      registrationInfo: {
        credential: {
          id: "new-credential",
          publicKey: new Uint8Array([1, 2, 3, 4]),
          counter: 0,
          transports: ["internal"],
        },
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
      },
    }),
  });

  t.mock.method(AdminPasskey, "find", () => findResult([]));
  t.mock.method(AdminPasskey, "exists", async () => null);
  t.mock.method(AdminPasskey, "create", async (entry) => {
    assert.equal(entry.credentialId, "new-credential");
    assert.equal(entry.publicKey, "AQIDBA");
    assert.equal(entry.deviceType, "singleDevice");
    return newPasskey;
  });
  t.mock.method(WebAuthnChallenge, "findOneAndDelete", () => ({
    sort: async () => ({ challenge: "stored-challenge" }),
  }));

  const req = adminRequest({ response: { id: "new-credential" } });
  const res = response();
  await run(controller.verifyRegistration, req, res);

  assert.equal(res.calls.status, 201);
  assert.equal(res.calls.body.passkey.id, String(newPasskey._id));
  assert.equal(res.calls.cookies.length, 1);
  assert.equal(res.calls.cookies[0].name, "admin_step_up");
});

test("step-up options refuse an account with no passkey", async (t) => {
  const controller = loadController(t, {
    generateAuthenticationOptions: async () => ({ challenge: "unused" }),
  });
  t.mock.method(AdminPasskey, "find", () => findResult([]));

  const res = response();
  await run(controller.stepUpOptions, adminRequest(), res);

  assert.equal(res.calls.status, 409);
  assert.equal(res.calls.body.code, "passkey_not_enrolled");
});

test("a verified assertion renews the counter and sets the step-up cookie", async (t) => {
  const passkey = passkeyDocument();
  const controller = loadController(t, {
    verifyAuthenticationResponse: async ({ credential }) => {
      assert.equal(credential.counter, 0);
      assert.ok(credential.publicKey.length > 0);
      return {
        verified: true,
        authenticationInfo: {
          newCounter: 1,
          credentialDeviceType: "singleDevice",
          credentialBackedUp: false,
        },
      };
    },
  });

  t.mock.method(AdminPasskey, "findOne", async () => passkey);
  t.mock.method(WebAuthnChallenge, "findOneAndDelete", () => ({
    sort: async () => ({ challenge: "stored-challenge" }),
  }));

  const req = adminRequest({ response: { id: "credential-id" } });
  const res = response();
  await run(controller.verifyStepUp, req, res);

  assert.equal(res.calls.status, 200);
  assert.equal(passkey.counter, 1);
  assert.ok(passkey.lastUsedAt instanceof Date);
  assert.equal(passkey.saved, true);
  assert.equal(res.calls.cookies.length, 1);
  assert.equal(res.calls.cookies[0].name, "admin_step_up");
});
