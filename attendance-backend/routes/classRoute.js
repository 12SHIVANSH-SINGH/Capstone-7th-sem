const express = require("express");
const isAuthenticated = require("../middleware/auth");
const {
  listRooms,
  createRoom,
  createClass,
  listClasses,
  previewRoster,
  replaceRoster,
  getRoster,
} = require("../controllers/classController");

const router = express.Router();
const teacherOnly = isAuthenticated.authorizeRoles("teacher");
const guards = [isAuthenticated, teacherOnly];

// Guards are attached per route on purpose. A blanket router.use() here would
// also swallow every /api/v1 route mounted after this router (Google sign-in,
// device bindings) and answer them with 401 before they can run.
router.get("/rooms", guards, listRooms);
router.post("/rooms", guards, createRoom);
router.route("/classes").get(guards, listClasses).post(guards, createClass);
router.post("/classes/:classId/roster/preview", guards, previewRoster);
router.put("/classes/:classId/roster", guards, replaceRoster);
router.get("/classes/:classId/roster", guards, getRoster);

module.exports = router;
