/**
 * Pure state helpers for Layer 2 check-in sessions.
 *
 * A session starts at wave 0 with a server-minted key. Keys use the same
 * 15^7 code space as the FSK frame (7 data symbols, base 15), so every key can
 * be transmitted by the existing encoder without a mapping step.
 *
 * This module deliberately contains no Mongoose or Express code. The controller
 * persists the state; these helpers keep minting, expiry and API shaping
 * testable without a database or a phone.
 */

const crypto = require("crypto");

const KEY_RADIX = 15;
const KEY_DIGIT_COUNT = 7;
const KEY_SPACE = KEY_RADIX ** KEY_DIGIT_COUNT;
const MAX_KEY_VALUE = KEY_SPACE - 1;

const INITIAL_WAVE = 0;
// Hard ceiling shared by the session model, the proof validator and the browser.
// It is a wire-format bound, not a policy: no real class gets near it.
const MAX_WAVE = 1_000_000;
// A session is minutes long, so a small bounded history is enough for the
// teacher view and for later "lowest wave heard" work. Keeping every key would
// grow a session document without limit.
const MAX_KEY_HISTORY = 20;
const STATUS_ACTIVE = "active";
const STATUS_CLOSED = "closed";
const SESSION_STATUSES = [STATUS_ACTIVE, STATUS_CLOSED];

// One initial key lives for two minutes. This is long enough to start a check-in
// and short enough that a forwarded key is stale by the time it is shared. When
// wave advancement is added, each new wave gets the same lifetime.
const KEY_TTL_MS = 2 * 60 * 1000;

const isValidKey = (value) =>
  Number.isInteger(value) && value >= 0 && value <= MAX_KEY_VALUE;

const asDate = (value, label) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`${label} must be a valid date.`);
  }
  return date;
};

const mintKey = (randomInt = crypto.randomInt) => {
  const value = randomInt(KEY_SPACE);
  if (!isValidKey(value)) {
    throw new Error(`Key generator must return an integer from 0 to ${MAX_KEY_VALUE}.`);
  }
  return value;
};

// A repeated key would let a phone that heard the previous wave replay the
// same footprint. The probability is tiny, but make the invariant explicit.
const mintDistinctKey = (previous, randomInt = crypto.randomInt) => {
  let value = mintKey(randomInt);
  for (let attempt = 0; attempt < 5 && value === previous; attempt += 1) {
    value = mintKey(randomInt);
  }
  if (value === previous) {
    throw new Error("Could not mint a key different from the current wave.");
  }
  return value;
};

/**
 * The fields written when a teacher starts a session. The controller adds the
 * class, teacher and room references.
 */
const buildInitialSession = ({ now = new Date(), key = mintKey(), keyTtlMs = KEY_TTL_MS } = {}) => {
  if (!isValidKey(key)) {
    throw new RangeError(`key must be an integer from 0 to ${MAX_KEY_VALUE}.`);
  }
  if (!Number.isFinite(keyTtlMs) || keyTtlMs <= 0) {
    throw new RangeError("keyTtlMs must be a positive number.");
  }

  const startedAt = asDate(now, "now");
  return {
    status: STATUS_ACTIVE,
    wave: INITIAL_WAVE,
    key,
    keyIssuedAt: startedAt,
    keyExpiresAt: new Date(startedAt.getTime() + keyTtlMs),
    startedAt,
    closedAt: null,
  };
};

/**
 * Closing is idempotent: a second close keeps the first closedAt timestamp.
 */
const closeSessionState = (session, { now = new Date() } = {}) => {
  if (!session || !SESSION_STATUSES.includes(session.status)) {
    throw new TypeError("session must have a valid status.");
  }
  if (session.status === STATUS_CLOSED) {
    return {
      status: STATUS_CLOSED,
      closedAt: asDate(session.closedAt || now, "closedAt"),
    };
  }
  return { status: STATUS_CLOSED, closedAt: asDate(now, "now") };
};

/**
 * Move an active session to the next wave. The old key is archived (without
 * growing past maxHistory) and the new key gets a fresh lifetime. The caller
 * decides whether the current wave earned advancement; this helper is pure.
 */
