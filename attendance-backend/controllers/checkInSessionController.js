const mongoose = require("mongoose");
const catchAsyncError = require("../middleware/catchasyncerror");
const ErrorHandler = require("../utils/errorhandler");
const CourseClass = require("../models/classModels");
const Enrollment = require("../models/enrollmentModels");
const CheckInSession = require("../models/checkInSessionModels");
const CheckInProof = require("../models/checkInProofModels");
const AttendanceRecord = require("../models/attendanceRecordModels");
const AttendanceQuery = require("../models/attendanceQueryModels");
const { Room } = require("../models/roomModels");
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
const { normaliseLocation } = require("../utils/location");
const { getSettings } = require("../utils/settings");
const {
  snapshotRosterAttendance,
  sessionClassSnapshot,
  queryWindowEnd,
  summariseRecords,
  expireStaleQueries,
} = require("../utils/attendance");
const { writeAudit } = require("../utils/audit");
const { createNotifications } = require("../utils/notifications");
const { isDbReady } = require("../utils/dbReady");

const SESSION_POPULATE = [
  { path: "courseClass", select: "courseCode title section teacher" },
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

/**
 * Batch attendance counts for the session list. The register is the source of
 * truth; this only decorates the teacher's session cards.
 */
const attendanceSummaries = async (sessionIds = []) => {
  if (!sessionIds.length || !isDbReady()) return new Map();
  const rows = await AttendanceRecord.aggregate([
    { $match: { session: { $in: sessionIds } } },
    { $group: { _id: { session: "$session", status: "$status" }, count: { $sum: 1 } } },
  ]);
  const bySession = new Map();
  for (const row of rows) {
    const key = String(row._id.session);
    if (!bySession.has(key)) {
      bySession.set(key, { total: 0, present: 0, absent: 0, pending: 0, excused: 0 });
    }
    const summary = bySession.get(key);
    summary.total += row.count;
    if (row._id.status === "present") summary.present += row.count;
    else if (row._id.status === "absent") summary.absent += row.count;
    else if (row._id.status === "excused") summary.excused += row.count;
    else summary.pending += row.count;
  }
  for (const summary of bySession.values()) {
    const decided = summary.present + summary.absent;
    summary.decided = decided;
    summary.percentage = decided > 0 ? Math.round((summary.present / decided) * 1000) / 10 : null;
  }
  return bySession;
};

const withSummary = (session, summary) => ({
  ...toTeacherSession(session),
  attendanceSummary: summary || { total: 0, present: 0, absent: 0, pending: 0, percentage: null },
});

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

  const teacherLocation = normaliseLocation(req.body?.teacherLocation, {
    defaultSource: "teacher-session",
  });
  const room = isDbReady()
    ? await Room.findById(courseClass.defaultRoom).select("roomNo")
    : { roomNo: courseClass.defaultRoom?.roomNo || "" };

  let session;
  try {
    session = await CheckInSession.create({
      courseClass: courseClass._id,
      teacher: req.user._id,
      room: courseClass.defaultRoom,
      ...buildInitialSession(),
      teacherLocation,
      classSnapshot: sessionClassSnapshot(courseClass, room),
      isDemo: Boolean(req.user.isDemo || courseClass.isDemo),
    });
  } catch (error) {
    // Two rapid taps can pass the check above at the same time. The partial
    // unique index is the real guard, so translate its duplicate into the same
    // friendly conflict instead of a generic 400.
    if (error?.code === 11000) return activeSessionConflict(next);
    throw error;
  }

  // Snapshot the roster before returning. If this fails the session still
  // exists, but the error is surfaced so the teacher can retry; the snapshot
  // operation is idempotent.
  const snapshot = await snapshotRosterAttendance({
    session,
    courseClass,
    room,
    teacherLocation,
    isDemo: Boolean(session.isDemo),
  });

  session.rosterCount = snapshot.count;
  if (isDbReady() && typeof session.save === "function") {
    await session.save();
  }
  await session.populate(SESSION_POPULATE);

  const enrolledUsers = isDbReady()
    ? await Enrollment.find({
        class: courseClass._id,
        status: "active",
        student: { $ne: null },
      })
        .select("student")
        .lean()
    : [];
  await createNotifications(
    enrolledUsers.map((entry) => ({
      user: entry.student,
      type: "session.started",
      title: "Check-in started",
      message: `${courseClass.courseCode}${courseClass.section ? ` · ${courseClass.section}` : ""} check-in is live. Open Check-in and listen for the current wave.`,
      link: "/student/check-in",
      isDemo: Boolean(session.isDemo),
    }))
  );

  await writeAudit(req, {
    action: "session.created",
    entityType: "CheckInSession",
    entityId: session._id,
    summary: `Started check-in for ${courseClass.courseCode}.`,
    metadata: {
      teacherLocationCaptured: Boolean(teacherLocation),
      rosterCount: snapshot.count,
    },
    isDemo: session.isDemo,
  });

  res.status(201).json({
    success: true,
    session: {
      ...withSummary(session),
      teacherLocation: toTeacherSession(session).teacherLocation,
    },
  });
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

  const summaries = await attendanceSummaries(sessions.map((session) => session._id));
  res.status(200).json({
    success: true,
    sessions: sessions.map((session) =>
      withSummary(session, summaries.get(String(session._id)))
    ),
  });
});

