const test = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("crypto");

const fingerprint = require("./deviceFingerprint");
const { fingerprintPublicKey } = require("../../../attendance-backend/utils/deviceBinding");

const X = "a".repeat(43);
const Y = "b".repeat(43);
const publicKeyJwk = { kty: "EC", crv: "P-256", x: X, y: Y };

// Fixed sha256 of {"kty":"EC","crv":"P-256","x":"aaa…","y":"bbb…"}. Pinning the
// digest catches any change to field order or separator that would silently
// stop the browser matching the server's stored fingerprint.
const EXPECTED = "fb002753b10a0b4a11a5c27a6bdce23fa43e2409d62b9a0f280e2d797eeac2f6";

test("the browser fingerprint matches the server canonical hash", async () => {
  const fromBrowser = await fingerprint.fingerprintPublicKeyJwk(publicKeyJwk, webcrypto.subtle);
  assert.equal(fromBrowser, EXPECTED);
  assert.equal(fingerprintPublicKey(publicKeyJwk), EXPECTED);
});

test("extra fields are dropped before hashing", async () => {
  assert.equal(
    await fingerprint.fingerprintPublicKeyJwk(
      { ...publicKeyJwk, key_ops: ["verify"], ext: true },
      webcrypto.subtle
    ),
    EXPECTED
  );
  assert.equal(fingerprint.canonicalPublicKey(publicKeyJwk), JSON.stringify(publicKeyJwk));
});

test("private key material and malformed coordinates are rejected", async () => {
  assert.equal(fingerprint.canonicalPublicKey({ ...publicKeyJwk, d: "private" }), null);
  assert.equal(fingerprint.canonicalPublicKey({ ...publicKeyJwk, x: "too-short" }), null);
  assert.equal(fingerprint.canonicalPublicKey({ ...publicKeyJwk, kty: "RSA" }), null);
  assert.equal(fingerprint.canonicalPublicKey(null), null);

  await assert.rejects(
    fingerprint.fingerprintPublicKeyJwk({ ...publicKeyJwk, d: "private" }, webcrypto.subtle),
    /P-256 device public key/
  );
});

test("missing WebCrypto fails closed instead of returning a partial fingerprint", async () => {
  await assert.rejects(
    fingerprint.fingerprintPublicKeyJwk(publicKeyJwk, null),
    /cannot fingerprint/
  );
});
