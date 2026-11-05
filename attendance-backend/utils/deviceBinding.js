const crypto = require("crypto");

// P-256 coordinates are 32 bytes, encoded as 43 unpadded base64url characters.
const P256_COORDINATE = /^[A-Za-z0-9_-]{43}$/;

/**
 * Accept only the public half of a P-256 JWK.
 *
 * Browsers produce exactly { kty, crv, x, y }. Rejecting anything else keeps
 * private key material (`d`) out of the database and stops a malformed point
 * from reaching crypto.createPublicKey later.
 */
const sanitizePublicKeyJwk = (publicKeyJwk) => {
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

const fingerprintPublicKey = (publicKeyJwk) => {
  const key = sanitizePublicKeyJwk(publicKeyJwk);
  if (!key) return null;

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(key))
    .digest("hex");
};

module.exports = { sanitizePublicKeyJwk, fingerprintPublicKey, P256_COORDINATE };
