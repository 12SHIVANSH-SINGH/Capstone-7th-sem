const mongoose = require("mongoose");
const catchAsyncError = require("../middleware/catchasyncerror");
const ErrorHandler = require("../utils/errorhandler");
const CourseClass = require("../models/classModels");
const Enrollment = require("../models/enrollmentModels");
const CheckInSession = require("../models/checkInSessionModels");
const CheckInProof = require("../models/checkInProofModels");
const {
  STATUS_ACTIVE,
  MAX_KEY_HISTORY,
  buildInitialSession,
  closeSessionState,
  advanceSessionState,
  toStudentSession,
  toTeacherSession,
} = require("../utils/checkInSession");
const { toTeacherProofView } = require("../utils/checkInProof");

const SESSION_POPULATE = [
  { path: "courseClass", select: "courseCode title section" },
  { path: "room", select: "roomNo" },
];

const getOwnedClass = async (classId, teacherId, next) => {
  if (!mongoose.isValidObjectId(classId)) {
    next(new ErrorHandler("Class not found", 404));
    return null;
  }

  const courseClass = await CourseClass.findOne({ _id: classId, teacher: teacherId });
  if (!courseClass) {
    next(new ErrorHandler("Class not found", 404));
    return null;
  }
  return courseClass;
};

const getOwnedSession = async (sessionId, teacherId, next) => {
  if (!mongoose.isValidObjectId(sessionId)) {
    next(new ErrorHandler("Check-in session not found", 404));
    return null;
  }

  const session = await CheckInSession.findOne({ _id: sessionId, teacher: teacherId })
    .populate(SESSION_POPULATE);
  if (!session) {
    next(new ErrorHandler("Check-in session not found", 404));
    return null;
  }
  return session;
};

const activeSessionConflict = (next) =>
  next(
    new ErrorHandler(
      "This class already has an active check-in session. Close it before starting another.",
      409
    )
  );

exports.createSession = catchAsyncError(async (req, res, next) => {
  const courseClass = await getOwnedClass(req.params.classId, req.user._id, next);
  if (!courseClass) return;

  if (!courseClass.defaultRoom) {
    return next(new ErrorHandler("This class has no default room. Set a room before starting a check-in.", 409));
  }

  const existing = await CheckInSession.findOne({
    courseClass: courseClass._id,
    status: STATUS_ACTIVE,
  }).select("_id");
  if (existing) return activeSessionConflict(next);

  let session;
  try {
    session = await CheckInSession.create({
      courseClass: courseClass._id,
      teacher: req.user._id,
      room: courseClass.defaultRoom,
      ...buildInitialSession(),
    });
  } catch (error) {
    // Two rapid taps can pass the check above at the same time. The partial
    // unique index is the real guard, so translate its duplicate into the same
    // friendly conflict instead of a generic 400.
    if (error?.code === 11000) return activeSessionConflict(next);
    throw error;
  }

  await session.populate(SESSION_POPULATE);
  res.status(201).json({ success: true, session: toTeacherSession(session) });
});

exports.listSessions = catchAsyncError(async (req, res, next) => {
  const courseClass = await getOwnedClass(req.params.classId, req.user._id, next);
  if (!courseClass) return;

  // The prototype has no pagination UI yet. Fifty sessions is far more history
  // than one class needs for a semester demo, and keeps the response bounded.
  const sessions = await CheckInSession.find({ courseClass: courseClass._id })
    .populate(SESSION_POPULATE)
    .sort({ startedAt: -1 })
    .limit(50);

  res.status(200).json({
    success: true,
    sessions: sessions.map((session) => toTeacherSession(session)),
  });
});

exports.getSession = catchAsyncError(async (req, res, next) => {
  const session = await getOwnedSession(req.params.sessionId, req.user._id, next);
  if (!session) return;

  res.status(200).json({ success: true, session: toTeacherSession(session) });
});

exports.closeSession = catchAsyncError(async (req, res, next) => {
  const session = await getOwnedSession(req.params.sessionId, req.user._id, next);
  if (!session) return;

  // Closing twice is harmless: return the same closed session, keeping the
  // first closedAt value. A retry after a dropped response must not fail.
  if (session.status === STATUS_ACTIVE) {
    const closed = closeSessionState(session);
    session.status = closed.status;
    session.closedAt = closed.closedAt;
    await session.save();
  }

  res.status(200).json({ success: true, session: toTeacherSession(session) });
});

/**
 * Advance to the next wave only after the current wave has at least one
 * accepted proof. This keeps wave numbers tied to real acoustic progress and
 * stops a teacher from skipping waves by tapping repeatedly.
 *
 * The update is matched on the wave the request read. Two concurrent taps mint
 * two keys, but only one can win; the loser gets a clear conflict instead of
 * silently overwriting the winner.
 */
