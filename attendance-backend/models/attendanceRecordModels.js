const mongoose = require("mongoose");

// Who made the final call for one student in one session. `pending` means the
// session snapshot exists but the teacher has not decided (or finalised) yet.
const ATTENDANCE_STATUSES = ["pending", "present", "absent", "excused"];
const ATTENDANCE_SOURCES = ["pending", "manual", "query", "override", "demo", "auto"];

const locationSchema = new mongoose.Schema(
  {
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    accuracy: { type: Number, min: 0 },
    capturedAt: Date,
    source: {
      type: String,
      enum: ["browser", "manual", "teacher-session", "demo", "unknown"],
      default: "browser",
    },
  },
  { _id: false }
);

/**
 * One attendance decision for one student in one check-in session.
 *
 * The roster is snapshotted when the session starts, so later roster edits do
 * not rewrite history. Evidence counters are denormalised here because proof
 * documents expire after 24 hours while the attendance record must survive the
 * semester. The proof documents remain the audit trail while they exist.
 */
const attendanceRecordSchema = new mongoose.Schema(
  {
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CheckInSession",
      required: true,
      index: true,
    },
    courseClass: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourseClass",
      required: true,
      index: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    // Identity is snapshotted. A renamed account or removed roster entry must
    // not change what an old register says.
    studentEmail: { type: String, required: true, trim: true, lowercase: true },
    studentName: { type: String, trim: true, default: "" },
    rollNumber: { type: String, trim: true, default: "" },
    classSnapshot: {
      courseCode: { type: String, trim: true, default: "" },
      title: { type: String, trim: true, default: "" },
      section: { type: String, trim: true, default: "" },
      roomNo: { type: String, trim: true, default: "" },
    },
    status: {
      type: String,
      enum: ATTENDANCE_STATUSES,
      default: "pending",
      index: true,
    },
    source: {
      type: String,
      enum: ATTENDANCE_SOURCES,
      default: "pending",
    },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    markedByEmail: { type: String, trim: true, lowercase: true, default: "" },
    markedAt: Date,
    decisionNote: { type: String, trim: true, maxlength: 500, default: "" },
    query: { type: mongoose.Schema.Types.ObjectId, ref: "AttendanceQuery", default: null },
    // Location the student's browser shared when they attempted check-in, and
    // the teacher's location when the session started. Both are evidence, not
    // automatic decisions.
    attemptLocation: { type: locationSchema, default: null },
    teacherLocation: { type: locationSchema, default: null },
    evidence: {
      proofCount: { type: Number, default: 0, min: 0 },
      waves: { type: [Number], default: [] },
      firstProofAt: Date,
      lastProofAt: Date,
    },
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

attendanceRecordSchema.index(
  { session: 1, studentEmail: 1 },
  { unique: true, name: "one_attendance_record_per_student_session" }
);
attendanceRecordSchema.index({ courseClass: 1, studentEmail: 1, session: 1 });
attendanceRecordSchema.index({ student: 1, createdAt: -1 });
attendanceRecordSchema.index({ courseClass: 1, status: 1, createdAt: -1 });

const AttendanceRecord = mongoose.model("AttendanceRecord", attendanceRecordSchema);

module.exports = AttendanceRecord;
module.exports.ATTENDANCE_STATUSES = ATTENDANCE_STATUSES;
module.exports.ATTENDANCE_SOURCES = ATTENDANCE_SOURCES;
module.exports.locationSchema = locationSchema;
