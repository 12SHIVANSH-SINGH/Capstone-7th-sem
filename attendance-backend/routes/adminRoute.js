const express = require("express");
const isAuthenticated = require("../middleware/auth");
const admin = require("../controllers/adminController");
const queryController = require("../controllers/queryController");
const exportController = require("../controllers/exportController");
const adminPasskey = require("../controllers/adminPasskeyController");
const { createRateLimiter } = require("../middleware/rateLimit");
const {
  requireAdminStepUp,
  requireAdminStepUpForUserChange,
} = require("../middleware/adminStepUp");

const router = express.Router();

// Stopping impersonation is authenticated by the separate admin_token cookie,
// not by the impersonated user's cookie. That lets the owner exit even if the
// target account was disabled or its sessions were revoked mid-impersonation.
router.post("/admin/stop-impersonation", admin.stopImpersonation);

router.use("/admin", isAuthenticated, isAuthenticated.authorizeSuperAdmin);

const adminPasskeyLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: "Too many passkey attempts. Wait a few minutes and try again.",
  keyFor: (req) => String(req.user?._id || req.ip || "unknown"),
});

// Passkey enrollment and step-up. The controller allows the very first
// passkey (trust-on-first-use) and requires a step-up for additional ones.
router.get("/admin/webauthn/status", adminPasskey.status);
router.post("/admin/webauthn/register/options", adminPasskeyLimiter, adminPasskey.registrationOptions);
router.post("/admin/webauthn/register/verify", adminPasskeyLimiter, adminPasskey.verifyRegistration);
router.post("/admin/webauthn/step-up/options", adminPasskeyLimiter, adminPasskey.stepUpOptions);
router.post("/admin/webauthn/step-up/verify", adminPasskeyLimiter, adminPasskey.verifyStepUp);

router.get("/admin/overview", admin.overview);
router.get("/admin/users", admin.listUsers);
router.post("/admin/users", admin.createUser);
router.patch(
  "/admin/users/:userId",
  requireAdminStepUpForUserChange,
  admin.updateUser
);
router.post(
  "/admin/users/:userId/revoke-sessions",
  requireAdminStepUp,
  admin.revokeUserSessions
);
router.get("/admin/classes", admin.listClasses);
router.post("/admin/classes", admin.createClass);
router.patch("/admin/classes/:classId", admin.updateClass);
router.get("/admin/sessions", admin.listSessions);
router.get("/admin/sessions/:sessionId/attendance", admin.sessionAttendance);
router.patch(
  "/admin/attendance/:recordId",
  requireAdminStepUp,
  admin.overrideAttendance
);
router.delete(
  "/admin/attendance/:recordId",
  requireAdminStepUp,
  admin.deleteAttendance
);
router.get("/admin/queries", queryController.listAll);
router.get("/admin/audit/verify", admin.verifyAudit);
router.get("/admin/audit", admin.listAudit);
router.get("/admin/settings", admin.getSettings);
router.patch("/admin/settings", requireAdminStepUp, admin.updateSettings);
router.post("/admin/impersonate/:userId", requireAdminStepUp, admin.impersonate);
router.get("/admin/demo/status", admin.demoStatus);
router.post("/admin/demo/seed", admin.seedDemo);
router.post("/admin/demo/reset", requireAdminStepUp, admin.resetDemo);
const adminExportLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: "Too many exports. Wait a few minutes and try again.",
  keyFor: (req) => String(req.user?._id || req.ip || "unknown"),
});
router.get("/admin/export/users.xlsx", adminExportLimiter, exportController.exportUsersXlsx);
router.get("/admin/export/audit.xlsx", adminExportLimiter, exportController.auditXlsx);

module.exports = router;