const advanceSessionState = (
  session,
  {
    now = new Date(),
    key,
    keyTtlMs = KEY_TTL_MS,
    maxHistory = MAX_KEY_HISTORY,
  } = {}
) => {
  if (!session || session.status !== STATUS_ACTIVE) {
    throw new TypeError("session must be active to advance.");
  }
  if (!Number.isInteger(session.wave) || session.wave < 0 || session.wave >= MAX_WAVE) {
    throw new RangeError("session wave cannot advance further.");
  }
  if (!isValidKey(session.key)) {
    throw new TypeError("session key is not valid.");
  }
  if (!Number.isFinite(keyTtlMs) || keyTtlMs <= 0) {
    throw new RangeError("keyTtlMs must be a positive number.");
  }
  if (!Number.isInteger(maxHistory) || maxHistory <= 0) {
    throw new RangeError("maxHistory must be a positive integer.");
  }

  const nextKey = key === undefined ? mintDistinctKey(session.key) : key;
  if (!isValidKey(nextKey)) {
    throw new RangeError(`key must be an integer from 0 to ${MAX_KEY_VALUE}.`);
  }
  if (nextKey === session.key) {
    throw new RangeError("the next key must differ from the current key.");
  }

  const issuedAt = asDate(now, "now");
  const previous = {
    wave: session.wave,
    key: session.key,
    keyIssuedAt: asDate(session.keyIssuedAt, "keyIssuedAt"),
    keyExpiresAt: asDate(session.keyExpiresAt, "keyExpiresAt"),
  };
  const history = Array.isArray(session.keyHistory) ? session.keyHistory.slice() : [];
  history.push(previous);

  return {
    wave: session.wave + 1,
    key: nextKey,
    keyIssuedAt: issuedAt,
    keyExpiresAt: new Date(issuedAt.getTime() + keyTtlMs),
    keyHistory: history.slice(-maxHistory),
  };
};

const keyIsFresh = (session, now = new Date()) => {
  if (!session || session.status !== STATUS_ACTIVE || !isValidKey(session.key)) return false;
  const expiresAt = new Date(session.keyExpiresAt);
  if (Number.isNaN(expiresAt.getTime())) return false;
  return asDate(now, "now").getTime() < expiresAt.getTime();
};

const asIsoString = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const referenceId = (value) => {
  if (!value) return null;
  return String(value._id || value);
};

const classView = (courseClass) => {
  if (!courseClass) return null;
  return {
    id: referenceId(courseClass),
    courseCode: courseClass.courseCode || null,
    title: courseClass.title || null,
    section: courseClass.section || "",
  };
};

const roomView = (room) => {
  if (!room) return null;
  return {
    id: referenceId(room),
    roomNo: room.roomNo || null,
  };
};

const baseView = (session, now) => ({
  id: referenceId(session._id || session.id),
  class: classView(session.courseClass),
  room: roomView(session.room),
  status: session.status,
  wave: session.wave,
  keyIssuedAt: asIsoString(session.keyIssuedAt),
  keyExpiresAt: asIsoString(session.keyExpiresAt),
  keyExpired: !keyIsFresh(session, now),
  startedAt: asIsoString(session.startedAt),
  closedAt: asIsoString(session.closedAt),
});

/**
 * The teacher view may show which waves existed and when, but old keys are no
 * longer useful and are not returned. Keeping the summary key-free means a
 * teacher response cannot leak the whole cascade history.
 */
const keyHistoryView = (session) => {
  const history = Array.isArray(session?.keyHistory) ? session.keyHistory : [];
  return history.map((entry) => ({
    wave: Number.isInteger(entry?.wave) ? entry.wave : null,
    keyIssuedAt: asIsoString(entry?.keyIssuedAt),
    keyExpiresAt: asIsoString(entry?.keyExpiresAt),
  }));
};

/**
 * Teachers need the current key to play it. Students receive only the wave and
 * lifetime: a student gets the next key by proving they heard the current one,
 * which is the next slice.
 */
const toTeacherSession = (session, { now = new Date() } = {}) => ({
  ...baseView(session, now),
  key: session.key,
  waveHistory: keyHistoryView(session),
});

const toStudentSession = (session, { now = new Date() } = {}) => baseView(session, now);

module.exports = {
  KEY_RADIX,
  KEY_DIGIT_COUNT,
  KEY_SPACE,
  MAX_KEY_VALUE,
  INITIAL_WAVE,
  MAX_WAVE,
  MAX_KEY_HISTORY,
  STATUS_ACTIVE,
  STATUS_CLOSED,
  SESSION_STATUSES,
  KEY_TTL_MS,
  isValidKey,
  mintKey,
  mintDistinctKey,
  buildInitialSession,
  closeSessionState,
  advanceSessionState,
  keyIsFresh,
  keyHistoryView,
  toTeacherSession,
  toStudentSession,
};
