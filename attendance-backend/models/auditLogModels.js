const mongoose = require("mongoose");

const AUDIT_ACTIONS = [
  "session.created",
  "session.closed",
  "session.advanced",
  "session.attendance.finalized",
  "session.revoked_all",
  "attendance.marked",
  "attendance.override",
  "attendance.deleted",
  "query.created",
  "query.approved",
  "query.rejected",
  "query.expired",
  "query.reopened",
  "export.attendance.pdf",
  "export.attendance.xlsx",
  "export.queries.pdf",
  "export.queries.xlsx",
  "export.session.pdf",
  "export.session.xlsx",
  "export.users.xlsx",
  "export.audit.xlsx",
  "device.reviewed",
  "device.binding.first_requested",
  "device.binding.change_requested",
  "device.binding.approved",
  "device.binding.rejected",
  "admin.user.created",
  "admin.user.updated",
  "admin.user.sessions_revoked",
  "admin.class.created",
  "admin.class.updated",
  "admin.settings.updated",
  "admin.impersonation.started",
  "admin.impersonation.stopped",
  "admin.webauthn.registered",
  "admin.webauthn.step_up",
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
    // Tamper-evident chain. Legacy entries created before P1 have no seq/hash
    // and are reported separately by verification; they are never rewritten.
    seq: { type: Number },
    prevHash: { type: String, default: "" },
    hash: { type: String, default: "" },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
// A duplicate sequence means two writers forked the chain. Sparse keeps the
// index valid while legacy rows have no seq.
auditLogSchema.index({ seq: 1 }, { unique: true, sparse: true });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

module.exports = AuditLog;
module.exports.AUDIT_ACTIONS = AUDIT_ACTIONS;
