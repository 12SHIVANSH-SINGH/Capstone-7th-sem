const mongoose = require("mongoose");

const NOTIFICATION_TYPES = [
  "session.started",
  "session.closed",
  "attendance.finalized",
  "query.created",
  "query.approved",
  "query.rejected",
  "query.expired",
  "query.reopened",
  "device.approved",
  "device.rejected",
  "system",
];

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      default: "system",
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, trim: true, maxlength: 600, default: "" },
    link: { type: String, trim: true, maxlength: 300, default: "" },
    data: { type: mongoose.Schema.Types.Mixed, default: null },
    readAt: { type: Date, default: null, index: true },
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);

module.exports = Notification;
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
