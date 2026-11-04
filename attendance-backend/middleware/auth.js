const userModels = require("../models/userModels");
const ErrorHandler = require("../utils/errorhandler");
const catchasyncerror = require("./catchasyncerror");
const jwt = require("jsonwebtoken");
const { isSessionAllowed } = require("../utils/signInPolicy");
const { isDevAuthEnabled } = require("../utils/devAuth");

const bearerToken = (req) => {
  const header = String(req.headers?.authorization || "");
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
};

// Normal browsers use the httpOnly cookie. The bearer path is for the future
// mobile client and for API tooling; both resolve to the same user document.
const tokenFromRequest = (req) => req.cookies?.token || bearerToken(req);

const loadSessionUser = async (req, token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: ["HS256"],
  });
  const user = await userModels.findById(decoded.id);
  if (!user) {
    const error = new ErrorHandler("User account no longer exists", 401);
    throw error;
  }
  if (user.status === "disabled") {
    throw new ErrorHandler("This account has been disabled. Contact your administrator.", 401);
  }

  let impersonator = null;
  if (decoded.impersonatorId) {
    impersonator = await userModels.findById(decoded.impersonatorId);
    if (!impersonator || impersonator.role !== "superadmin" || impersonator.status === "disabled") {
      throw new ErrorHandler("The impersonation session is no longer valid.", 401);
    }
    if (!isSessionAllowed(impersonator, { devAuthEnabled: isDevAuthEnabled() })) {
      throw new ErrorHandler("The impersonation session is no longer valid.", 401);
    }
    // The super admin's live grant is the authority for this short session;
    // target eligibility rules (which include a dev-only gate) do not apply to
    // the impersonated account itself.
  } else if (!isSessionAllowed(user, { devAuthEnabled: isDevAuthEnabled() })) {
    throw new ErrorHandler("please login to access it", 401);
  }

  return { user, impersonator, decoded };
};

const isaunthenticated = catchasyncerror(async (req, resp, next) => {
  const token = tokenFromRequest(req);
  if (!token) {
    return next(new ErrorHandler("please login to access it", 401));
  }

  try {
    const session = await loadSessionUser(req, token);
    req.user = session.user;
    req.impersonator = session.impersonator;
    req.impersonating = Boolean(session.impersonator);
    req.authClaims = session.decoded;
    next();
  } catch (error) {
    if (error?.name === "TokenExpiredError") {
      return next(new ErrorHandler("Your session has expired. Please sign in again.", 401));
    }
    if (error?.name === "JsonWebTokenError") {
      return next(new ErrorHandler("Invalid session token. Please sign in again.", 401));
    }
    next(error);
  }
});

const authorizeRoles = (...roles) => (req, resp, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new ErrorHandler("You do not have permission to perform this action", 403));
  }
  next();
};

// Super-admin guard. Kept separate from authorizeRoles so a route can never
// accidentally grant admin power by listing "teacher" only.
const authorizeSuperAdmin = (req, resp, next) => {
  if (req.user?.role !== "superadmin") {
    return next(new ErrorHandler("Super admin access is required for this action", 403));
  }
  next();
};

module.exports = isaunthenticated;
module.exports.authorizeRoles = authorizeRoles;
module.exports.authorizeSuperAdmin = authorizeSuperAdmin;
module.exports.tokenFromRequest = tokenFromRequest;
module.exports.bearerToken = bearerToken;
