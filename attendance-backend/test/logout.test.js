const { test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const express = require("express");
const cookieParser = require("cookie-parser");

const createOriginGuard = require("../middleware/originGuard");
const errorMiddleware = require("../middleware/error");
const userRoute = require("../routes/userRoute");

const ALLOWED_ORIGIN = "https://app.example.com";

test("logout is POST-only and the cookie-crossing guard blocks foreign origins", async (t) => {
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
  app.use("/api/v1", userRoute);
  app.use(errorMiddleware);

  const server = app.listen(0);
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  // A link, <img> or top-level navigation must not end the session.
  const get = await fetch(`${baseUrl}/api/v1/logout`, {
    headers: { Cookie: "token=live-session" },
  });
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("set-cookie"), null);
  assert.equal(get.headers.get("allow"), "POST");

  const evil = await fetch(`${baseUrl}/api/v1/logout`, {
    method: "POST",
    headers: {
      Origin: "https://evil.example",
      Cookie: "token=live-session",
    },
  });
  assert.equal(evil.status, 403);
  assert.equal(evil.headers.get("set-cookie"), null);

  const sameOrigin = await fetch(`${baseUrl}/api/v1/logout`, {
    method: "POST",
    headers: {
      Origin: baseUrl,
      Cookie: "token=live-session",
    },
  });
  assert.equal(sameOrigin.status, 200);
  assert.equal((await sameOrigin.json()).success, true);
  assert.match(sameOrigin.headers.get("set-cookie") || "", /^token=;/);

  const allowed = await fetch(`${baseUrl}/api/v1/logout`, {
    method: "POST",
    headers: { Origin: ALLOWED_ORIGIN },
  });
  assert.equal(allowed.status, 200);
  assert.match(allowed.headers.get("set-cookie") || "", /^token=;/);

  const noOrigin = await fetch(`${baseUrl}/api/v1/logout`, { method: "POST" });
  assert.equal(noOrigin.status, 200);
  assert.match(noOrigin.headers.get("set-cookie") || "", /^token=;/);
});
