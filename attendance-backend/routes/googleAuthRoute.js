const express = require("express");
const isAuthenticated = require("../middleware/auth");
const {
  googleSignIn,
  claimDeviceBinding,
  getDeviceBindingStatus,
  listDeviceReviews,
  decideDeviceReview,
} = require("../controllers/googleAuthController");

const router = express.Router();

router.post("/auth/google", googleSignIn);
router.post("/device-bindings/claim", isAuthenticated, claimDeviceBinding);
router.get("/device-bindings/status", isAuthenticated, getDeviceBindingStatus);
router.get("/device-reviews", isAuthenticated, isAuthenticated.authorizeRoles("teacher"), listDeviceReviews);
router.post("/device-reviews/:reviewId", isAuthenticated, isAuthenticated.authorizeRoles("teacher"), decideDeviceReview);

module.exports = router;
