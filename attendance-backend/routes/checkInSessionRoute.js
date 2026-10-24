const express = require("express");
const isAuthenticated = require("../middleware/auth");
const {
  createSession,
  listSessions,
  getSession,
  closeSession,
  getActiveSessionForStudent,
} = require("../controllers/checkInSessionController");

const router = express.Router();

const teacherOnly = [isAuthenticated, isAuthenticated.authorizeRoles("teacher")];
const studentOnly = [isAuthenticated, isAuthenticated.authorizeRoles("student")];

// Session responses contain the current key for the owner and are live state,
// not cacheable documents.
const noStore = (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
};

router
  .route("/classes/:classId/check-in-sessions")
  .get(noStore, teacherOnly, listSessions)
  .post(noStore, teacherOnly, createSession);

// More specific than the session-by-id route below, and kept separate because
// the caller is an enrolled student, not the teacher who owns the class.
router.get(
  "/classes/:classId/check-in-sessions/active",
  noStore,
  studentOnly,
  getActiveSessionForStudent
);

router.get("/check-in-sessions/:sessionId", noStore, teacherOnly, getSession);
router.post("/check-in-sessions/:sessionId/close", noStore, teacherOnly, closeSession);

module.exports = router;
