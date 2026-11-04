const Notification = require("../models/notificationModels");
const { isDbReady } = require("./dbReady");

const notificationView = (notification) => ({
  id: String(notification._id),
  type: notification.type,
  title: notification.title,
  message: notification.message,
  link: notification.link,
  data: notification.data,
  readAt: notification.readAt ? new Date(notification.readAt).toISOString() : null,
  createdAt: notification.createdAt ? new Date(notification.createdAt).toISOString() : null,
  isDemo: Boolean(notification.isDemo),
});

const createNotification = async ({
  user,
  type = "system",
  title,
  message = "",
  link = "",
  data = null,
  isDemo = false,
}) => {
  if (!user || !isDbReady()) return null;
  try {
    return await Notification.create({ user, type, title, message, link, data, isDemo });
  } catch (error) {
    console.error(`[notification] failed for ${String(user)}: ${error.message}`);
    return null;
  }
};

const createNotifications = async (entries = []) => {
  if (!entries.length || !isDbReady()) return [];
  try {
    return await Notification.insertMany(
      entries.map((entry) => ({
        user: entry.user,
        type: entry.type || "system",
        title: entry.title,
        message: entry.message || "",
        link: entry.link || "",
        data: entry.data || null,
        isDemo: Boolean(entry.isDemo),
      })),
      { ordered: false }
    );
  } catch (error) {
    console.error(`[notification] bulk insert failed: ${error.message}`);
    return [];
  }
};

const notifyRoster = async ({ enrollments, type, title, message, link, isDemo = false }) => {
  const userIds = [...new Set(enrollments.map((entry) => String(entry.student || "")).filter(Boolean))];
  if (!userIds.length) return [];
  return createNotifications(
    userIds.map((user) => ({ user, type, title, message, link, isDemo }))
  );
};

module.exports = {
  notificationView,
  createNotification,
  createNotifications,
  notifyRoster,
};
