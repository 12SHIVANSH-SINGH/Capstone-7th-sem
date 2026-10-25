const mongoose = require("mongoose");
const catchAsyncError = require("../middleware/catchasyncerror");
const ErrorHandler = require("../utils/errorhandler");
const CheckInSession = require("../models/checkInSessionModels");
const CheckInProof = require("../models/checkInProofModels");
const Enrollment = require("../models/enrollmentModels");
const DeviceBindingRequest = require("../models/deviceBindingRequestModels");
const {
  buildProofMessage,
  evaluateProof,
  toProofView,
  validateProofPayload,
  verifyProofSignature,
  PROOF_MESSAGE_VERSION,
  PROOF_OUTCOMES,
} = require("../utils/checkInProof");

const sessionNotFound = (next) =>
  next(new ErrorHandler("Check-in session not found", 404));

// Accepted/duplicate evidence only. Rejections are client errors and are not
// recorded here; never include the email, fingerprint, key or signature.
const logProofOutcome = ({ sessionId, studentId, wave, outcome }) => {
  console.info(
    JSON.stringify({
      event: "check_in_proof",
      sessionId: String(sessionId),
      studentId: String(studentId),
      wave,
      outcome,
    })
  );
};

const duplicateResponse = (res, proof) =>
  res.status(200).json({
    success: true,
    recorded: true,
    duplicate: true,
    attendanceDecided: false,
    proof: toProofView(proof, { duplicate: true }),
  });

/**
 * Record one decoded wave from a student phone.
 *
 * This endpoint stops at evidence. It never marks attendance, never assigns a
 * score and never runs the ID round; those remain gated on the Layer 1 result.
 */
exports.submitProof = catchAsyncError(async (req, res, next) => {
  const parsed = validateProofPayload(req.body);
  if (!parsed.ok) {
    return next(new ErrorHandler(parsed.message, 400));
  }
  const { wave, key, signature } = parsed.payload;

  if (!mongoose.isValidObjectId(req.params.sessionId)) {
    return sessionNotFound(next);
  }

  const session = await CheckInSession.findById(req.params.sessionId).select(
    "courseClass status wave key keyExpiresAt"
  );
  if (!session) return sessionNotFound(next);

  const studentEmail = String(req.user.email || "").trim().toLowerCase();
  const enrolled = await Enrollment.exists({
    class: session.courseClass,
    email: studentEmail,
    status: "active",
  });
  if (!enrolled) {
    return next(new ErrorHandler("You are not on this class roster", 403));
  }

  const binding = req.user.deviceBinding;
  if (!binding?.approvedAt || !binding?.fingerprint || !binding?.publicKeyJwk) {
    return next(
      new ErrorHandler(
        "This browser is not approved for attendance. Sign in again or ask your teacher to approve it.",
        403
      )
    );
  }

  // A pending change means the student is asking to move to another browser.
  // The old binding is still approved, but accepting proofs from it would let
  // the same account keep two devices live while review is outstanding.
  const pendingChange = await DeviceBindingRequest.exists({
    student: req.user._id,
    status: "pending",
  });
  if (pendingChange) {
    return next(
      new ErrorHandler(
        "A device change is awaiting teacher review. This browser cannot submit proofs until it is approved.",
        403
      )
    );
  }

  let message;
  try {
    message = buildProofMessage({
      sessionId: session._id,
      wave,
      key,
      studentId: req.user._id,
    });
  } catch (error) {
    return next(new ErrorHandler("The proof could not be verified.", 400));
  }

  if (!verifyProofSignature({ publicKeyJwk: binding.publicKeyJwk, message, signature })) {
    return next(new ErrorHandler("The proof signature is invalid for this device.", 403));
  }

  const existing = await CheckInProof.findOne({
    session: session._id,
    student: req.user._id,
    wave,
  });
  const decision = evaluateProof({ session, proof: existing, wave, key });
  if (decision.outcome === PROOF_OUTCOMES.REJECT) {
    return next(new ErrorHandler(decision.message, decision.status));
  }
  if (decision.outcome === PROOF_OUTCOMES.DUPLICATE) {
    logProofOutcome({
      sessionId: session._id,
      studentId: req.user._id,
      wave,
      outcome: PROOF_OUTCOMES.DUPLICATE,
    });
    return duplicateResponse(res, existing);
  }

  let proof;
  try {
    proof = await CheckInProof.create({
      session: session._id,
      courseClass: session.courseClass,
      student: req.user._id,
      studentEmail,
      deviceFingerprint: binding.fingerprint,
      wave,
      key,
      signature,
      protocolVersion: PROOF_MESSAGE_VERSION,
    });
  } catch (error) {
    // Two retries can pass the read above at the same time. The unique index is
    // the real guard; a concurrent identical retry is still a success.
    if (error?.code === 11000) {
      const raced = await CheckInProof.findOne({
        session: session._id,
        student: req.user._id,
        wave,
      });
      if (raced && raced.key === key) {
        logProofOutcome({
          sessionId: session._id,
          studentId: req.user._id,
          wave,
          outcome: PROOF_OUTCOMES.DUPLICATE,
        });
        return duplicateResponse(res, raced);
      }
      if (raced) {
        return next(new ErrorHandler("A different proof is already recorded for this wave.", 409));
      }
    }
    throw error;
  }

  logProofOutcome({
    sessionId: session._id,
    studentId: req.user._id,
    wave,
    outcome: PROOF_OUTCOMES.ACCEPT,
  });

  res.status(201).json({
    success: true,
    recorded: true,
    duplicate: false,
    attendanceDecided: false,
    proof: toProofView(proof),
  });
});
