const mongoose = require("mongoose");
const catchAsyncError = require("../middleware/catchasyncerror");
const ErrorHandler = require("../utils/errorhandler");
const CheckInSession = require("../models/checkInSessionModels");
const CheckInProof = require("../models/checkInProofModels");
const AttendanceRecord = require("../models/attendanceRecordModels");
const Enrollment = require("../models/enrollmentModels");
const { normaliseLocation } = require("../utils/location");
const { isDbReady } = require("../utils/dbReady");
const { writeAudit } = require("../utils/audit");
const { autoPresentUpdate } = require("../utils/attendance");
const {
  STATUS_ACTIVE,
  MAX_KEY_HISTORY,
  advanceSessionState,
  buildPendingState,
  pendingKeyIsFresh,
} = require("../utils/checkInSession");
const {
  buildProofMessage,
  evaluateProof,
  toProofView,
  validateProofPayload,
  verifyProofSignature,
  PROOF_MESSAGE_VERSION,
  PROOF_OUTCOMES,
} = require("../utils/checkInProof");

const SESSION_SELECT =
  "courseClass teacher isDemo status wave key keyIssuedAt keyExpiresAt pendingWave pendingKey pendingKeyIssuedAt pendingKeyExpiresAt autoMarkPresent autoMarkPresentBy autoMarkPresentByEmail";

const sessionNotFound = (next) =>
  next(new ErrorHandler("Check-in session not found", 404));

const asIsoString = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

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

const loadSession = (sessionId) =>
  CheckInSession.findById(sessionId).select(SESSION_SELECT);

/**
 * The next relay signal is returned only to the student that just proved the
 * current or pending wave. It is never included in session discovery, teacher
 * evidence or the proof document itself.
 */
const nextSignalFromSession = (session, now = new Date()) => {
  if (!session || session.status !== STATUS_ACTIVE) return null;
  if (!pendingKeyIsFresh(session, now)) return null;
  return {
    wave: session.pendingWave,
    key: session.pendingKey,
    keyIssuedAt: asIsoString(session.pendingKeyIssuedAt),
    keyExpiresAt: asIsoString(session.pendingKeyExpiresAt),
  };
};

/**
 * Mint the pending key after the current wave has accepted evidence. The
 * conditional filter is the real guard: concurrent provers all receive the
 * same relay key instead of racing to overwrite it.
 */
const ensurePendingSignal = async (sessionId, session, now) => {
  if (!session || session.status !== STATUS_ACTIVE) return null;
  if (pendingKeyIsFresh(session, now)) return nextSignalFromSession(session, now);

  let pending;
  try {
    pending = buildPendingState(session, { now });
  } catch (error) {
    return null;
  }

  const updated = await CheckInSession.findOneAndUpdate(
    {
      _id: sessionId,
      status: STATUS_ACTIVE,
      wave: session.wave,
      key: session.key,
      $or: [
        { pendingKey: null },
        { pendingKeyExpiresAt: null },
        { pendingKeyExpiresAt: { $lte: now } },
        { pendingWave: { $ne: session.wave + 1 } },
      ],
    },
    { $set: pending },
    { new: true, runValidators: true }
  ).select(SESSION_SELECT);

  if (updated) return nextSignalFromSession(updated, now);

  // Another request may have minted the relay key first. Read the winner.
  const fresh = await loadSession(sessionId);
  return nextSignalFromSession(fresh, now);
};

/**
 * Promote the pending key when its own signed proof arrives. The conditional
 * filter allows exactly one promotion per pending pair; the loser rereads the
 * winner's session. The promoted key keeps its original expiry.
 */
const promotePendingSignal = async (sessionId, session, now) => {
  if (!session || session.status !== STATUS_ACTIVE) return session;
  if (!pendingKeyIsFresh(session, now)) return session;

  let advanced;
  try {
    advanced = advanceSessionState(session, { now, preferPending: true });
  } catch (error) {
    return session;
  }
  if (!advanced.promotedFromPending) return session;

  const archived = advanced.keyHistory[advanced.keyHistory.length - 1];
  const updated = await CheckInSession.findOneAndUpdate(
    {
      _id: sessionId,
      status: STATUS_ACTIVE,
      wave: session.wave,
      key: session.key,
      pendingWave: session.pendingWave,
      pendingKey: session.pendingKey,
      pendingKeyExpiresAt: { $gt: now },
    },
    {
      $set: {
        wave: advanced.wave,
        key: advanced.key,
        keyIssuedAt: advanced.keyIssuedAt,
        keyExpiresAt: advanced.keyExpiresAt,
        pendingWave: null,
        pendingKey: null,
        pendingKeyIssuedAt: null,
        pendingKeyExpiresAt: null,
      },
      $push: {
        keyHistory: {
          $each: [archived],
          $slice: -MAX_KEY_HISTORY,
        },
      },
    },
    { new: true, runValidators: true }
  ).select(SESSION_SELECT);

  if (updated) return updated;

  // A concurrent proof promoted first. Its session is authoritative.
  return loadSession(sessionId);
};

/**
 * A duplicate proof is still a success. If it was the pending wave, it may
 * still need to promote the cascade because the first request could have
 * stopped between storing evidence and advancing the session.
 */
