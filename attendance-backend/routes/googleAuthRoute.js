const express = require("express");
const isAuthenticated = require("../middleware/auth");
const { createRateLimiter } = require("../middleware/rateLimit");
const {
  googleSignIn,
  claimDeviceBinding,
  getDeviceBindingStatus,
  listDeviceReviews,
  decideDeviceReview,
} = require("../controllers/googleAuthController");

const router = express.Router();

// A Google credential can be replayed cheaply; cap attempts per IP. The
// limiter is per process, which matches the single-render deployment.
const googleSignInLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: "Too many Google sign-in attempts. Wait ten minutes and try again.",
});

router.post("/auth/google", googleSignInLimiter, googleSignIn);
router.post("/device-bindings/claim", isAuthenticated, claimDeviceBinding);
router.get("/device-bindings/status", isAuthenticated, getDeviceBindingStatus);
router.get("/device-reviews", isAuthenticated, isAuthenticated.authorizeRoles("teacher"), listDeviceReviews);
router.post("/device-reviews/:reviewId", isAuthenticated, isAuthenticated.authorizeRoles("teacher"), decideDeviceReview);

module.exports = router;
