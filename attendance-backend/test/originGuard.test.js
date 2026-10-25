const { test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const createOriginGuard = require("../middleware/originGuard");
const errorMiddleware = require("../middleware/error");
const User = require("../models/userModels");
const CourseClass = require("../models/classModels");
const CheckInSession = require("../models/checkInSessionModels");
const checkInSessionRoute = require("../routes/checkInSessionRoute");
const { buildInitialSession } = require("../utils/checkInSession");

const SECRET = "origin-guard-test-secret-that-is-long-enough";
const ALLOWED_ORIGIN = "https://app.example.com";

const fakeRequest = ({
  method = "POST",
  origin,
  host = "api.example.com",
  protocol = "https",
  secFetchSite,
} = {}) => ({
  method,
  protocol,
  get(name) {
    switch (String(name).toLowerCase()) {
      case "origin":
        return origin;
      case "host":
        return host;
      case "sec-fetch-site":
        return secFetchSite;
      default:
        return undefined;
    }
  },
});

const fakeResponse = () => {
  const state = { status: null, body: null };
  return {
    state,
    status(code) {
      state.status = code;
      return this;
    },
    json(body) {
      state.body = body;
      return this;
    },
  };
};

const invokeGuard = (guard, request) => {
  const response = fakeResponse();
  let nextCalls = 0;
  guard(request, response, () => {
    nextCalls += 1;
  });
  return { ...response.state, nextCalls };
};

const directGuard = createOriginGuard({
  allowedOrigins: new Set([ALLOWED_ORIGIN]),
  isProduction: true,
});

test("an evil Origin cannot mutate with any unsafe method", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const result = invokeGuard(directGuard, fakeRequest({ method, origin: "https://evil.example" }));
    assert.equal(result.status, 403, method);
    assert.deepEqual(result.body, {
      success: false,
      message: "Cross-origin request blocked",
    });
    assert.equal(result.nextCalls, 0, method);
  }
});

test("same-origin and explicitly allowed origins pass", () => {
  const sameOrigin = invokeGuard(
    directGuard,
    fakeRequest({ origin: "https://api.example.com" })
  );
  assert.equal(sameOrigin.status, null);
  assert.equal(sameOrigin.nextCalls, 1);

  const configured = invokeGuard(directGuard, fakeRequest({ origin: ALLOWED_ORIGIN }));
  assert.equal(configured.status, null);
  assert.equal(configured.nextCalls, 1);
});

test("the request's own origin respects protocol, host and port", () => {
  const withPort = invokeGuard(
    directGuard,
    fakeRequest({ origin: "http://127.0.0.1:4100", host: "127.0.0.1:4100", protocol: "http" })
  );
  assert.equal(withPort.nextCalls, 1);

  const wrongProtocol = invokeGuard(
    directGuard,
    fakeRequest({ origin: "http://api.example.com", protocol: "https" })
  );
  assert.equal(wrongProtocol.status, 403);
});

test("no Origin is allowed for CLI/server-to-server traffic", () => {
  const result = invokeGuard(directGuard, fakeRequest());
  assert.equal(result.status, null);
  assert.equal(result.nextCalls, 1);
});

test("a no-Origin browser request marked cross-site is rejected", () => {
  const result = invokeGuard(directGuard, fakeRequest({ secFetchSite: "cross-site" }));
  assert.equal(result.status, 403);
  assert.equal(result.nextCalls, 0);

  const sameSite = invokeGuard(directGuard, fakeRequest({ secFetchSite: "same-origin" }));
  assert.equal(sameSite.nextCalls, 1);
});

test("safe GET requests are unaffected by Origin checks", () => {
  const result = invokeGuard(
    directGuard,
    fakeRequest({ method: "GET", origin: "https://evil.example" })
  );
  assert.equal(result.status, null);
  assert.equal(result.nextCalls, 1);
});

test("development tunnels are allowed only outside production", () => {
  const devGuard = createOriginGuard({
    allowedOrigins: new Set([ALLOWED_ORIGIN]),
    isProduction: false,
  });
  const devTunnel = invokeGuard(
    devGuard,
    fakeRequest({ origin: "https://random-name.trycloudflare.com" })
  );
  assert.equal(devTunnel.status, null);
  assert.equal(devTunnel.nextCalls, 1);

  const prodTunnel = invokeGuard(
    directGuard,
    fakeRequest({ origin: "https://random-name.trycloudflare.com" })
  );
  assert.equal(prodTunnel.status, 403);

  const tunnelDisabled = invokeGuard(
    createOriginGuard({
      allowedOrigins: new Set([ALLOWED_ORIGIN]),
      isProduction: false,
      allowSharedTunnel: false,
    }),
    fakeRequest({ origin: "https://random-name.trycloudflare.com" })
  );
  assert.equal(tunnelDisabled.status, 403);
});