const finishDuplicate = async (res, sessionId, proof, now, { studentEmail } = {}) => {
  let current = await loadSession(sessionId);
  if (
    current &&
    current.pendingWave === proof.wave &&
    current.pendingKey === proof.key
  ) {
    current = await promotePendingSignal(sessionId, current, now);
  }
  const next = await ensurePendingSignal(sessionId, current, now);

  // A duplicate does not auto-mark by itself, but the row may already have
  // been decided by the teacher or by an earlier accepted proof. Report that
  // status so the phone does not keep saying "pending" after a retry.
  let attendanceStatus = "pending";
  if (studentEmail && isDbReady()) {
    const record = await AttendanceRecord.findOne({
      session: sessionId,
      studentEmail,
    })
      .select("status")
      .lean();
    attendanceStatus = record?.status || "pending";
  }

  return res.status(200).json({
    success: true,
    recorded: true,
    duplicate: true,
    attendanceDecided: attendanceStatus !== "pending",
    attendanceStatus,
    autoMarked: false,
    proof: toProofView(proof, { duplicate: true }),
    next,
  });
};

/**
 * Record one decoded wave from a student phone and return the server-minted
 * next relay signal.
 *
 * The default remains evidence-only: no score, no ID round, and no attendance
 * status. The one explicit exception is a teacher opting in to auto-present
 * for this session, in which case the first accepted proof marks a still-
 * pending row present. The teacher can always change that decision.
 */
exports.submitProof = catchAsyncError(async (req, res, next) => {
  const parsed = validateProofPayload(req.body);
  if (!parsed.ok) {
    return next(new ErrorHandler(parsed.message, 400));
  }
  const { wave, key, signature } = parsed.payload;
  const attemptLocation = normaliseLocation(req.body?.location, { defaultSource: "browser" });

  if (!mongoose.isValidObjectId(req.params.sessionId)) {
    return sessionNotFound(next);
  }

  const session = await CheckInSession.findById(req.params.sessionId).select(
    SESSION_SELECT
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

  // A pending request never blocks the already-approved browser. Only the
  // approved binding can produce a valid signature, so the new browser cannot
  // submit proof until a teacher approves it. The old phone keeps working while
  // the request waits, which prevents a stale queue row from locking a student
  // out of the whole class.
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

  const now = new Date();
  const existing = await CheckInProof.findOne({
    session: session._id,
    student: req.user._id,
    wave,
  });
  const decision = evaluateProof({ session, proof: existing, wave, key, now });
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
    return finishDuplicate(res, session._id, existing, now, { studentEmail });
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
      ...(attemptLocation ? { location: attemptLocation } : {}),
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
        return finishDuplicate(res, session._id, raced, now, { studentEmail });
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

  // Re-read before advancing. A different phone may have promoted the pending
  // wave while this proof was being stored.
  let current = await loadSession(session._id);
  if (
    current &&
    current.pendingWave === wave &&
    current.pendingKey === key
  ) {
    current = await promotePendingSignal(session._id, current, now);
  }
  const nextSignal = await ensurePendingSignal(session._id, current, now);

  // Keep the durable register in sync while the proof document is still
  // present. The proof itself expires after 24 hours; this counter survives.
  let attendanceStatus = "pending";
  let autoMarked = false;
  if (isDbReady()) {
    await AttendanceRecord.findOneAndUpdate(
      { session: session._id, studentEmail },
      {
        $set: {
          student: req.user._id,
          ...(attemptLocation ? { attemptLocation } : {}),
        },
        $inc: { "evidence.proofCount": 1 },
        $addToSet: { "evidence.waves": wave },
        $min: { "evidence.firstProofAt": proof.createdAt },
        $max: { "evidence.lastProofAt": proof.createdAt },
      },
      { upsert: false }
    ).catch((error) => {
      console.error(`[attendance] proof counter update failed: ${error.message}`);
    });

    // This is the only path where evidence writes a status without a teacher
    // click. It is off by default and exists only when the teacher explicitly
    // enabled auto-present for this session. Manual decisions always win: the
    // update matches only a still-pending row.
    if (session.autoMarkPresent) {
      try {
        const marked = await AttendanceRecord.findOneAndUpdate(
          { session: session._id, studentEmail, status: "pending" },
          autoPresentUpdate({
            markedBy: session.autoMarkPresentBy || session.teacher,
            markedByEmail: session.autoMarkPresentByEmail || "",
            markedAt: now,
          }),
          { new: true }
        )
          .select("status")
          .lean();

        if (marked) {
          autoMarked = true;
          attendanceStatus = "present";
          await writeAudit(req, {
            action: "attendance.marked",
            entityType: "CheckInSession",
            entityId: session._id,
            actor: {
              _id: session.teacher,
              email: session.autoMarkPresentByEmail || "",
              role: "teacher",
            },
            summary: `Auto-marked ${studentEmail} present from signed proof.`,
            metadata: { auto: true, wave, studentEmail },
            isDemo: Boolean(session.isDemo),
          });
        }
      } catch (error) {
        // The proof is already durable. A failed auto-mark must not turn an
        // accepted proof into an error; the teacher can still mark the row.
        console.error(`[attendance] auto-present update failed: ${error.message}`);
      }
    }

    if (!autoMarked) {
      const record = await AttendanceRecord.findOne({
        session: session._id,
        studentEmail,
      })
        .select("status")
        .lean()
        .catch(() => null);
      attendanceStatus = record?.status || "pending";
    }
  }

  res.status(201).json({
    success: true,
    recorded: true,
    duplicate: false,
    attendanceDecided: autoMarked || attendanceStatus !== "pending",
    attendanceStatus,
    autoMarked,
    proof: toProofView(proof),
    next: nextSignal,
  });
});
