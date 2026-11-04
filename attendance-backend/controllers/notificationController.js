const mongoose = require("mongoose");
const catchAsyncError = require("../middleware/catchasyncerror");
const ErrorHandler = require("../utils/errorhandler");
const Notification = require("../models/notificationModels");
const { notificationView } = require("../utils/notifications");

exports.listNotifications = catchAsyncError(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 100);
  const filter = { user: req.user._id };
  if (req.query.unread === "true") filter.readAt = null;
  const [notifications, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(limit),
    Notification.countDocuments({ user: req.user._id, readAt: null }),
  ]);
  res.status(200).json({
    success: true,
    unread,
    notifications: notifications.map(notificationView),
  });
});

exports.markRead = catchAsyncError(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.notificationId)) {
    return next(new ErrorHandler("Notification not found", 404));
  }
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.notificationId, user: req.user._id },
    { $set: { readAt: new Date() } },
    { new: true }
  );
  if (!notification) return next(new ErrorHandler("Notification not found", 404));
  res.status(200).json({ success: true, notification: notificationView(notification) });
});

exports.markAllRead = catchAsyncError(async (req, res) => {
  const result = await Notification.updateMany(
    { user: req.user._id, readAt: null },
    { $set: { readAt: new Date() } }
  );
  res.status(200).json({ success: true, updated: result.modifiedCount || 0 });
});

exports.clearRead = catchAsyncError(async (req, res) => {
  const result = await Notification.deleteMany({
    user: req.user._id,
    readAt: { $ne: null },
  });
  res.status(200).json({ success: true, deleted: result.deletedCount || 0 });
});
