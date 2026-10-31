const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../utils/checkInSession");
const CheckInSession = require("../models/checkInSessionModels");

test("the session key space matches the 7-symbol base-15 FSK frame", () => {
  assert.equal(core.KEY_RADIX, 15);
  assert.equal(core.KEY_DIGIT_COUNT, 7);
  assert.equal(core.KEY_SPACE, 170859375);
  assert.equal(core.MAX_KEY_VALUE, 170859374);
  assert.equal(core.isValidKey(0), true);
  assert.equal(core.isValidKey(core.MAX_KEY_VALUE), true);
  assert.equal(core.isValidKey(-1), false);
  assert.equal(core.isValidKey(core.KEY_SPACE), false);
  assert.equal(core.isValidKey(1.5), false);
  assert.equal(core.isValidKey("42"), false);
});

test("key minting uses the whole code space and rejects bad generators", () => {
  let requestedBound = null;
  const key = core.mintKey((bound) => {
    requestedBound = bound;
    return 12345678;
  });
  assert.equal(requestedBound, core.KEY_SPACE);
  assert.equal(key, 12345678);

  assert.throws(() => core.mintKey(() => core.KEY_SPACE), /integer from 0 to 170859374/);
  assert.throws(() => core.mintKey(() => -1), /integer from 0 to 170859374/);
  assert.throws(() => core.mintKey(() => 1.5), /integer from 0 to 170859374/);
});

test("a new session starts active at wave 0 with a fresh two-minute key", () => {
  const now = new Date("2026-10-24T12:00:00.000Z");
  const state = core.buildInitialSession({ now, key: 42 });

  assert.equal(state.status, core.STATUS_ACTIVE);
  assert.equal(state.wave, 0);
  assert.equal(state.key, 42);
  assert.equal(state.keyIssuedAt.toISOString(), "2026-10-24T12:00:00.000Z");
  assert.equal(state.keyExpiresAt.toISOString(), "2026-10-24T12:02:00.000Z");
  assert.equal(state.startedAt.toISOString(), "2026-10-24T12:00:00.000Z");
  assert.equal(state.closedAt, null);
  assert.equal(core.keyIsFresh(state, now), true);
});

test("starting a session rejects invalid keys, lifetimes and dates", () => {
  assert.throws(() => core.buildInitialSession({ key: -1 }), /key must be an integer/);
  assert.throws(() => core.buildInitialSession({ key: core.KEY_SPACE }), /key must be an integer/);
  assert.throws(() => core.buildInitialSession({ key: 1, keyTtlMs: 0 }), /positive number/);
  assert.throws(() => core.buildInitialSession({ key: 1, now: "not-a-date" }), /valid date/);
});

test("a key is no longer fresh at its exact expiry instant or after close", () => {
  const now = new Date("2026-10-24T12:00:00.000Z");
  const state = core.buildInitialSession({ now, key: 7, keyTtlMs: 1000 });

  assert.equal(core.keyIsFresh(state, new Date("2026-10-24T12:00:00.999Z")), true);
  assert.equal(core.keyIsFresh(state, new Date("2026-10-24T12:00:01.000Z")), false);
  assert.equal(core.keyIsFresh({ ...state, status: core.STATUS_CLOSED }, now), false);
  assert.equal(core.keyIsFresh({ ...state, keyExpiresAt: "bad" }, now), false);
});

test("closing a session is idempotent and preserves the first close time", () => {
  const session = {
    ...core.buildInitialSession({ now: new Date("2026-10-24T12:00:00.000Z"), key: 9 }),
  };

  const first = core.closeSessionState(session, { now: new Date("2026-10-24T12:04:00.000Z") });
  assert.equal(first.status, core.STATUS_CLOSED);
  assert.equal(first.closedAt.toISOString(), "2026-10-24T12:04:00.000Z");

  const second = core.closeSessionState(
    { ...session, ...first },
    { now: new Date("2026-10-24T12:06:00.000Z") }
  );
  assert.equal(second.closedAt.toISOString(), "2026-10-24T12:04:00.000Z");

  assert.throws(() => core.closeSessionState({ ...session, status: "paused" }), /valid status/);
});

test("advancing archives the old key and mints a fresh wave with bounded history", () => {
  const now = new Date("2026-10-24T12:02:00.000Z");
  const history = Array.from({ length: core.MAX_KEY_HISTORY }, (_, wave) => ({
    wave,
    key: 1000 + wave,
    keyIssuedAt: new Date("2026-10-24T11:00:00.000Z"),
    keyExpiresAt: new Date("2026-10-24T11:02:00.000Z"),
  }));
  const session = {
    ...core.buildInitialSession({ now: new Date("2026-10-24T12:00:00.000Z"), key: 42 }),
    wave: core.MAX_KEY_HISTORY - 1,
    key: 555,
    keyHistory: history,
  };

  const advanced = core.advanceSessionState(session, { now, key: 777 });
  assert.equal(advanced.wave, core.MAX_KEY_HISTORY);
  assert.equal(advanced.key, 777);
  assert.equal(advanced.keyIssuedAt.toISOString(), "2026-10-24T12:02:00.000Z");
  assert.equal(advanced.keyExpiresAt.toISOString(), "2026-10-24T12:04:00.000Z");
  assert.equal(advanced.keyHistory.length, core.MAX_KEY_HISTORY);
  assert.equal(advanced.keyHistory[0].wave, 1, "the oldest wave is dropped");
  assert.deepEqual(advanced.keyHistory.at(-1), {
    wave: core.MAX_KEY_HISTORY - 1,
    key: 555,
    keyIssuedAt: new Date("2026-10-24T12:00:00.000Z"),
    keyExpiresAt: new Date("2026-10-24T12:02:00.000Z"),
  });
  assert.equal(session.wave, core.MAX_KEY_HISTORY - 1, "the input is not mutated");
  assert.equal(session.key, 555);
});

