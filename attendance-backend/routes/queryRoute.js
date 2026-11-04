const express = require("express");
const isAuthenticated = require("../middleware/auth");
const {
  createQuery,
  listMine,
  listReview,
  getQuery,
  decideQuery,
  reopenQuery,
  queryAudit,
} = require("../controllers/queryController");

const router = express.Router();
const teacherOnly = [isAuthenticated, isAuthenticated.authorizeRoles("teacher")];
const reviewer = [isAuthenticated, isAuthenticated.authorizeRoles("teacher", "superadmin")];

router.post("/queries", isAuthenticated, isAuthenticated.authorizeRoles("student"), createQuery);
router.get("/queries/mine", isAuthenticated, isAuthenticated.authorizeRoles("student"), listMine);
router.get("/queries/review", teacherOnly, listReview);
router.get("/queries/:queryId", isAuthenticated, getQuery);
router.get("/queries/:queryId/audit", isAuthenticated, queryAudit);
router.post("/queries/:queryId/decision", reviewer, decideQuery);
router.post("/queries/:queryId/reopen", reviewer, reopenQuery);

module.exports = router;
