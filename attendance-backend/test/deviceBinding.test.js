const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizePublicKeyJwk, fingerprintPublicKey } = require("../utils/deviceBinding");

const X = "a".repeat(43);
const Y = "b".repeat(43);

test("creates one stable fingerprint regardless of JWK property order", () => {
  const key = { kty: "EC", crv: "P-256", x: X, y: Y, ext: true };
  const reorderedKey = { y: Y, x: X, crv: "P-256", kty: "EC" };

  assert.equal(fingerprintPublicKey(key), fingerprintPublicKey(reorderedKey));
  assert.match(fingerprintPublicKey(key), /^[a-f0-9]{64}$/);
});

test("stores only the public P-256 fields", () => {
  const key = sanitizePublicKeyJwk({
    kty: "EC",
    crv: "P-256",
    x: X,
    y: Y,
    d: "private-material",
    ext: true,
    key_ops: ["verify"],
  });

  assert.equal(key, null);
  assert.deepEqual(sanitizePublicKeyJwk({ kty: "EC", crv: "P-256", x: X, y: Y }), {
    kty: "EC",
    crv: "P-256",
    x: X,
    y: Y,
  });
});

test("rejects non-P-256, incomplete and malformed device keys", () => {
  assert.equal(fingerprintPublicKey({ kty: "RSA", x: X, y: Y }), null);
  assert.equal(fingerprintPublicKey({ kty: "EC", crv: "P-256", x: X }), null);
  assert.equal(fingerprintPublicKey({ kty: "EC", crv: "P-256", x: "short", y: Y }), null);
  assert.equal(fingerprintPublicKey({ kty: "EC", crv: "P-256", x: X, y: Y, d: "private" }), null);
});
