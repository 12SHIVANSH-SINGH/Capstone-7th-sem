const express = require("express");
const isAuthenticated = require("../middleware/auth");
const { createRateLimiter } = require("../middleware/rateLimit");
const {
  createSession,
  listSessions,
  getSession,
  closeSession,
  advanceSession,
  listSessionProofs,
  getActiveSessionForStudent,
  listActiveSessionsForStudent,
} = require("../controllers/checkInSessionController");
const { submitProof } = require("../controllers/checkInProofController");

const router = express.Router();

const teacherOnly = [isAuthenticated, isAuthenticated.authorizeRoles("teacher")];
const studentOnly = [isAuthenticated, isAuthenticated.authorizeRoles("student")];

// Proof retries are cheap to submit but reach Mongo and verify a signature, so
// cap them per student. Mounted after the auth/role guards: anonymous and
// teacher requests still get their 401/403 instead of a 429.
const proofSubmitLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many proof submissions. Wait a minute and try again.",
  keyFor: (req) =>
    req.user?._id ? String(req.user._id) : req.ip || req.socket?.remoteAddress || "unknown",
});

// Session responses contain the current key for the owner and are live state,
// not cacheable documents.
const noStore = (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
};

router
  .route("/classes/:classId/check-in-sessions")
  .get(noStore, teacherOnly, listSessions)
  .post(noStore, teacherOnly, createSession);

// More specific than the session-by-id route below, and kept separate because
// the caller is an enrolled student, not the teacher who owns the class.
router.get(
  "/classes/:classId/check-in-sessions/active",
  noStore,
  studentOnly,
  getActiveSessionForStudent
);

// Discovery for the student shell: all live sessions for the student's own
// active enrollments. The response never contains a key.
router.get(
  "/student/check-in-sessions/active",
  noStore,
  studentOnly,
  listActiveSessionsForStudent
);

// Proof transport only: the server stores what a phone decoded. It does not
// mark attendance or score the student.
router.post(
  "/check-in-sessions/:sessionId/proofs",
  noStore,
  studentOnly,
  proofSubmitLimiter,
  submitProof
);

// Read-only evidence for the owning teacher. No attendance decision is exposed.
router.get(
  "/check-in-sessions/:sessionId/proofs",
  noStore,
  teacherOnly,
  listSessionProofs
);

router.get("/check-in-sessions/:sessionId", noStore, teacherOnly, getSession);
router.post("/check-in-sessions/:sessionId/advance", noStore, teacherOnly, advanceSession);
router.post("/check-in-sessions/:sessionId/close", noStore, teacherOnly, closeSession);

module.exports = router;
// Exposed so tests can exercise the per-user limiter without sending 61 HTTP
// requests; application code must keep using the mounted middleware.
module.exports.proofSubmitLimiter = proofSubmitLimiter;
