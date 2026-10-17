const crypto = require("crypto");

const fingerprintPublicKey = (publicKeyJwk) => {
  if (!publicKeyJwk || publicKeyJwk.kty !== "EC" || publicKeyJwk.crv !== "P-256" || !publicKeyJwk.x || !publicKeyJwk.y) {
    return null;
  }

  const canonicalKey = JSON.stringify({
    crv: publicKeyJwk.crv,
    kty: publicKeyJwk.kty,
    x: publicKeyJwk.x,
    y: publicKeyJwk.y,
  });
  return crypto.createHash("sha256").update(canonicalKey).digest("hex");
};

module.exports = { fingerprintPublicKey };
