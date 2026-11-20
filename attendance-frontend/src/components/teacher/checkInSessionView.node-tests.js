/**
 * Node tests for the teacher check-in view helpers (slice 2.2).
 *
 * Run with: npm run test:checkin
 * No browser and no server: session objects are plain JSON shaped like the
 * teacher API response.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const view = require("./checkInSessionView");

const session = (overrides = {}) => ({
  id: "session-1",
  status: "active",
  wave: 0,
  key: 12345,
  keyIssuedAt: "2026-10-24T12:00:00.000Z",
  keyExpiresAt: "2026-10-24T12:02:00.000Z",
  startedAt: "2026-10-24T12:00:00.000Z",
  closedAt: null,
  ...overrides,
});

test("the active session is found regardless of list order", () => {
  const closed = session({ id: "closed", status: "closed", closedAt: "2026-10-24T12:05:00.000Z" });
  const active = session({ id: "active" });

  assert.equal(view.findActiveSession([closed, active])?.id, "active");
  assert.equal(view.findActiveSession([active, closed])?.id, "active");
  assert.equal(view.findActiveSession([closed]), null);
  assert.equal(view.findActiveSession(null), null);
  assert.equal(view.findActiveSession([null, {}]), null);
});

test("upsert replaces a session in place and prepends a new one without mutating", () => {
  const first = session({ id: "one" });
  const second = session({ id: "two" });
  const list = [first, second];

  const replaced = view.upsertSession(list, { ...first, status: "closed" });
  assert.equal(replaced[0].status, "closed");
  assert.equal(replaced[1], second);
  assert.equal(list[0], first, "the original list must not be mutated");

  const added = view.upsertSession(list, session({ id: "three" }));
  assert.deepEqual(added.map((entry) => entry.id), ["three", "one", "two"]);
  assert.equal(view.upsertSession(null, session({ id: "only" })).length, 1);
  assert.deepEqual(view.upsertSession(list, {}), list);
});

test("key lifetime counts down and stops at zero", () => {
  const active = session();
  assert.equal(view.keyRemainingMs(active, new Date("2026-10-24T12:00:00.000Z")), 120000);
  assert.equal(view.keyRemainingMs(active, new Date("2026-10-24T12:01:30.500Z")), 29500);
  assert.equal(view.keyRemainingMs(active, new Date("2026-10-24T12:02:00.000Z")), 0);
  assert.equal(view.keyRemainingMs(active, new Date("2026-10-24T12:03:00.000Z")), 0);

  assert.equal(view.keyRemainingMs(session({ status: "closed" })), 0);
  assert.equal(view.keyRemainingMs(session({ keyExpiresAt: "not-a-date" })), 0);
  assert.equal(view.keyRemainingMs(null), 0);
});

test("a key is usable only while the session is active and unexpired", () => {
  const active = session();
  assert.equal(view.keyIsUsable(active, new Date("2026-10-24T12:01:59.999Z")), true);
  assert.equal(view.keyIsUsable(active, new Date("2026-10-24T12:02:00.000Z")), false);
  assert.equal(view.keyIsUsable(session({ status: "closed" })), false);
  assert.equal(view.keyIsUsable(session({ keyExpiresAt: "not-a-date" })), false);
  assert.equal(view.keyIsUsable(null), false);
});

test("a fresh pending signal wins the manual boost, then the current round", () => {
  const now = new Date("2026-10-24T12:00:30.000Z");
  const active = session({
    wave: 2,
    key: 555,
    pending: {
      wave: 3,
      key: 777,
      keyIssuedAt: "2026-10-24T12:00:10.000Z",
      keyExpiresAt: "2026-10-24T12:02:10.000Z",
      keyExpired: false,
    },
  });

  assert.deepEqual(view.boostSignal(active, now), {
    kind: "next",
    wave: 3,
    key: 777,
    keyExpiresAt: "2026-10-24T12:02:10.000Z",
  });

  const noPending = session({ wave: 2, key: 555 });
  assert.deepEqual(view.boostSignal(noPending, now), {
    kind: "current",
    wave: 2,
    key: 555,
    keyExpiresAt: "2026-10-24T12:02:00.000Z",
  });

  const expiredPending = session({
    wave: 2,
    key: 555,
    pending: {
      wave: 3,
      key: 777,
      keyExpiresAt: "2026-10-24T12:00:00.000Z",
    },
  });
  assert.equal(view.boostSignal(expiredPending, now)?.kind, "current");

  const stale = session({
    wave: 2,
    key: 555,
    keyExpiresAt: "2026-10-24T11:59:00.000Z",
    pending: {
      wave: 3,
      key: 777,
      keyExpiresAt: "2026-10-24T11:59:30.000Z",
    },
  });
  assert.equal(view.boostSignal(stale, now), null);
  assert.equal(view.boostSignal(session({ status: "closed" }), now), null);
  assert.equal(view.boostSignal(null, now), null);
});

test("round evidence counts only the live round", () => {
  const evidence = {
    total: 7,
    byWave: [
      { wave: 0, count: 4 },
      { wave: 1, count: 3 },
    ],
  };
  assert.equal(view.roundEvidenceCount(evidence, 0), 4);
  assert.equal(view.roundEvidenceCount(evidence, 1), 3);
  assert.equal(view.roundEvidenceCount(evidence, 2), 0);
  assert.equal(view.roundEvidenceCount({ byWave: [{ wave: 1, count: "2" }] }, 1), 2);
  assert.equal(view.roundEvidenceCount(null, 0), 0);
});

test("signal remaining time uses the pending lifetime", () => {
  const signal = { keyExpiresAt: "2026-10-24T12:02:00.000Z" };
  assert.equal(view.signalRemainingMs(signal, new Date("2026-10-24T12:01:30.500Z")), 29500);
  assert.equal(view.signalRemainingMs(signal, new Date("2026-10-24T12:03:00.000Z")), 0);
  assert.equal(view.signalRemainingMs({ keyExpiresAt: "bad" }), 0);
  assert.equal(view.signalRemainingMs(null), 0);
});

test("countdown formatting rounds up and clamps bad values", () => {
  assert.equal(view.formatCountdown(120000), "2:00");
  assert.equal(view.formatCountdown(119001), "2:00");
  assert.equal(view.formatCountdown(119000), "1:59");
  assert.equal(view.formatCountdown(1000), "0:01");
  assert.equal(view.formatCountdown(1), "0:01");
  assert.equal(view.formatCountdown(0), "0:00");
  assert.equal(view.formatCountdown(-5000), "0:00");
  assert.equal(view.formatCountdown("nonsense"), "0:00");
});

test("history durations use the close time or the current time", () => {
  const active = session();
  assert.equal(
    view.sessionDurationMs(active, new Date("2026-10-24T12:03:20.000Z")),
    200000
  );

  const closed = session({ status: "closed", closedAt: "2026-10-24T12:04:00.000Z" });
  assert.equal(
    view.sessionDurationMs(closed, new Date("2026-10-24T13:00:00.000Z")),
    240000
  );
  assert.equal(view.sessionDurationMs(session({ startedAt: "bad" })), 0);
  assert.equal(view.sessionDurationMs(null), 0);
});

test("duration formatting stays compact from seconds to hours", () => {
  assert.equal(view.formatDuration(0), "0s");
  assert.equal(view.formatDuration(59000), "59s");
  assert.equal(view.formatDuration(60000), "1m");
  assert.equal(view.formatDuration(125000), "2m 5s");
  assert.equal(view.formatDuration(3600000), "1h");
  assert.equal(view.formatDuration(3900000), "1h 5m");
  assert.equal(view.formatDuration(-1000), "0s");
  assert.equal(view.formatDuration("nonsense"), "0s");
});
