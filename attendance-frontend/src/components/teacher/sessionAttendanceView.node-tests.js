/**
 * Node tests for the session register draft helpers.
 *
 * Run with: npm run test:attendance
 * No browser and no server: records are plain JSON shaped like the register
 * API response.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const view = require("./sessionAttendanceView");

const records = () => [
  { id: "r1", status: "pending", decisionNote: "" },
  { id: "r2", status: "present", decisionNote: "Seen in the front row." },
  { id: "r3", status: "absent", decisionNote: "No evidence." },
];

test("a status-only change is saved and the existing note is preserved", () => {
  const list = records();
  const drafts = { r1: "present", r2: "absent" };
  const notes = {};

  assert.deepEqual(view.changedRecordIds(list, drafts, notes), ["r1", "r2"]);
  assert.deepEqual(view.attendanceUpdates(list, drafts, notes), [
    { recordId: "r1", status: "present", note: "" },
    { recordId: "r2", status: "absent", note: "Seen in the front row." },
  ]);
});

test("a note-only change is saved with the current status", () => {
  const list = records();
  const notes = { r1: "Asked to sit near the front.", r3: "Excused for a lab." };

  assert.deepEqual(view.changedRecordIds(list, {}, notes), ["r1", "r3"]);
  assert.deepEqual(view.attendanceUpdates(list, {}, notes), [
    { recordId: "r1", status: "pending", note: "Asked to sit near the front." },
    { recordId: "r3", status: "absent", note: "Excused for a lab." },
  ]);
});

test("status and note changes on the same row produce one update", () => {
  const list = records();
  const drafts = { r1: "excused" };
  const notes = { r1: "Medical certificate shown." };

  assert.deepEqual(view.attendanceUpdates(list, drafts, notes), [
    { recordId: "r1", status: "excused", note: "Medical certificate shown." },
  ]);
});

test("reverting a note to its saved value removes the unsaved change", () => {
  const list = records();
  const notes = { r2: "Seen in the front row." };

  assert.deepEqual(view.changedRecordIds(list, {}, notes), []);
  assert.deepEqual(view.attendanceUpdates(list, {}, notes), []);
});

test("clearing an existing note is a change", () => {
  const list = records();
  const notes = { r2: "" };

  assert.deepEqual(view.changedRecordIds(list, {}, notes), ["r2"]);
  assert.deepEqual(view.attendanceUpdates(list, {}, notes), [
    { recordId: "r2", status: "present", note: "" },
  ]);
});

test("unknown draft ids and malformed records are ignored", () => {
  const list = [...records(), null, { status: "present" }];
  const drafts = { missing: "present" };
  const notes = { missing: "not a real row" };

  assert.deepEqual(view.changedRecordIds(list, drafts, notes), []);
  assert.deepEqual(view.attendanceUpdates(list, drafts, notes), []);
  assert.deepEqual(view.changedRecordIds(null, drafts, notes), []);
});

test("note values normalise null and undefined to an empty string", () => {
  const list = [{ id: "r1", status: "pending", decisionNote: null }];
  assert.equal(view.noteValueFor(list[0], {}), "");
  assert.equal(view.noteValueFor(list[0], { r1: undefined }), "");
  assert.equal(view.hasNoteChange(list[0], {}), false);
  assert.equal(view.hasNoteChange(list[0], { r1: "" }), false);
});
