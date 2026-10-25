const test = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("crypto");
const transport = require("./proofTransport");

test("the proof message format is versioned and exact", () => {
  assert.equal(
    transport.buildProofMessage({
      sessionId: "session-1",
      wave: 3,
      key: 12345678,
      studentId: "student-9",
    }),
    "bioattend-proof:v1|session=session-1|wave=3|key=12345678|student=student-9"
  );
});

test("the proof message builder rejects malformed fields", () => {
  assert.throws(() => transport.buildProofMessage({ sessionId: "", wave: 0, key: 1, studentId: "s" }));
  assert.throws(() => transport.buildProofMessage({ sessionId: "s", wave: 0, key: 1, studentId: "a|b" }));
  assert.throws(() => transport.buildProofMessage({ sessionId: "s", wave: -1, key: 1, studentId: "s" }));
  assert.throws(() => transport.buildProofMessage({ sessionId: "s", wave: 0, key: -1, studentId: "s" }));
  assert.throws(() => transport.buildProofMessage({ sessionId: "s", wave: 0.5, key: 1, studentId: "s" }));
});

test("the client shares the server key space and wave ceiling", () => {
  assert.equal(transport.MAX_KEY_VALUE, 15 ** 7 - 1);
  assert.equal(transport.MAX_WAVE, 1_000_000);

  const base = { sessionId: "session-1", studentId: "student-9" };
  assert.doesNotThrow(() =>
    transport.buildProofMessage({ ...base, wave: 0, key: transport.MAX_KEY_VALUE })
  );
  assert.doesNotThrow(() =>
    transport.buildProofMessage({ ...base, wave: transport.MAX_WAVE, key: 0 })
  );
  assert.throws(
    () => transport.buildProofMessage({ ...base, wave: 0, key: transport.MAX_KEY_VALUE + 1 }),
    /key/
  );
  assert.throws(
    () => transport.buildProofMessage({ ...base, wave: transport.MAX_WAVE + 1, key: 0 }),
    /wave/
  );
});

test("signProofMessage produces a verifiable raw P-256 signature", async () => {
  const pair = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const message = transport.buildProofMessage({
    sessionId: "session-1",
    wave: 0,
    key: 42,
    studentId: "student-9",
  });
  const signature = await transport.signProofMessage(pair.privateKey, message, webcrypto.subtle);

  assert.equal(Buffer.from(signature, "base64").length, transport.SIGNATURE_BYTES);
  assert.equal(
    await webcrypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pair.publicKey,
      Buffer.from(signature, "base64"),
      new TextEncoder().encode(message)
    ),
    true
  );
  assert.equal(
    await webcrypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pair.publicKey,
      Buffer.from(signature, "base64"),
      new TextEncoder().encode(`${message}x`)
    ),
    false
  );
});

test("signProof signs the canonical message for the supplied fields", async () => {
  const pair = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const fields = { sessionId: "session-2", wave: 1, key: 7, studentId: "student-3" };
  const signature = await transport.signProof(
    { ...fields, privateKey: pair.privateKey, subtle: webcrypto.subtle }
  );

  assert.equal(
    await webcrypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pair.publicKey,
      Buffer.from(signature, "base64"),
      new TextEncoder().encode(transport.buildProofMessage(fields))
    ),
    true
  );
});

test("signing refuses a signature with an unexpected byte length", async () => {
  const subtle = {
    sign: async () => new Uint8Array(63).buffer,
  };

  await assert.rejects(
    () => transport.signProofMessage({}, "message", subtle),
    /unexpected signature length/
  );
});

test("signing refuses a missing key or a browser without WebCrypto", async () => {
  await assert.rejects(() => transport.signProofMessage(null, "message", webcrypto.subtle), /device key/);
  await assert.rejects(() => transport.signProofMessage({}, "message", {}), /cannot sign/);
  await assert.rejects(() => transport.signProofMessage({}, "", webcrypto.subtle), /message is required/);
});