const buildIntegrationApp = () => {
  const app = express();
  app.set("trust proxy", true);
  app.use(cookieParser());
  app.use(express.json());
  app.use(
    createOriginGuard({
      allowedOrigins: new Set([ALLOWED_ORIGIN]),
      isProduction: true,
    })
  );
  app.use("/api/v1", checkInSessionRoute);
  app.use(errorMiddleware);
  return app;
};

const startIntegrationApp = async () => {
  const server = buildIntegrationApp().listen(0);
  await once(server, "listening");
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  };
};

const stop = (server) => new Promise((resolve) => server.close(resolve));

const setTeacherEnv = () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = SECRET;
  process.env.TEACHER_EMAILS = "guide@nitjsr.ac.in";
  process.env.TEST_STUDENT_EMAILS = "";
  process.env.TEST_TEACHER_EMAILS = "";
  delete process.env.DEV_AUTH_ENABLED;
};

const makeTeacher = () =>
  new User({
    name: "Teacher",
    email: "guide@nitjsr.ac.in",
    role: "teacher",
    authProvider: "google",
  });

const tokenFor = (user) => jwt.sign({ id: String(user._id) }, SECRET, { expiresIn: "1h" });

const post = (baseUrl, path, { origin, user } = {}) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      ...(origin ? { Origin: origin } : {}),
      ...(user ? { Cookie: `token=${tokenFor(user)}` } : {}),
    },
  });

test("a cross-site teacher cookie cannot create a check-in session", async (t) => {
  setTeacherEnv();
  const teacher = makeTeacher();
  const classId = new mongoose.Types.ObjectId();
  const roomId = new mongoose.Types.ObjectId();

  t.mock.method(User, "findById", async () => teacher);
  t.mock.method(CourseClass, "findOne", async () => ({
    _id: classId,
    courseCode: "CS301",
    title: "Computer Networks",
    section: "A",
    defaultRoom: roomId,
  }));
  t.mock.method(CheckInSession, "findOne", () => ({ select: async () => null }));

  let created = 0;
  t.mock.method(CheckInSession, "create", async () => {
    created += 1;
    const session = {
      _id: new mongoose.Types.ObjectId(),
      courseClass: {
        _id: classId,
        courseCode: "CS301",
        title: "Computer Networks",
        section: "A",
      },
      room: { _id: roomId, roomNo: "B-204" },
      ...buildInitialSession(),
    };
    session.populate = async () => session;
    return session;
  });

  const { server, baseUrl } = await startIntegrationApp();
  t.after(() => stop(server));

  const path = `/api/v1/classes/${classId}/check-in-sessions`;

  const evil = await post(baseUrl, path, { origin: "https://evil.example", user: teacher });
  assert.equal(evil.status, 403);
  assert.deepEqual(await evil.json(), {
    success: false,
    message: "Cross-origin request blocked",
  });
  assert.equal(created, 0, "guard must run before the controller");

  const allowed = await post(baseUrl, path, { origin: ALLOWED_ORIGIN, user: teacher });
  assert.equal(allowed.status, 201);
  assert.equal((await allowed.json()).success, true);
  assert.equal(created, 1);

  const sameOrigin = await post(baseUrl, path, { origin: baseUrl, user: teacher });
  assert.equal(sameOrigin.status, 201);
  assert.equal(created, 2);

  const noOrigin = await post(baseUrl, path, { user: teacher });
  assert.equal(noOrigin.status, 201);
  assert.equal(created, 3);
});

test("a cross-site teacher cookie cannot close a check-in session", async (t) => {
  setTeacherEnv();
  const teacher = makeTeacher();
  const sessionId = new mongoose.Types.ObjectId();

  const makeSession = () => {
    const session = {
      _id: sessionId,
      teacher: teacher._id,
      courseClass: {
        _id: new mongoose.Types.ObjectId(),
        courseCode: "CS301",
        title: "Computer Networks",
        section: "A",
      },
      room: { _id: new mongoose.Types.ObjectId(), roomNo: "B-204" },
      ...buildInitialSession(),
      saved: 0,
      save: async function save() {
        this.saved += 1;
      },
    };
    return session;
  };

  let current = makeSession();
  t.mock.method(User, "findById", async () => teacher);
  t.mock.method(CheckInSession, "findOne", () => ({
    populate: async () => current,
  }));

  const { server, baseUrl } = await startIntegrationApp();
  t.after(() => stop(server));

  const path = `/api/v1/check-in-sessions/${sessionId}/close`;

  const evil = await post(baseUrl, path, { origin: "https://evil.example", user: teacher });
  assert.equal(evil.status, 403);
  assert.equal(current.status, "active");
  assert.equal(current.saved, 0);

  const sameOrigin = await post(baseUrl, path, { origin: baseUrl, user: teacher });
  assert.equal(sameOrigin.status, 200);
  assert.equal(current.status, "closed");
  assert.equal(current.saved, 1);

  current = makeSession();
  const noOrigin = await post(baseUrl, path, { user: teacher });
  assert.equal(noOrigin.status, 200);
  assert.equal(current.status, "closed");
  assert.equal(current.saved, 1);
});
