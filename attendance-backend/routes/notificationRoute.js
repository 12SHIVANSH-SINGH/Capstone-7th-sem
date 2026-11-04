const express = require("express");
const isAuthenticated = require("../middleware/auth");
const {
  listNotifications,
  markRead,
  markAllRead,
  clearRead,
} = require("../controllers/notificationController");

const router = express.Router();

router.get("/notifications", isAuthenticated, listNotifications);
router.post("/notifications/read-all", isAuthenticated, markAllRead);
router.post("/notifications/:notificationId/read", isAuthenticated, markRead);
router.delete("/notifications/read", isAuthenticated, clearRead);

module.exports = router;
