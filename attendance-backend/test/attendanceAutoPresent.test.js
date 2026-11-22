const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  autoPresentUpdate,
  AUTO_PRESENT_NOTE,
} = require("../utils/attendance");
const { ATTENDANCE_SOURCES } = require("../models/attendanceRecordModels");

test("auto-present writes an evidence source and a teacher-attributed note", () => {
  const markedAt = new Date("2026-11-22T10:00:00.000Z");
  const update = autoPresentUpdate({
    markedBy: "teacher-id",
    markedByEmail: " Teacher@NITJSR.ac.in ",
    markedAt,
  });

  assert.deepEqual(update.$set, {
    status: "present",
    source: "evidence",
    markedBy: "teacher-id",
    markedByEmail: "teacher@nitjsr.ac.in",
    markedAt,
    decisionNote: AUTO_PRESENT_NOTE,
  });
  assert.ok(ATTENDANCE_SOURCES.includes("evidence"));
});
