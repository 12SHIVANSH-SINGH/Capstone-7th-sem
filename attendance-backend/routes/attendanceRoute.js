const express = require("express");
const isAuthenticated = require("../middleware/auth");
const {
  getSessionAttendance,
  markAttendance,
  finalizeAttendance,
  myAttendance,
  mySessionHistory,
  teacherSessionHistory,
  classOverview,
  studentAttendance,
  teacherAudit,
} = require("../controllers/attendanceController");
const { recordAttemptLocation } = require("../controllers/checkInSessionController");

const router = express.Router();
const teacherOnly = [isAuthenticated, isAuthenticated.authorizeRoles("teacher")];
const staff = [isAuthenticated, isAuthenticated.authorizeRoles("teacher", "superadmin")];
const studentOnly = [isAuthenticated, isAuthenticated.authorizeRoles("student")];

router.get("/check-in-sessions/:sessionId/attendance", teacherOnly, getSessionAttendance);
router.patch("/check-in-sessions/:sessionId/attendance", teacherOnly, markAttendance);
router.post("/check-in-sessions/:sessionId/attendance/finalize", teacherOnly, finalizeAttendance);

// Student location at the check-in attempt. This is deliberately separate from
// proof submission: a denied GPS permission must not stop the acoustic proof.
router.post(
  "/check-in-sessions/:sessionId/location",
  studentOnly,
  recordAttemptLocation
);

router.get("/attendance/me", studentOnly, myAttendance);
router.get("/attendance/me/sessions", studentOnly, mySessionHistory);
router.get("/attendance/sessions", staff, teacherSessionHistory);
router.get("/attendance/classes/:classId/overview", staff, classOverview);
router.get(
  "/attendance/classes/:classId/students/:studentId",
  staff,
  studentAttendance
);
router.get("/audit/me", teacherOnly, teacherAudit);

module.exports = router;
