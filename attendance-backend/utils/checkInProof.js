/**
 * Pure helpers for Layer 2.3 cascade proof transport.
 *
 * A proof is what a student's phone decoded: the session, the wave and the key.
 * The server records it as evidence only. This module deliberately has no
 * attendance or score field: deciding who was present is a later, gated slice.
 *
 * The signature ties the submission to the P-256 device key that the student
 * bound at sign-in. Once a device key is bound, a copied session cookie alone
 * cannot submit a proof. First binding for a never-bound account is the
 * recovery boundary and is an open item.
 */

const crypto = require("crypto");
const { MAX_KEY_VALUE, MAX_WAVE, STATUS_ACTIVE, keyIsFresh } = require("./checkInSession");

const PROOF_MESSAGE_VERSION = "bioattend-proof:v1";
const SIGNATURE_BYTES = 64;
const SIGNATURE_BASE64 = /^[A-Za-z0-9+/]{86}==$/;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const PROOF_OUTCOMES = {
  ACCEPT: "accept",
  DUPLICATE: "duplicate",
  REJECT: "reject",
};

const referenceId = (value) => {
  if (!value) return "";
  return String(value._id || value).trim();
};

const decodeSignature = (value) => {
  if (typeof value !== "string" || !SIGNATURE_BASE64.test(value)) return null;
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== SIGNATURE_BYTES) return null;
  // Reject non-canonical encodings instead of letting Buffer repair them.
  return bytes.toString("base64") === value ? bytes : null;
};

/**
 * The exact string the browser signs. Versioned so a future protocol change
 * cannot silently reuse old signatures.
 */
const buildProofMessage = ({ sessionId, wave, key, studentId }) => {
  const session = referenceId(sessionId);
  const student = referenceId(studentId);

  if (!SAFE_ID.test(session)) throw new TypeError("sessionId is not valid.");
  if (!SAFE_ID.test(student)) throw new TypeError("studentId is not valid.");
  if (!Number.isInteger(wave) || wave < 0 || wave > MAX_WAVE) {
    throw new TypeError("wave must be a non-negative integer.");
  }
  if (!Number.isInteger(key) || key < 0 || key > MAX_KEY_VALUE) {
    throw new TypeError(`key must be an integer from 0 to ${MAX_KEY_VALUE}.`);
  }

  return `${PROOF_MESSAGE_VERSION}|session=${session}|wave=${wave}|key=${key}|student=${student}`;
};

const verifyProofSignature = ({ publicKeyJwk, message, signature }) => {
  const bytes = decodeSignature(signature);
  if (!bytes || typeof message !== "string" || !message) return false;
  if (publicKeyJwk?.kty !== "EC" || publicKeyJwk?.crv !== "P-256") return false;

  try {
    const key = crypto.createPublicKey({ key: publicKeyJwk, format: "jwk" });
    return crypto.verify(
      "sha256",
      Buffer.from(message, "utf8"),
      { key, dsaEncoding: "ieee-p1363" },
      bytes
    );
  } catch (error) {
    // A malformed stored key must fail closed, not crash the request.
    return false;
  }
};

/**
 * Shape validation for the request body. Returns a plain object so the
 * controller can translate a bad body into one clear 400.
 */
const validateProofPayload = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "A proof body is required." };
  }

  const { wave, key, signature } = body;
  if (!Number.isInteger(wave) || wave < 0 || wave > MAX_WAVE) {
    return { ok: false, message: "wave must be a non-negative integer." };
  }
  if (!Number.isInteger(key) || key < 0 || key > MAX_KEY_VALUE) {
    return { ok: false, message: `key must be an integer from 0 to ${MAX_KEY_VALUE}.` };
  }
  if (!decodeSignature(signature)) {
    return { ok: false, message: "signature must be a 64-byte P-256 ECDSA signature in base64." };
  }

  return { ok: true, payload: { wave, key, signature } };
};

const reject = (status, message) => ({
  outcome: PROOF_OUTCOMES.REJECT,
  status,
  message,
});

/**
 * Decide whether a structurally valid, signed proof may be stored.
 *
 * A retry of an already recorded proof is a success even after the key expired
 * or the session closed: the evidence was accepted the first time and the
 * client must not show a failure for it. A different key for the same wave is a
 * conflict, never a second record.
 *
 * This function does not decide attendance. It only decides whether the
 * evidence can be stored.
 */
const evaluateProof = ({ session, proof, wave, key, now = new Date() }) => {
  if (!session || !referenceId(session)) {
    return reject(404, "Check-in session not found");
  }

  if (proof) {
    if (proof.wave === wave && proof.key === key) {
      return {
        outcome: PROOF_OUTCOMES.DUPLICATE,
        status: 200,
        message: "This proof was already recorded.",
      };
    }
    return reject(409, "A different proof is already recorded for this wave.");
  }

  if (session.status !== STATUS_ACTIVE) {
    return reject(409, "This check-in session is closed.");
  }
  if (!Number.isInteger(session.wave) || wave !== session.wave) {
    return reject(409, "This wave is no longer current.");
  }
  // Freshness before key equality: otherwise an expired wave answers 409 for
  // the correct key but 400 for a wrong one, telling an attacker which guess
  // was right after expiry.
  if (!keyIsFresh(session, now)) {
    return reject(409, "The current wave key has expired.");
  }
  if (key !== session.key) {
    return reject(400, "The decoded key does not match the current wave.");
  }

  return {
    outcome: PROOF_OUTCOMES.ACCEPT,
    status: 201,
    message: "Proof recorded.",
  };
};

const asIsoString = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toProofView = (proof, { duplicate = false } = {}) => ({
  id: referenceId(proof._id || proof.id),
  sessionId: referenceId(proof.session),
  wave: proof.wave,
  recordedAt: asIsoString(proof.createdAt || proof.recordedAt),
  duplicate: Boolean(duplicate),
});

module.exports = {
  PROOF_MESSAGE_VERSION,
  SIGNATURE_BYTES,
  SIGNATURE_BASE64,
  MAX_WAVE,
  PROOF_OUTCOMES,
  buildProofMessage,
  verifyProofSignature,
  validateProofPayload,
  evaluateProof,
  toProofView,
};
