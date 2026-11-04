const mongoose = require("mongoose");

const AUDIT_ACTIONS = [
  "session.created",
  "session.closed",
  "session.advanced",
  "session.attendance.finalized",
  "attendance.marked",
  "attendance.override",
  "attendance.deleted",
  "query.created",
  "query.approved",
  "query.rejected",
  "query.expired",
  "query.reopened",
  "device.reviewed",
  "admin.user.created",
  "admin.user.updated",
  "admin.class.created",
  "admin.class.updated",
  "admin.settings.updated",
  "admin.impersonation.started",
  "admin.impersonation.stopped",
  "admin.demo.seeded",
  "admin.demo.reset",
  "auth.superadmin.granted",
  "timetable.created",
  "timetable.updated",
  "timetable.deleted",
];

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      index: true,
      validate: {
        validator: (value) => AUDIT_ACTIONS.includes(value),
        message: "Unknown audit action.",
      },
    },
    entityType: {
      type: String,
      required: true,
      index: true,
      maxlength: 60,
    },
    entityId: { type: String, trim: true, default: "", index: true },
    // Actor snapshots survive account deletion or rename.
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    actorEmail: { type: String, trim: true, lowercase: true, default: "" },
    actorRole: { type: String, trim: true, default: "" },
    impersonator: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    impersonatorEmail: { type: String, trim: true, lowercase: true, default: "" },
    summary: { type: String, trim: true, maxlength: 500, default: "" },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    ip: { type: String, trim: true, default: "" },
    userAgent: { type: String, trim: true, maxlength: 500, default: "" },
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

module.exports = AuditLog;
module.exports.AUDIT_ACTIONS = AUDIT_ACTIONS;
