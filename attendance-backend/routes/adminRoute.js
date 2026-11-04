const express = require("express");
const isAuthenticated = require("../middleware/auth");
const admin = require("../controllers/adminController");
const queryController = require("../controllers/queryController");
const exportController = require("../controllers/exportController");

const router = express.Router();

// This one route must run while the current cookie still belongs to the
// impersonated user, so it is mounted before the super-admin guard.
router.post("/admin/stop-impersonation", isAuthenticated, admin.stopImpersonation);

router.use("/admin", isAuthenticated, isAuthenticated.authorizeSuperAdmin);

router.get("/admin/overview", admin.overview);
router.get("/admin/users", admin.listUsers);
router.post("/admin/users", admin.createUser);
router.patch("/admin/users/:userId", admin.updateUser);
router.get("/admin/classes", admin.listClasses);
router.post("/admin/classes", admin.createClass);
router.patch("/admin/classes/:classId", admin.updateClass);
router.get("/admin/sessions", admin.listSessions);
router.get("/admin/sessions/:sessionId/attendance", admin.sessionAttendance);
router.patch("/admin/attendance/:recordId", admin.overrideAttendance);
router.delete("/admin/attendance/:recordId", admin.deleteAttendance);
router.get("/admin/queries", queryController.listAll);
router.get("/admin/audit", admin.listAudit);
router.get("/admin/settings", admin.getSettings);
router.patch("/admin/settings", admin.updateSettings);
router.post("/admin/impersonate/:userId", admin.impersonate);
router.get("/admin/demo/status", admin.demoStatus);
router.post("/admin/demo/seed", admin.seedDemo);
router.post("/admin/demo/reset", admin.resetDemo);
router.get("/admin/export/users.xlsx", exportController.exportUsersXlsx);
router.get("/admin/export/audit.xlsx", exportController.auditXlsx);

module.exports = router;
