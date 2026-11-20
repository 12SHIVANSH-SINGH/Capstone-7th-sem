/**
 * Pure view helpers for the teacher check-in screen (slice 2.2).
 *
 * The server owns session state. These helpers only decide what the teacher's
 * phone shows: which session is live, how much key lifetime is left, and how
 * history durations read. Keeping them out of React makes the countdown and
 * list merging testable in Node.
 */

const STATUS_ACTIVE = "active";
const STATUS_CLOSED = "closed";

const findActiveSession = (sessions) => {
  if (!Array.isArray(sessions)) return null;
  return sessions.find((session) => session?.status === STATUS_ACTIVE) || null;
};

const upsertSession = (sessions, session) => {
  const list = Array.isArray(sessions) ? sessions : [];
  if (!session?.id) return list;

  const index = list.findIndex((entry) => entry?.id === session.id);
  if (index === -1) return [session, ...list];

  const next = list.slice();
  next[index] = session;
  return next;
};

const toTime = (value) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return new Date(value).getTime();
};

const keyRemainingMs = (session, now = new Date()) => {
  if (!session || session.status !== STATUS_ACTIVE || !session.keyExpiresAt) return 0;
  const expiresAt = toTime(session.keyExpiresAt);
  const current = toTime(now);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(current)) return 0;
  return Math.max(0, expiresAt - current);
};

const keyIsUsable = (session, now = new Date()) =>
  Boolean(session && session.status === STATUS_ACTIVE && keyRemainingMs(session, now) > 0);

const signalRemainingMs = (signal, now = new Date()) => {
  if (!signal || !signal.keyExpiresAt) return 0;
  const expiresAt = toTime(signal.keyExpiresAt);
  const current = toTime(now);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(current)) return 0;
  return Math.max(0, expiresAt - current);
};

/**
 * The teacher's manual nudge. A fresh pending signal is what a proving phone
 * would have relayed next; if no pending signal is fresh, replay the current
 * round. Returns null when neither is usable, which is the zero-evidence expiry
 * dead end: the teacher must close and start a fresh check-in.
 */
const boostSignal = (session, now = new Date()) => {
  if (!session || session.status !== STATUS_ACTIVE) return null;
  const pending = session.pending;
  if (
    pending &&
    Number.isInteger(pending.wave) &&
    Number.isInteger(pending.key) &&
    signalRemainingMs(pending, now) > 0
  ) {
    return {
      kind: "next",
      wave: pending.wave,
      key: pending.key,
      keyExpiresAt: pending.keyExpiresAt,
    };
  }
  if (keyIsUsable(session, now) && Number.isInteger(session.key)) {
    return {
      kind: "current",
      wave: session.wave,
      key: session.key,
      keyExpiresAt: session.keyExpiresAt,
    };
  }
  return null;
};

const roundEvidenceCount = (evidence, wave) => {
  const rows = Array.isArray(evidence?.byWave) ? evidence.byWave : [];
  return rows
    .filter((entry) => entry?.wave === wave)
    .reduce((total, entry) => total + (Number(entry.count) || 0), 0);
};

const formatCountdown = (milliseconds) => {
  // Round up so a key with 1 ms left still reads 0:01, and only the true
  // expiry instant reads 0:00.
  const totalSeconds = Math.max(0, Math.ceil((Number(milliseconds) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const sessionDurationMs = (session, now = new Date()) => {
  if (!session?.startedAt) return 0;
  const startedAt = toTime(session.startedAt);
  const endedAt = session.closedAt ? toTime(session.closedAt) : toTime(now);
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return 0;
  return Math.max(0, endedAt - startedAt);
};

const formatDuration = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
};

module.exports = {
  STATUS_ACTIVE,
  STATUS_CLOSED,
  findActiveSession,
  upsertSession,
  keyRemainingMs,
  keyIsUsable,
  signalRemainingMs,
  boostSignal,
  roundEvidenceCount,
  formatCountdown,
  sessionDurationMs,
  formatDuration,
};
