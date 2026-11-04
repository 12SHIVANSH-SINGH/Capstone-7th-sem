const express = require("express");
const isAuthenticated = require("../middleware/auth");
const {
  listTimetable,
  createTimetable,
  updateTimetable,
  deleteTimetable,
} = require("../controllers/timetableController");

const router = express.Router();

router.get("/timetable", isAuthenticated, listTimetable);
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
