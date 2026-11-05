const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("../utils/webauthnServer");
const { isoBase64URL, isoUint8Array } = require("@simplewebauthn/server/helpers");
const catchAsyncError = require("../middleware/catchasyncerror");
const ErrorHandler = require("../utils/errorhandler");
const AdminPasskey = require("../models/adminPasskeyModels");
const WebAuthnChallenge = require("../models/webauthnChallengeModels");
const { writeAudit } = require("../utils/audit");
const { webauthnConfig } = require("../utils/webauthn");
const {
  STEP_UP_MAX_AGE_SECONDS,
  setStepUpCookie,
  signStepUpToken,
  stepUpState,
} = require("../utils/adminStepUp");

const CHALLENGE_MS = 5 * 60 * 1000;

const safePasskey = (passkey) => ({
  id: String(passkey._id),
  deviceType: passkey.deviceType || "unknown",
  backedUp: Boolean(passkey.backedUp),
  transports: Array.isArray(passkey.transports) ? passkey.transports : [],
  createdAt: passkey.createdAt ? new Date(passkey.createdAt).toISOString() : null,
  lastUsedAt: passkey.lastUsedAt ? new Date(passkey.lastUsedAt).toISOString() : null,
});

const passkeySummary = async (userId) => {
  const passkeys = await AdminPasskey.find({ user: userId })
    .sort({ createdAt: 1 })
    .lean();
  return {
    enrolled: passkeys.length > 0,
    count: passkeys.length,
    passkeys: passkeys.map(safePasskey),
  };
};

const configOrNext = (next) => {
  const config = webauthnConfig();
  if (!config.origins.length || !config.rpID) {
    next(
      new ErrorHandler(
        "Passkey origin is not configured. Set WEBAUTHN_ORIGINS or deploy behind HTTPS on Render.",
        503
      )
    );
    return null;
  }
  return config;
};

const storeChallenge = async (user, kind, challenge) => {
  await WebAuthnChallenge.deleteMany({ user, kind });
  await WebAuthnChallenge.create({
    user,
    kind,
    challenge,
    expiresAt: new Date(Date.now() + CHALLENGE_MS),
  });
};

const takeChallenge = async (user, kind) => {
  const record = await WebAuthnChallenge.findOneAndDelete({
    user,
    kind,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
  return record?.challenge || "";
};

const requireStepUpForAdditionalPasskey = (req, res, existingCount) => {
  if (existingCount === 0) return true;
  const state = stepUpState(req);
  if (state.ok) return true;
  res.status(428).json({
    success: false,
    code: "step_up_required",
    message: "Approve adding another passkey with an existing passkey.",
    reason: state.reason,
  });
  return false;
};

const webauthnBadRequest = (next, error, fallback) => {
  const message = error?.name === "SimpleWebAuthnError" || error?.message
    ? `${fallback}: ${error.message}`
    : fallback;
  return next(new ErrorHandler(message, 400));
};

exports.status = catchAsyncError(async (req, res) => {
  const summary = await passkeySummary(req.user._id);
  const state = stepUpState(req);
  res.status(200).json({
    success: true,
    ...summary,
    stepUp: state.ok,
    stepUpExpiresIn: STEP_UP_MAX_AGE_SECONDS,
  });
});

exports.registrationOptions = catchAsyncError(async (req, res, next) => {
  const config = configOrNext(next);
  if (!config) return;

  const existing = await AdminPasskey.find({ user: req.user._id }).lean();
  if (!requireStepUpForAdditionalPasskey(req, res, existing.length)) return;

  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userID: isoUint8Array.fromUTF8String(String(req.user._id)),
    userName: req.user.email,
    userDisplayName: req.user.name || req.user.email,
    attestationType: "none",
    excludeCredentials: existing.map((passkey) => ({
      id: passkey.credentialId,
      transports: passkey.transports || [],
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
    },
  });

  await storeChallenge(req.user._id, "registration", options.challenge);
  res.status(200).json({ success: true, options });
});

exports.verifyRegistration = catchAsyncError(async (req, res, next) => {
  const config = configOrNext(next);
  if (!config) return;

  const existing = await AdminPasskey.find({ user: req.user._id }).lean();
  if (!requireStepUpForAdditionalPasskey(req, res, existing.length)) return;

  const response = req.body?.response;
  if (!response || typeof response !== "object") {
    return next(new ErrorHandler("A passkey registration response is required.", 400));
  }

  const challenge = await takeChallenge(req.user._id, "registration");
  if (!challenge) {
    return next(new ErrorHandler("The passkey challenge expired. Try again.", 400));
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: config.origins,
      expectedRPID: config.rpID,
      requireUserVerification: true,
    });
  } catch (error) {
    return webauthnBadRequest(next, error, "Could not verify this passkey");
  }

  if (!verification.verified || !verification.registrationInfo) {
    return next(new ErrorHandler("Passkey verification failed. Try again.", 400));
  }

  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;

  const duplicate = await AdminPasskey.exists({ credentialId: credential.id });
  if (duplicate) {
    return next(new ErrorHandler("This passkey is already registered.", 409));
  }

  const passkey = await AdminPasskey.create({
    user: req.user._id,
    credentialId: credential.id,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter || 0,
    transports: Array.isArray(credential.transports) ? credential.transports : [],
    deviceType: credentialDeviceType,
    backedUp: Boolean(credentialBackedUp),
  });

  // Registration is itself a fresh user-verified WebAuthn ceremony, so it
  // also starts the five-minute step-up window.
  setStepUpCookie(res, signStepUpToken(req.user));

  await writeAudit(req, {
    action: "admin.webauthn.registered",
    entityType: "User",
    entityId: req.user._id,
    summary: "Registered a super-admin passkey.",
    metadata: {
      passkeyId: String(passkey._id),
      deviceType: credentialDeviceType,
      backedUp: Boolean(credentialBackedUp),
    },
  });

  res.status(201).json({
    success: true,
    passkey: safePasskey(passkey),
    ...(await passkeySummary(req.user._id)),
    stepUp: true,
  });
});

