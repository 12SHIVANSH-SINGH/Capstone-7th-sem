/**
 * Pure view helpers for the student check-in shell (slice 2.4b).
 *
 * The server owns session, key and evidence state. These helpers only decide
 * what the student's phone shows and whether Join is allowed. Keeping them out
 * of React makes the consent gate, expiry state and evidence view testable in
 * Node without a browser or microphone.
 *
 * There is deliberately no key field in the evidence view: the student never
 * receives the session key, and the decoded tone value is not displayed.
 */

const { MAX_KEY_VALUE } = require("../../acoustic/proofTransport");

const CONSENT_VERSION = "2026-10-28";
const EVIDENCE_TTL_HOURS = 24;

const isActiveSession = (session) =>
  Boolean(session && session.id && session.status === "active");

const selectSession = (sessions, preferredId) => {
  if (!Array.isArray(sessions)) return null;
  const usable = sessions.filter(isActiveSession);
  if (usable.length === 0) return null;
  return usable.find((session) => session.id === preferredId) || usable[0];
};

const sessionLabel = (session) => {
  if (!session) return "Check-in";
  const courseClass = session.class || {};
  const code = courseClass.courseCode || "Class";
  return courseClass.section ? `${code} · ${courseClass.section}` : code;
};

const sessionTitle = (session) =>
  session?.class?.title || session?.class?.courseCode || "Live check-in";

const roomLabel = (session) => session?.room?.roomNo || "Room not set";

const toTime = (value) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return new Date(value).getTime();
};

const keyRemainingMs = (session, now = new Date()) => {
  if (!isActiveSession(session) || !session.keyExpiresAt) return 0;
  const expiresAt = toTime(session.keyExpiresAt);
  const current = toTime(now);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(current)) return 0;
  return Math.max(0, expiresAt - current);
};

/**
 * The shell is only useful while a live, unexpired wave exists. The server
 * enforces both; this is the display gate so the Join button is not offered
 * for a session that would reject the proof.
 */
const sessionPhase = (session, now = new Date()) => {
  if (!session) return "none";
  if (session.status !== "active") return "closed";
  return keyRemainingMs(session, now) > 0 ? "live" : "expired";
};

const joinBlockReason = ({ session, deviceStatus, consent, now = new Date() }) => {
  if (deviceStatus !== "approved") return "device";
  if (!session) return "no-session";
  if (session.status !== "active") return "closed";
  if (keyRemainingMs(session, now) <= 0) return "expired";
  if (!consent) return "consent";
  return null;
};

const isDecodedKey = (value) =>
  Number.isInteger(value) && value >= 0 && value <= MAX_KEY_VALUE;

const evidenceFromResponse = (response, session) => {
  const proof = response?.proof;
  if (!response || response.recorded !== true || !proof || !session) return null;
  if (!Number.isInteger(proof.wave) || proof.wave < 0) return null;

  return {
    sessionId: proof.sessionId || session.id,
    classLabel: sessionLabel(session),
    wave: proof.wave,
    recordedAt: proof.recordedAt || null,
    duplicate: Boolean(response.duplicate || proof.duplicate),
    attendanceDecided: response.attendanceDecided === true,
  };
};

const formatTime = (value) => {
  if (!value) return "Just now";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatCountdown = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.ceil((Number(milliseconds) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

module.exports = {
  CONSENT_VERSION,
  EVIDENCE_TTL_HOURS,
  isActiveSession,
  selectSession,
  sessionLabel,
  sessionTitle,
  roomLabel,
  keyRemainingMs,
  sessionPhase,
  joinBlockReason,
  isDecodedKey,
  evidenceFromResponse,
  formatTime,
  formatCountdown,
};