test("advancing refuses closed sessions, the wave ceiling and a repeated key", () => {
  const base = {
    ...core.buildInitialSession({ now: new Date("2026-10-24T12:00:00.000Z"), key: 42 }),
  };

  assert.throws(
    () => core.advanceSessionState({ ...base, status: core.STATUS_CLOSED }),
    /must be active/
  );
  assert.throws(
    () => core.advanceSessionState({ ...base, wave: core.MAX_WAVE }, { key: 43 }),
    /cannot advance/
  );
  assert.throws(() => core.advanceSessionState(base, { key: 42 }), /must differ/);
  assert.throws(() => core.advanceSessionState(base, { key: 43, keyTtlMs: 0 }), /positive number/);
  assert.throws(
    () => core.advanceSessionState(base, { key: 43, maxHistory: 0 }),
    /positive integer/
  );
  assert.throws(
    () => core.advanceSessionState(base, { key: core.KEY_SPACE }),
    /integer from 0/
  );
});

test("the default next-key mint retries a collision and fails closed if it cannot", () => {
  const values = [42, 42, 43];
  assert.equal(core.mintDistinctKey(42, () => values.shift()), 43);
  assert.throws(() => core.mintDistinctKey(42, () => 42), /different from the current wave/);
});

test("teacher and student views expose the right session fields", () => {
  const now = new Date("2026-10-24T12:00:30.000Z");
  const session = {
    _id: "session-1",
    courseClass: {
      _id: "class-1",
      courseCode: "CS301",
      title: "Computer Networks",
      section: "A",
    },
    room: { _id: "room-1", roomNo: "B-204" },
    ...core.buildInitialSession({
      now: new Date("2026-10-24T12:00:00.000Z"),
      key: 314159,
    }),
    keyHistory: [
      {
        wave: 0,
        key: 271828,
        keyIssuedAt: new Date("2026-10-24T11:58:00.000Z"),
        keyExpiresAt: new Date("2026-10-24T12:00:00.000Z"),
      },
    ],
  };

  const teacher = core.toTeacherSession(session, { now });
  assert.deepEqual(teacher.class, {
    id: "class-1",
    courseCode: "CS301",
    title: "Computer Networks",
    section: "A",
  });
  assert.deepEqual(teacher.room, { id: "room-1", roomNo: "B-204" });
  assert.equal(teacher.id, "session-1");
  assert.equal(teacher.key, 314159);
  assert.equal(teacher.wave, 0);
  assert.equal(teacher.keyExpired, false);
  assert.equal(teacher.keyIssuedAt, "2026-10-24T12:00:00.000Z");
  assert.equal(teacher.keyExpiresAt, "2026-10-24T12:02:00.000Z");
  assert.equal(teacher.closedAt, null);
  assert.deepEqual(teacher.waveHistory, [
    {
      wave: 0,
      keyIssuedAt: "2026-10-24T11:58:00.000Z",
      keyExpiresAt: "2026-10-24T12:00:00.000Z",
    },
  ]);
  assert.equal(JSON.stringify(teacher).includes("271828"), false, "old keys stay private");

  const student = core.toStudentSession(session, { now });
  assert.equal(Object.hasOwn(student, "key"), false);
  assert.equal(Object.hasOwn(student, "keyHistory"), false);
  assert.equal(Object.hasOwn(student, "waveHistory"), false);
  assert.equal(student.id, "session-1");
  assert.equal(student.wave, 0);
  assert.equal(student.keyExpired, false);
  assert.deepEqual(student.class, teacher.class);
});

test("the model enforces one active check-in per class and the key range", () => {
  const keyPath = CheckInSession.schema.path("key");
  assert.equal(keyPath.options.min, 0);
  assert.equal(keyPath.options.max, core.MAX_KEY_VALUE);

  const statusPath = CheckInSession.schema.path("status");
  assert.deepEqual(statusPath.enumValues, [core.STATUS_ACTIVE, core.STATUS_CLOSED]);

  const historyPath = CheckInSession.schema.path("keyHistory");
  assert.ok(historyPath);
  assert.equal(historyPath.instance, "Array");
  assert.equal(CheckInSession.schema.path("keyHistory.wave").options.max, core.MAX_WAVE);
  assert.equal(CheckInSession.schema.path("keyHistory.key").options.max, core.MAX_KEY_VALUE);

  const activeIndex = CheckInSession.schema
    .indexes()
    .find(([, options]) => options.name === "one_active_check_in_per_class");
  assert.ok(activeIndex);
  assert.equal(activeIndex[0].courseClass, 1);
  assert.equal(activeIndex[1].unique, true);
  assert.deepEqual(activeIndex[1].partialFilterExpression, { status: core.STATUS_ACTIVE });
});
