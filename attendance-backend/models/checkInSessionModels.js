const mongoose = require("mongoose");
const {
  MAX_KEY_VALUE,
  MAX_WAVE,
  INITIAL_WAVE,
  SESSION_STATUSES,
  STATUS_ACTIVE,
} = require("../utils/checkInSession");

// Previous wave keys, bounded by the controller/helper. They are stored for
// audit and the teacher's wave timeline, never returned to a student.
const keyHistorySchema = new mongoose.Schema(
  {
    wave: { type: Number, required: true, min: 0, max: MAX_WAVE },
    key: { type: Number, required: true, min: 0, max: MAX_KEY_VALUE },
    keyIssuedAt: { type: Date, required: true },
    keyExpiresAt: { type: Date, required: true },
  },
  { _id: false }
);

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

const checkInSessionSchema = new mongoose.Schema(
  {
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
    // Snapshot the room at start time. Renaming a room later must not rewrite
    // where an old check-in happened.
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    status: {
      type: String,
      enum: SESSION_STATUSES,
      default: STATUS_ACTIVE,
      index: true,
    },
    wave: {
      type: Number,
      default: INITIAL_WAVE,
      min: 0,
      max: MAX_WAVE,
      // min/max accept 1.5, so the integer check is explicit.
      validate: {
        validator: Number.isInteger,
        message: "wave must be a non-negative integer.",
      },
    },
    key: {
      type: Number,
      required: true,
      min: 0,
      max: MAX_KEY_VALUE,
    },
    keyIssuedAt: {
      type: Date,
      required: true,
    },
    keyExpiresAt: {
      type: Date,
      required: true,
    },
    // Wave 0 has no history. Advancing appends the wave/key that just ended.
    keyHistory: {
      type: [keyHistorySchema],
      default: [],
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    // Teacher location captured when the session is started. This is the
    // reference point shown next to a student's query location.
    teacherLocation: {
      type: locationSchema,
      default: null,
    },
    // Class identity is snapshotted so a renamed class does not rewrite old
    // attendance or exported registers.
    classSnapshot: {
      courseCode: { type: String, trim: true, default: "" },
      title: { type: String, trim: true, default: "" },
      section: { type: String, trim: true, default: "" },
      roomNo: { type: String, trim: true, default: "" },
    },
    rosterCount: { type: Number, default: 0, min: 0 },
    attendanceFinalized: { type: Boolean, default: false, index: true },
    attendanceFinalizedAt: { type: Date, default: null },
    attendanceFinalizedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Set when the session closes; computed from the configured query window.
    queryWindowEndsAt: { type: Date, default: null },
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// At most one active check-in per class. The partial filter leaves closed
// sessions in place as history. The controller also checks first and turns the
// rare concurrent-create duplicate into a clear 409.
checkInSessionSchema.index(
  { courseClass: 1 },
  {
    unique: true,
    partialFilterExpression: { status: STATUS_ACTIVE },
    name: "one_active_check_in_per_class",
  }
);

checkInSessionSchema.index({ courseClass: 1, startedAt: -1 });

module.exports = mongoose.model("CheckInSession", checkInSessionSchema);
