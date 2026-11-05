const express = require("express");
const isAuthenticated = require("../middleware/auth");
const {
  listRooms,
  createRoom,
  createClass,
  listClasses,
  previewRoster,
  previewRosterPdf,
  replaceRoster,
  getRoster,
} = require("../controllers/classController");
const acceptPdfUpload = require("../middleware/pdfUpload");
const { createRateLimiter } = require("../middleware/rateLimit");

const router = express.Router();
const teacherOnly = isAuthenticated.authorizeRoles("teacher");
const guards = [isAuthenticated, teacherOnly];
const pdfImportLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: "Too many PDF extractions. Wait a few minutes and try again.",
  keyFor: (req) => `${req.user?._id || "unknown"}:${req.ip || "unknown"}`,
});

// Guards are attached per route on purpose. A blanket router.use() here would
// also swallow every /api/v1 route mounted after this router (Google sign-in,
// device bindings) and answer them with 401 before they can run.
router.get("/rooms", [isAuthenticated, isAuthenticated.authorizeRoles("teacher", "superadmin")], listRooms);
router.post(
  "/rooms",
  [isAuthenticated, isAuthenticated.authorizeRoles("teacher", "superadmin")],
  createRoom
);
router.route("/classes").get(guards, listClasses).post(guards, createClass);
router.post("/classes/:classId/roster/preview", guards, previewRoster);
router.post(
  "/classes/:classId/roster/pdf/preview",
  [...guards, pdfImportLimiter, acceptPdfUpload],
  previewRosterPdf
);
router.put("/classes/:classId/roster", guards, replaceRoster);
router.get("/classes/:classId/roster", guards, getRoster);

module.exports = router;
