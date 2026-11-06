const express = require("express");
const isAuthenticated = require("../middleware/auth");
const {
  listTimetable,
  createTimetable,
  updateTimetable,
  deleteTimetable,
  previewTimetablePdf,
} = require("../controllers/timetableController");
const acceptPdfUpload = require("../middleware/pdfUpload");
const { createPdfPreviewLimiter } = require("../middleware/pdfUpload");

const router = express.Router();
const timetablePdfLimiter = createPdfPreviewLimiter();

router.get("/timetable", isAuthenticated, listTimetable);
router.post(
  "/timetable/pdf/preview",
  isAuthenticated,
  isAuthenticated.authorizeRoles("teacher", "superadmin"),
  timetablePdfLimiter,
  acceptPdfUpload,
  previewTimetablePdf
);
router.post(
  "/timetable",
  isAuthenticated,
  isAuthenticated.authorizeRoles("teacher", "superadmin"),
  createTimetable
);
router.patch(
  "/timetable/:entryId",
  isAuthenticated,
  isAuthenticated.authorizeRoles("teacher", "superadmin"),
  updateTimetable
);
router.delete(
  "/timetable/:entryId",
  isAuthenticated,
  isAuthenticated.authorizeRoles("teacher", "superadmin"),
  deleteTimetable
);

module.exports = router;
