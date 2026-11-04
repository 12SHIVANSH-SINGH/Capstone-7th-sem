const mongoose = require("mongoose");

const QUERY_STATUSES = ["pending", "approved", "rejected", "expired"];
const QUERY_DECISIONS = ["approved", "rejected"];

const queryLocationSchema = new mongoose.Schema(
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
 * A student's claim that they attended a session but were not marked.
 *
 * The query clock starts at session close. The default window is 24 hours;
 * after that the query becomes `expired` but remains reviewable. A teacher (or
 * super admin) can still decide an expired query, and every reopen/decision
 * appends an immutable audit entry.
 */
const attendanceQuerySchema = new mongoose.Schema(
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
      required: true,
      index: true,
    },
    attendance: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttendanceRecord",
      default: null,
    },
    studentEmail: { type: String, required: true, trim: true, lowercase: true },
    studentName: { type: String, trim: true, default: "" },
    classSnapshot: {
      courseCode: { type: String, trim: true, default: "" },
      title: { type: String, trim: true, default: "" },
      section: { type: String, trim: true, default: "" },
      roomNo: { type: String, trim: true, default: "" },
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: QUERY_STATUSES,
      default: "pending",
      index: true,
    },
    // Snapshots used by the teacher's evidence panel.
    teacherLocation: { type: queryLocationSchema, default: null },
    attemptLocation: { type: queryLocationSchema, default: null },
    studentLocation: { type: queryLocationSchema, default: null },
    locationNote: { type: String, trim: true, maxlength: 300, default: "" },
    distanceMeters: { type: Number, default: null },
    withinRadius: { type: Boolean, default: null },
    radiusMeters: { type: Number, default: 30 },
    expiresAt: { type: Date, required: true, index: true },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    decidedByEmail: { type: String, trim: true, lowercase: true, default: "" },
    decidedAt: Date,
    decisionNote: { type: String, trim: true, maxlength: 500, default: "" },
    reopenedAt: Date,
    reopenedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reopenCount: { type: Number, default: 0, min: 0 },
    expiredAt: Date,
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

attendanceQuerySchema.index({ session: 1, studentEmail: 1 });
attendanceQuerySchema.index({ teacher: 1, status: 1, createdAt: -1 });
attendanceQuerySchema.index({ student: 1, createdAt: -1 });
attendanceQuerySchema.index({ status: 1, expiresAt: 1 });

const AttendanceQuery = mongoose.model("AttendanceQuery", attendanceQuerySchema);

module.exports = AttendanceQuery;
module.exports.QUERY_STATUSES = QUERY_STATUSES;
module.exports.QUERY_DECISIONS = QUERY_DECISIONS;
module.exports.queryLocationSchema = queryLocationSchema;
