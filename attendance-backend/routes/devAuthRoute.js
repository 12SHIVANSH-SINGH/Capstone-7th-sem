const express = require("express");
const { createRateLimiter } = require("../middleware/rateLimit");
const { listDevAccounts, devSignIn } = require("../controllers/devAuthController");

const router = express.Router();

// Generous: two phones signing in repeatedly during a test session. The route
// only exists outside production anyway.
const devSignInLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 60,
  message: "Too many dev sign-ins. Wait a minute and try again.",
});

router.get("/auth/dev/accounts", listDevAccounts);
router.post("/auth/dev/login", devSignInLimiter, devSignIn);

module.exports = router;
