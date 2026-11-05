const express = require("express");
const isAuthenticated = require("../middleware/auth");
const { createRateLimiter } = require("../middleware/rateLimit");
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

// Exports contain rosters, registers and query details. Limit bulk download
// per account as well as per IP so a compromised session cannot scrape every
// class in a loop. The current limiter is in-process; scale-out needs Redis.
const exportLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: "Too many exports. Wait a few minutes and try again.",
  keyFor: (req) => String(req.user?._id || req.ip || "unknown"),
});

router.get("/exports/attendance.pdf", staff, exportLimiter, attendancePdf);
router.get("/exports/attendance.xlsx", staff, exportLimiter, attendanceXlsx);
router.get("/exports/queries.pdf", staff, exportLimiter, queriesPdf);
router.get("/exports/queries.xlsx", staff, exportLimiter, queriesXlsx);
router.get("/exports/sessions/:sessionId.pdf", staff, exportLimiter, sessionPdf);
router.get("/exports/sessions/:sessionId.xlsx", staff, exportLimiter, sessionXlsx);

module.exports = router;
