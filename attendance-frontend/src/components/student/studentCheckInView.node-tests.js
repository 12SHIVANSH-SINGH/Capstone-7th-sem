/**
 * Node tests for the student check-in view helpers (slice 2.4b).
 *
 * Run with: npm run test:studentcheckin
 * No browser, microphone or server: sessions and responses are plain JSON.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const view = require("./studentCheckInView");

const session = (overrides = {}) => ({
  id: "session-1",
  status: "active",
  wave: 0,
  keyExpiresAt: "2026-10-28T12:02:00.000Z",
  startedAt: "2026-10-28T12:00:00.000Z",
  closedAt: null,
  class: { id: "class-1", courseCode: "CS301", title: "Algorithms", section: "A" },
  room: { id: "room-1", roomNo: "B-204" },
  ...overrides,
});

test("selection prefers the chosen live session and ignores closed ones", () => {
  const closed = session({ id: "closed", status: "closed" });
  const live = session({ id: "live" });
  const other = session({ id: "other" });

  assert.equal(view.selectSession([closed, live, other], "other")?.id, "other");
  assert.equal(view.selectSession([closed, live, other], "missing")?.id, "live");
  assert.equal(view.selectSession([closed]), null);
  assert.equal(view.selectSession(null), null);
  assert.equal(view.selectSession([null, {}]), null);
});

test("session labels stay short and fall back when metadata is missing", () => {
  assert.equal(view.sessionLabel(session()), "CS301 · A");
  assert.equal(view.sessionLabel(session({ class: { courseCode: "CS301" } })), "CS301");
  assert.equal(view.sessionLabel(null), "Check-in");
  assert.equal(view.sessionTitle(session()), "Algorithms");
  assert.equal(view.sessionTitle(session({ class: {} })), "Live check-in");
  assert.equal(view.roomLabel(session()), "B-204");
  assert.equal(view.roomLabel(session({ room: null })), "Room not set");
});

test("a session is live only while the wave key is unexpired", () => {
  const live = session();
  assert.equal(view.sessionPhase(live, new Date("2026-10-28T12:01:59.999Z")), "live");
  assert.equal(view.sessionPhase(live, new Date("2026-10-28T12:02:00.000Z")), "expired");
  assert.equal(view.sessionPhase(session({ status: "closed" })), "closed");
  assert.equal(view.sessionPhase(null), "none");
  assert.equal(view.keyRemainingMs(live, new Date("2026-10-28T12:01:30.500Z")), 29500);
  assert.equal(view.keyRemainingMs(live, new Date("2026-10-28T12:03:00.000Z")), 0);
  assert.equal(view.keyRemainingMs(session({ keyExpiresAt: "bad" })), 0);
});

test("the Join gate checks device, session, expiry and consent in order", () => {
  const live = session();
  const now = new Date("2026-10-28T12:01:00.000Z");

  assert.equal(
    view.joinBlockReason({ session: live, deviceStatus: "approved", consent: true, now }),
    null
  );
  assert.equal(
    view.joinBlockReason({ session: live, deviceStatus: "review", consent: true, now }),
    "device"
  );
  assert.equal(
    view.joinBlockReason({ session: null, deviceStatus: "approved", consent: true, now }),
    "no-session"
  );
  assert.equal(
    view.joinBlockReason({
      session: live,
      deviceStatus: "approved",
      consent: true,
      now: new Date("2026-10-28T12:02:00.000Z"),
    }),
    "expired"
  );
  assert.equal(
    view.joinBlockReason({ session: live, deviceStatus: "approved", consent: false, now }),
    "consent"
  );
  assert.equal(
    view.joinBlockReason({
      session: session({ status: "closed" }),
      deviceStatus: "approved",
      consent: true,
      now,
    }),
    "closed"
  );
});

test("decoded keys use the same bounds as the proof transport", () => {
  assert.equal(view.isDecodedKey(0), true);
  assert.equal(view.isDecodedKey(15 ** 7 - 1), true);
  assert.equal(view.isDecodedKey(-1), false);
  assert.equal(view.isDecodedKey(15 ** 7), false);
  assert.equal(view.isDecodedKey(1.5), false);
  assert.equal(view.isDecodedKey("42"), false);
});

test("a new proof becomes an evidence view without exposing the key", () => {
  const evidence = view.evidenceFromResponse(
    {
      success: true,
      recorded: true,
      duplicate: false,
      attendanceDecided: false,
      proof: {
        id: "proof-1",
        sessionId: "session-1",
        wave: 0,
        recordedAt: "2026-10-28T12:01:10.000Z",
      },
    },
    session()
  );

  assert.deepEqual(evidence, {
    sessionId: "session-1",
    classLabel: "CS301 · A",
    wave: 0,
    recordedAt: "2026-10-28T12:01:10.000Z",
    duplicate: false,
    attendanceDecided: false,
  });
  assert.equal("key" in evidence, false);
});

test("an idempotent retry is marked as already recorded", () => {
  const evidence = view.evidenceFromResponse(
    {
      success: true,
      recorded: true,
      duplicate: true,
      attendanceDecided: false,
      proof: {
        id: "proof-1",
        sessionId: "session-1",
        wave: 2,
        recordedAt: "2026-10-28T12:01:10.000Z",
        duplicate: true,
      },
    },
    session({ wave: 2 })
  );

  assert.equal(evidence.duplicate, true);
  assert.equal(evidence.wave, 2);
});

test("an unrecorded or malformed response never looks like evidence", () => {
  assert.equal(view.evidenceFromResponse(null, session()), null);
  assert.equal(view.evidenceFromResponse({ recorded: false }, session()), null);
  assert.equal(
    view.evidenceFromResponse({ recorded: true, proof: null }, session()),
    null
  );
  assert.equal(
    view.evidenceFromResponse(
      { recorded: true, proof: { wave: -1 } },
      session()
    ),
    null
  );
});

test("countdown and recorded-time formatting clamp bad values", () => {
  assert.equal(view.formatCountdown(120000), "2:00");
  assert.equal(view.formatCountdown(119001), "2:00");
  assert.equal(view.formatCountdown(1000), "0:01");
  assert.equal(view.formatCountdown(-1), "0:00");
  assert.equal(view.formatCountdown("bad"), "0:00");
  assert.equal(view.formatTime(null), "Just now");
  assert.equal(view.formatTime("not-a-date"), "Just now");
});
