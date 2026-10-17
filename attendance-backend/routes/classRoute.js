const express = require("express");
const isAuthenticated = require("../middleware/auth");
const {
  listRooms,
  createClass,
  listClasses,
  previewRoster,
  replaceRoster,
  getRoster,
} = require("../controllers/classController");

const router = express.Router();
const teacherOnly = isAuthenticated.authorizeRoles("teacher");

router.use(isAuthenticated, teacherOnly);
router.get("/rooms", listRooms);
router.route("/classes").get(listClasses).post(createClass);
router.post("/classes/:classId/roster/preview", previewRoster);
router.put("/classes/:classId/roster", replaceRoster);
router.get("/classes/:classId/roster", getRoster);

module.exports = router;
