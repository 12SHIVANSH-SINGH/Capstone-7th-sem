const { test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");

// The app decides CORS/origin policy and dev-route mounting at require time.
// This file runs before the other app-requiring tests and restores the env.
const previousEnv = {
  NODE_ENV: process.env.NODE_ENV,
  JWT_SECRET: process.env.JWT_SECRET,
  CLIENT_URLS: process.env.CLIENT_URLS,
  DEV_AUTH_ENABLED: process.env.DEV_AUTH_ENABLED,
};
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "app-wiring-test-secret-that-is-long-enough";
process.env.CLIENT_URLS = "https://app.example.com";
process.env.DEV_AUTH_ENABLED = "false";

const app = require("../app");

const start = async () => {
  const server = app.listen(0);
  await once(server, "listening");
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  };
};

const stop = (server) => new Promise((resolve) => server.close(resolve));

const restoreEnv = () => {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

test("the real app mounts the origin guard before the proof route", async (t) => {
  const { server, baseUrl } = await start();
  t.after(async () => {
    await stop(server);
    restoreEnv();
  });

  const response = await fetch(
    `${baseUrl}/api/v1/check-in-sessions/507f1f77bcf86cd799439011/proofs`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.example",
      },
      body: JSON.stringify({ wave: 0, key: 1, signature: "x" }),
    }
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    success: false,
    message: "Cross-origin request blocked",
  });
});

test("the real app mounts the proof route behind authentication", async (t) => {
  const { server, baseUrl } = await start();
  t.after(() => stop(server));

  for (const origin of [undefined, "https://app.example.com"]) {
    const response = await fetch(
      `${baseUrl}/api/v1/check-in-sessions/507f1f77bcf86cd799439011/proofs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(origin ? { Origin: origin } : {}),
        },
        body: JSON.stringify({ wave: 0, key: 1, signature: "x" }),
      }
    );

    assert.equal(response.status, 401, origin || "no origin");
    assert.match((await response.json()).message, /login/i);
  }
});

test("the real app still serves the health route", async (t) => {
  const { server, baseUrl } = await start();
  t.after(() => stop(server));

  const response = await fetch(`${baseUrl}/api/v1/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
});
