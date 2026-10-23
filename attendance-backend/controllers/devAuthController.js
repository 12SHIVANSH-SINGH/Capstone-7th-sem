const catchAsyncError = require("../middleware/catchasyncerror");
const ErrorHandler = require("../utils/errorhandler");
const sendToken = require("../utils/jwttoken");
const User = require("../models/userModels");
const {
  isDevAuthEnabled,
  publicDevAccounts,
  findDevAccount,
} = require("../utils/devAuth");

// Only mounted by app.js when isDevAuthEnabled() is true. Even if this router
// were mounted by mistake, both handlers re-check the gate.
const requireDevMode = (req, res, next) => {
  if (!isDevAuthEnabled()) {
    return next(new ErrorHandler("Not found", 404));
  }
  return next();
};

exports.listDevAccounts = [
  requireDevMode,
  (req, res) => {
    res.status(200).json({ success: true, accounts: publicDevAccounts() });
  },
];

exports.devSignIn = [
  requireDevMode,
  catchAsyncError(async (req, res, next) => {
    const account = findDevAccount(req.body?.key);
    if (!account) {
      return next(new ErrorHandler("Unknown dev identity", 404));
    }

    let user = await User.findOne({ email: account.email });
    if (user && user.authProvider !== "dev") {
      return next(
        new ErrorHandler(
          "This address is already linked to a real sign-in method and cannot be used as a dev identity.",
          409
        )
      );
    }

    if (!user) {
      user = await User.create({
        name: account.name,
        email: account.email,
        role: account.role,
        authProvider: "dev",
      });
    } else {
      user.name = account.name;
      user.role = account.role;
      await user.save();
    }

    sendToken(user, 200, res);
  }),
];