exports.getSession = catchAsyncError(async (req, res, next) => {
  const session = await getOwnedSession(req.params.sessionId, req.user._id, next);
  if (!session) return;

  const summaries = await attendanceSummaries([session._id]);
  res.status(200).json({
    success: true,
    session: withSummary(session, summaries.get(String(session._id))),
  });
});

exports.closeSession = catchAsyncError(async (req, res, next) => {
  const session = await getOwnedSession(req.params.sessionId, req.user._id, next);
  if (!session) return;

  // Closing twice is harmless: return the same closed session, keeping the
  // first closedAt value. A retry after a dropped response must not fail.
  if (session.status === STATUS_ACTIVE) {
    const closed = closeSessionState(session);
    const settings = await getSettings();
    session.status = closed.status;
    session.closedAt = closed.closedAt;
    session.queryWindowEndsAt = queryWindowEnd(session.closedAt, settings);
    await session.save();

    const records = isDbReady()
      ? await AttendanceRecord.find({ session: session._id })
          .select("student studentEmail status")
          .lean()
      : [];
    const studentIds = records.map((record) => record.student).filter(Boolean);
    await createNotifications(
      studentIds.map((user) => ({
        user,
        type: "session.closed",
        title: "Check-in closed",
        message: `${session.classSnapshot?.courseCode || "Your class"} check-in has closed. If you were present but unmarked, you can raise a query for 24 hours.`,
        link: "/queries",
        isDemo: Boolean(session.isDemo),
      }))
    );

    await writeAudit(req, {
      action: "session.closed",
      entityType: "CheckInSession",
      entityId: session._id,
      summary: `Closed check-in for ${session.classSnapshot?.courseCode || "a class"}.`,
      metadata: {
        queryWindowEndsAt: session.queryWindowEndsAt,
        finalised: session.attendanceFinalized,
      },
      isDemo: session.isDemo,
    });
  }

  const summaries = await attendanceSummaries([session._id]);
  res.status(200).json({
    success: true,
    session: withSummary(session, summaries.get(String(session._id))),
  });
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

  await writeAudit(req, {
    action: "session.advanced",
    entityType: "CheckInSession",
    entityId: updated._id,
    summary: `Advanced check-in from wave ${session.wave} to wave ${updated.wave}.`,
    isDemo: updated.isDemo,
  });

  const summaries = await attendanceSummaries([updated._id]);
  res.status(200).json({
    success: true,
    session: withSummary(updated, summaries.get(String(updated._id))),
  });
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
    attendanceDecided: Boolean(session.attendanceFinalized),
    total: proofs.length,
    byWave,
    proofs: proofs.map(toTeacherProofView),
  });
});

exports.getActiveSessionForStudent = catchAsyncError(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.classId)) {
    return next(new ErrorHandler("Class not found", 404));
  }

  const courseClass = await CourseClass.findById(req.params.classId).select("_id isDemo");
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

/**
 * Student check-in location. This stores the attempt location on the roster
 * row for the current session. It is optional: a denied permission must not
 * stop a student from listening to the key.
 */
exports.recordAttemptLocation = catchAsyncError(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.sessionId)) {
    return next(new ErrorHandler("Check-in session not found", 404));
  }

  const location = normaliseLocation(req.body?.location, { defaultSource: "browser" });
  if (!location) {
    return next(new ErrorHandler("A valid latitude and longitude are required.", 400));
  }

  const session = await CheckInSession.findById(req.params.sessionId).select(
    "courseClass status isDemo"
  );
  if (!session) return next(new ErrorHandler("Check-in session not found", 404));

  const email = String(req.user.email || "").trim().toLowerCase();
  const record = await AttendanceRecord.findOneAndUpdate(
    { session: session._id, studentEmail: email },
    { $set: { attemptLocation: location, student: req.user._id } },
    { new: true }
  );
  if (!record) {
    return next(new ErrorHandler("You are not on this class roster", 403));
  }

  res.status(200).json({
    success: true,
    location: location,
    recordedAt: record.updatedAt,
  });
});

/**
 * A teacher can see the queries attached to one of their sessions even after
 * the generic query list has moved on.
 */
exports.listSessionQueries = catchAsyncError(async (req, res, next) => {
  const session = await getOwnedSession(req.params.sessionId, req.user._id, next);
  if (!session) return;
  await expireStaleQueries();
  const queries = await AttendanceQuery.find({ session: session._id })
    .sort({ createdAt: -1 })
    .limit(200);
  res.status(200).json({ success: true, queries });
});
