const test = require("node:test");
const assert = require("node:assert/strict");
const { fingerprintPublicKey } = require("../utils/deviceBinding");

test("creates one stable fingerprint regardless of JWK property order", () => {
  const key = { kty: "EC", crv: "P-256", x: "example-x", y: "example-y", ext: true };
  const reorderedKey = { y: "example-y", x: "example-x", crv: "P-256", kty: "EC" };

  assert.equal(fingerprintPublicKey(key), fingerprintPublicKey(reorderedKey));
  assert.match(fingerprintPublicKey(key), /^[a-f0-9]{64}$/);
});

test("rejects non-P-256 and incomplete device keys", () => {
  assert.equal(fingerprintPublicKey({ kty: "RSA", x: "x", y: "y" }), null);
  assert.equal(fingerprintPublicKey({ kty: "EC", crv: "P-256", x: "x" }), null);
});