exports.stepUpOptions = catchAsyncError(async (req, res, next) => {
  const config = configOrNext(next);
  if (!config) return;

  const passkeys = await AdminPasskey.find({ user: req.user._id }).lean();
  if (passkeys.length === 0) {
    return res.status(409).json({
      success: false,
      code: "passkey_not_enrolled",
      message: "Register a passkey in Security before approving destructive actions.",
    });
  }

  const options = await generateAuthenticationOptions({
    rpID: config.rpID,
    allowCredentials: passkeys.map((passkey) => ({
      id: passkey.credentialId,
      transports: passkey.transports || [],
    })),
    userVerification: "required",
  });

  await storeChallenge(req.user._id, "authentication", options.challenge);
  res.status(200).json({ success: true, options });
});

exports.verifyStepUp = catchAsyncError(async (req, res, next) => {
  const config = configOrNext(next);
  if (!config) return;

  const response = req.body?.response;
  if (!response || typeof response !== "object" || !response.id) {
    return next(new ErrorHandler("A passkey assertion response is required.", 400));
  }

  const challenge = await takeChallenge(req.user._id, "authentication");
  if (!challenge) {
    return next(new ErrorHandler("The passkey challenge expired. Try again.", 400));
  }

  const passkey = await AdminPasskey.findOne({
    user: req.user._id,
    credentialId: String(response.id),
  });
  if (!passkey) {
    return next(new ErrorHandler("This passkey is not registered to your account.", 400));
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: config.origins,
      expectedRPID: config.rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: isoBase64URL.toBuffer(passkey.publicKey),
        counter: passkey.counter || 0,
        transports: passkey.transports || [],
      },
      requireUserVerification: true,
    });
  } catch (error) {
    return webauthnBadRequest(next, error, "Could not verify this passkey");
  }

  if (!verification.verified) {
    return next(new ErrorHandler("Passkey verification failed. Try again.", 400));
  }

  passkey.counter = verification.authenticationInfo.newCounter;
  passkey.lastUsedAt = new Date();
  passkey.deviceType =
    verification.authenticationInfo.credentialDeviceType || passkey.deviceType;
  passkey.backedUp = Boolean(verification.authenticationInfo.credentialBackedUp);
  await passkey.save();

  setStepUpCookie(res, signStepUpToken(req.user));

  await writeAudit(req, {
    action: "admin.webauthn.step_up",
    entityType: "User",
    entityId: req.user._id,
    summary: "Approved a destructive admin action with a passkey.",
    metadata: { passkeyId: String(passkey._id) },
  });

  res.status(200).json({
    success: true,
    stepUp: true,
    expiresIn: STEP_UP_MAX_AGE_SECONDS,
  });
});