exports.advanceSession = catchAsyncError(async (req, res, next) => {
  const session = await getOwnedSession(req.params.sessionId, req.user._id, next);
  if (!session) return;

  if (session.status !== STATUS_ACTIVE) {
    return next(new ErrorHandler("This check-in session is closed.", 409));
  }

  const evidence = await CheckInProof.exists({
    session: session._id,
    wave: session.wave,
  });
  if (!evidence) {
    return next(
      new ErrorHandler(
        "No phone has recorded evidence for this wave yet. Wait for a proof before advancing.",
        409
      )
    );
  }

  let advanced;
  try {
    advanced = advanceSessionState(session);
  } catch (error) {
    return next(new ErrorHandler(error.message, 409));
  }
  const archived = advanced.keyHistory[advanced.keyHistory.length - 1];

  const updated = await CheckInSession.findOneAndUpdate(
    {
      _id: session._id,
      teacher: req.user._id,
      status: STATUS_ACTIVE,
      wave: session.wave,
    },
    {
      $set: {
        wave: advanced.wave,
        key: advanced.key,
        keyIssuedAt: advanced.keyIssuedAt,
        keyExpiresAt: advanced.keyExpiresAt,
      },
      $push: {
        keyHistory: {
          $each: [archived],
          $slice: -MAX_KEY_HISTORY,
        },
      },
    },
    { new: true, runValidators: true }
  ).populate(SESSION_POPULATE);

  if (!updated) {
    return next(
      new ErrorHandler(
        "The session changed before the wave could advance. Refresh and try again.",
        409
      )
    );
  }

  res.status(200).json({ success: true, session: toTeacherSession(updated) });
});

/**
 * Read-only evidence for the teacher who owns the session. This is not a
 * roster roll-call and not a score: it lists which enrolled students submitted
 * which wave, so the teacher can see the transport working during a rehearsal.
 */
exports.listSessionProofs = catchAsyncError(async (req, res, next) => {
  const session = await getOwnedSession(req.params.sessionId, req.user._id, next);
  if (!session) return;

  // A class is at most a few hundred submissions across a rehearsal; 500 is a
  // safety bound, not pagination. No signature, key or device data is selected.
  const proofs = await CheckInProof.find({ session: session._id })
    .select("studentEmail wave createdAt")
    .sort({ createdAt: 1 })
    .limit(500);

  const waveCounts = new Map();
  for (const proof of proofs) {
    waveCounts.set(proof.wave, (waveCounts.get(proof.wave) || 0) + 1);
  }
  const byWave = [...waveCounts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([wave, count]) => ({ wave, count }));

  res.status(200).json({
    success: true,
    sessionId: String(session._id),
    attendanceDecided: false,
    total: proofs.length,
    byWave,
    proofs: proofs.map(toTeacherProofView),
  });
});

exports.getActiveSessionForStudent = catchAsyncError(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.classId)) {
    return next(new ErrorHandler("Class not found", 404));
  }

  const courseClass = await CourseClass.findById(req.params.classId).select("_id");
  if (!courseClass) {
    return next(new ErrorHandler("Class not found", 404));
  }

  const enrolled = await Enrollment.exists({
    class: courseClass._id,
    email: req.user.email,
    status: "active",
  });
  if (!enrolled) {
    return next(new ErrorHandler("You are not on this class roster", 403));
  }

  const session = await CheckInSession.findOne({
    courseClass: courseClass._id,
    status: STATUS_ACTIVE,
  }).populate(SESSION_POPULATE);

  // No active check-in is an ordinary state while a student waits for the
  // teacher to start, not a 404 error.
  res.status(200).json({
    success: true,
    session: session ? toStudentSession(session) : null,
  });
});

/**
 * Active sessions across every class this student is enrolled in.
 *
 * The student check-in shell needs one call to discover whether anything is
 * live, without first knowing the class id. Only the student's own active
 * enrollments are considered, and the response uses the student view, so it
 * never contains a key.
 */
exports.listActiveSessionsForStudent = catchAsyncError(async (req, res) => {
  const email = String(req.user.email || "").trim().toLowerCase();
  const classIds = await Enrollment.distinct("class", { email, status: "active" });
  const validClassIds = classIds.filter((classId) => mongoose.isValidObjectId(classId));

  if (validClassIds.length === 0) {
    return res.status(200).json({ success: true, sessions: [] });
  }

  const sessions = await CheckInSession.find({
    courseClass: { $in: validClassIds },
    status: STATUS_ACTIVE,
  })
    .populate(SESSION_POPULATE)
    .sort({ startedAt: -1 })
    .limit(20);

  res.status(200).json({
    success: true,
    sessions: sessions.map((session) => toStudentSession(session)),
  });
});