test("submitProof posts the exact body to the session proof endpoint", async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 201,
      json: async () => ({ success: true, recorded: true, attendanceDecided: false }),
    };
  };

  const data = await transport.submitProof({
    sessionId: "session-1",
    wave: 2,
    key: 12345678,
    signature: "c2ln",
    apiUrl: "http://localhost:4000/api/v1///",
    fetcher,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:4000/api/v1/check-in-sessions/session-1/proofs");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    wave: 2,
    key: 12345678,
    signature: "c2ln",
  });
  assert.equal(data.attendanceDecided, false);
});

test("submitProof surfaces the server message and status on failure", async () => {
  const fetcher = async () => ({
    ok: false,
    status: 409,
    json: async () => ({ message: "The current wave key has expired." }),
  });

  await assert.rejects(
    () =>
      transport.submitProof({
        sessionId: "session-1",
        wave: 0,
        key: 1,
        signature: "c2ln",
        apiUrl: "http://localhost:4000/api/v1",
        fetcher,
      }),
    (error) => {
      assert.equal(error.message, "The current wave key has expired.");
      assert.equal(error.status, 409);
      return true;
    }
  );
});

test("submitProof fails clearly when the response is not JSON", async () => {
  const fetcher = async () => ({
    ok: false,
    status: 502,
    json: async () => {
      throw new Error("not json");
    },
  });

  await assert.rejects(
    () =>
      transport.submitProof({
        sessionId: "session-1",
        wave: 0,
        key: 1,
        signature: "c2ln",
        apiUrl: "http://localhost:4000/api/v1",
        fetcher,
      }),
    /could not be submitted/
  );
});

test("submitProof requires an API URL and a fetch implementation", async () => {
  await assert.rejects(
    () => transport.submitProof({ sessionId: "s", wave: 0, key: 1, signature: "c2ln" }),
    /API URL/
  );
  await assert.rejects(
    () =>
      transport.submitProof({
        sessionId: "s",
        wave: 0,
        key: 1,
        signature: "c2ln",
        apiUrl: "http://localhost:4000",
        fetcher: null,
      }),
    /fetch implementation/
  );
});

test("submitProof accepts a 204 with no body", async () => {
  const fetcher = async () => ({
    ok: true,
    status: 204,
    json: async () => {
      throw new Error("204 has no body");
    },
  });

  const data = await transport.submitProof({
    sessionId: "session-1",
    wave: 0,
    key: 1,
    signature: "c2ln",
    apiUrl: "http://localhost:4000/api/v1",
    fetcher,
  });
  assert.equal(data, null);
});

test("submitProof rejects a 200 JSON null body instead of treating it as success", async () => {
  const fetcher = async () => ({
    ok: true,
    status: 200,
    json: async () => null,
  });

  await assert.rejects(
    () =>
      transport.submitProof({
        sessionId: "session-1",
        wave: 0,
        key: 1,
        signature: "c2ln",
        apiUrl: "http://localhost:4000/api/v1",
        fetcher,
      }),
    (error) => {
      assert.match(error.message, /unreadable response/);
      assert.equal(error.status, 200);
      return true;
    }
  );
});

test("submitProof rejects a 2xx with an unreadable body", async () => {
  const fetcher = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError("Unexpected token <");
    },
  });

  await assert.rejects(
    () =>
      transport.submitProof({
        sessionId: "session-1",
        wave: 0,
        key: 1,
        signature: "c2ln",
        apiUrl: "http://localhost:4000/api/v1",
        fetcher,
      }),
    (error) => {
      assert.match(error.message, /unreadable response/);
      assert.equal(error.status, 200);
      return true;
    }
  );
});

test("submitProof wraps a network failure with status 0 and preserves the cause", async () => {
  const cause = new Error("socket hang up");
  const fetcher = async () => {
    throw cause;
  };

  await assert.rejects(
    () =>
      transport.submitProof({
        sessionId: "session-1",
        wave: 0,
        key: 1,
        signature: "c2ln",
        apiUrl: "http://localhost:4000/api/v1",
        fetcher,
      }),
    (error) => {
      assert.match(error.message, /network request failed/);
      assert.equal(error.status, 0);
      assert.equal(error.cause, cause);
      return true;
    }
  );
});
