const ErrorHandler = require("../utils/errorhandler");
const { stepUpState } = require("../utils/adminStepUp");

const stepUpRequired = (res, reason) =>
  res.status(428).json({
    success: false,
    code: "step_up_required",
    message: "Approve this action with your passkey.",
    reason,
  });

/**
 * Enforce a recent WebAuthn assertion for a destructive super-admin action.
 * 428 means "the session is valid, but the action needs a fresh passkey
 * approval", which the admin UI turns into a passkey prompt and retry.
 */
const requireAdminStepUp = (req, res, next) => {
  if (!req.user || req.user.role !== "superadmin") {
    return next(new ErrorHandler("Super admin access is required for this action", 403));
  }
  const state = stepUpState(req);
  if (!state.ok) return stepUpRequired(res, state.reason);
  req.adminStepUp = state.claims;
  return next();
};

// Profile-only edits are harmless; role and status changes can disable an
// account or grant teacher powers, so they need the same passkey approval as
// the dedicated destructive routes. The body is already parsed by this point.
const requireAdminStepUpForUserChange = (req, res, next) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const sensitive = ["role", "status"].some((key) =>
    Object.prototype.hasOwnProperty.call(body, key)
  );
  if (!sensitive) return next();
  return requireAdminStepUp(req, res, next);
};

module.exports = { requireAdminStepUp, requireAdminStepUpForUserChange, stepUpRequired };
