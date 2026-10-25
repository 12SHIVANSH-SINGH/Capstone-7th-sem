/**
 * Browser-side cascade proof transport (Layer 2.3).
 *
 * The phone signs the exact decoded evidence with its bound device key and
 * posts it to the server. This module has no scoring or attendance logic; the
 * response says explicitly that no attendance decision was made.
 *
 * Kept as a CommonJS module, like the other acoustic helpers, so the contract
 * can be exercised by Node tests without a browser.
 */

const PROOF_MESSAGE_VERSION = "bioattend-proof:v1";
const SIGNATURE_BYTES = 64;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
// Same bounds as attendance-backend/utils/checkInSession.js. The key space is
// 15^7 because the FSK frame carries 7 base-15 data symbols.
const MAX_KEY_VALUE = 15 ** 7 - 1;
const MAX_WAVE = 1_000_000;
const UNREADABLE_RESPONSE = "The proof server returned an unreadable response.";

const normaliseId = (value) => String(value || "").trim();

// Browser-only defaults. Node tests inject their own WebCrypto/fetch, so the
// module can stay testable without pretending a browser exists.
const defaultSubtle = () => (typeof window !== "undefined" ? window.crypto?.subtle : undefined);
const defaultFetcher = () => (typeof window !== "undefined" ? window.fetch : undefined);

const buildProofMessage = ({ sessionId, wave, key, studentId }) => {
  const session = normaliseId(sessionId);
  const student = normaliseId(studentId);

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

const bytesToBase64 = (bytes) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const signProofMessage = async (privateKey, message, subtle = defaultSubtle()) => {
  if (!privateKey) throw new Error("This browser has no attendance device key. Sign in again.");
  if (typeof message !== "string" || !message) throw new Error("A proof message is required.");
  if (!subtle?.sign) throw new Error("This browser cannot sign attendance proofs.");

  const signature = await subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(message)
  );
  const bytes = new Uint8Array(signature);
  if (bytes.length !== SIGNATURE_BYTES) {
    throw new Error("The device produced an unexpected signature length.");
  }
  return bytesToBase64(bytes);
};

const signProof = async ({ sessionId, wave, key, studentId, privateKey, subtle }) =>
  signProofMessage(
    privateKey,
    buildProofMessage({ sessionId, wave, key, studentId }),
    subtle
  );

const submitProof = async ({
  sessionId,
  wave,
  key,
  signature,
  apiUrl,
  fetcher = defaultFetcher(),
}) => {
  if (!apiUrl) throw new Error("The API URL is required.");
  if (typeof fetcher !== "function") throw new Error("A fetch implementation is required.");

  let response;
  try {
    response = await fetcher(
      `${String(apiUrl).replace(/\/+$/, "")}/check-in-sessions/${encodeURIComponent(sessionId)}/proofs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ wave, key, signature }),
      }
    );
  } catch (cause) {
    const failure = new Error(
      "The proof could not be submitted because the network request failed."
    );
    failure.status = 0;
    failure.cause = cause;
    throw failure;
  }

  // 204 is a valid "nothing to say" response; do not parse an empty body.
  if (response.status === 204) return null;

  let data;
  let parseError = null;
  try {
    data = await response.json();
  } catch (error) {
    parseError = error;
  }

  if (!response.ok) {
    const failure = new Error(data?.message || "The proof could not be submitted.");
    failure.status = response.status;
    throw failure;
  }

  // A 2xx with HTML, text, JSON null or an empty body would otherwise look
  // like success. Only a 204 has a legitimate null body (handled above).
  if (parseError || data === undefined || data === null) {
    const failure = new Error(UNREADABLE_RESPONSE);
    failure.status = response.status;
    throw failure;
  }

  return data;
};

module.exports = {
  PROOF_MESSAGE_VERSION,
  SIGNATURE_BYTES,
  MAX_KEY_VALUE,
  MAX_WAVE,
  buildProofMessage,
  bytesToBase64,
  signProofMessage,
  signProof,
  submitProof,
};
