const express = require("express");
const isAuthenticated = require("../middleware/auth");
const {
  attendancePdf,
  attendanceXlsx,
  queriesPdf,
  queriesXlsx,
  sessionPdf,
  sessionXlsx,
} = require("../controllers/exportController");

const router = express.Router();
const staff = [isAuthenticated, isAuthenticated.authorizeRoles("teacher", "superadmin")];

router.get("/exports/attendance.pdf", staff, attendancePdf);
router.get("/exports/attendance.xlsx", staff, attendanceXlsx);
router.get("/exports/queries.pdf", staff, queriesPdf);
router.get("/exports/queries.xlsx", staff, queriesXlsx);
router.get("/exports/sessions/:sessionId.pdf", staff, sessionPdf);
router.get("/exports/sessions/:sessionId.xlsx", staff, sessionXlsx);

module.exports = router;
