/**
 * Browser-side mirror of the server device fingerprint.
 *
 * Kept as a CommonJS module with no browser globals at import time so the
 * exact canonical form can be checked against the server in a Node test. The
 * caller supplies WebCrypto's subtle implementation.
 */

const P256_COORDINATE = /^[A-Za-z0-9_-]{43}$/;

const normalisePublicKeyJwk = (publicKeyJwk) => {
  if (!publicKeyJwk || typeof publicKeyJwk !== "object") return null;
  if (publicKeyJwk.kty !== "EC" || publicKeyJwk.crv !== "P-256") return null;
  if (typeof publicKeyJwk.x !== "string" || typeof publicKeyJwk.y !== "string") return null;
  if (!P256_COORDINATE.test(publicKeyJwk.x) || !P256_COORDINATE.test(publicKeyJwk.y)) return null;
  if (publicKeyJwk.d !== undefined) return null;

  return {
    kty: "EC",
    crv: "P-256",
    x: publicKeyJwk.x,
    y: publicKeyJwk.y,
  };
};

const canonicalPublicKey = (publicKeyJwk) => {
  const key = normalisePublicKeyJwk(publicKeyJwk);
  return key ? JSON.stringify(key) : null;
};

const fingerprintPublicKeyJwk = async (
  publicKeyJwk,
  subtle = typeof globalThis !== "undefined" ? globalThis.crypto?.subtle : undefined
) => {
  const canonical = canonicalPublicKey(publicKeyJwk);
  if (!canonical) {
    throw new Error("A P-256 device public key is required.");
  }
  if (!subtle) throw new Error("This browser cannot fingerprint its device key.");

  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
};

module.exports = {
  P256_COORDINATE,
  normalisePublicKeyJwk,
  canonicalPublicKey,
  fingerprintPublicKeyJwk,
};
