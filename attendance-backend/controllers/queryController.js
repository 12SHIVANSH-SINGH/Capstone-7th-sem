const mongoose = require("mongoose");
const catchAsyncError = require("../middleware/catchasyncerror");
const ErrorHandler = require("../utils/errorhandler");
const AttendanceQuery = require("../models/attendanceQueryModels");
const AttendanceRecord = require("../models/attendanceRecordModels");
const CheckInSession = require("../models/checkInSessionModels");
const CourseClass = require("../models/classModels");
const Enrollment = require("../models/enrollmentModels");
const { STATUS_CLOSED } = require("../utils/checkInSession");
const { normaliseLocation, distanceMeters, locationView } = require("../utils/location");
const { getSettings } = require("../utils/settings");
const { queryWindowEnd, expireStaleQueries, sessionClassSnapshot } = require("../utils/attendance");
const { writeAudit, toAuditView } = require("../utils/audit");
const { createNotification } = require("../utils/notifications");

const iso = (value) => (value ? new Date(value).toISOString() : null);

const queryView = (query, { includeLocations = true } = {}) => ({
  id: String(query._id),
  session: query.session ? String(query.session._id || query.session) : null,
  courseClass: query.courseClass ? String(query.courseClass._id || query.courseClass) : null,
  teacher: query.teacher ? String(query.teacher._id || query.teacher) : null,
  student: query.student ? String(query.student._id || query.student) : null,
  studentEmail: query.studentEmail,
  studentName: query.studentName,
  classSnapshot: query.classSnapshot,
  reason: query.reason,
  status: query.status,
  teacherLocation: includeLocations ? locationView(query.teacherLocation) : null,
  attemptLocation: includeLocations ? locationView(query.attemptLocation) : null,
  studentLocation: includeLocations ? locationView(query.studentLocation) : null,
  locationNote: query.locationNote || "",
  distanceMeters: query.distanceMeters ?? null,
  withinRadius: query.withinRadius ?? null,
  radiusMeters: query.radiusMeters ?? null,
  expiresAt: iso(query.expiresAt),
  decidedAt: iso(query.decidedAt),
  decidedByEmail: query.decidedByEmail || "",
  decisionNote: query.decisionNote || "",
  reopenedAt: iso(query.reopenedAt),
  reopenCount: query.reopenCount || 0,
  expiredAt: iso(query.expiredAt),
  createdAt: iso(query.createdAt),
  updatedAt: iso(query.updatedAt),
  isDemo: Boolean(query.isDemo),
});

const canReview = (user, query) => {
  if (!user || !query) return false;
  if (user.role === "superadmin") return true;
  if (user.role !== "teacher") return false;
  return String(query.teacher._id || query.teacher) === String(user._id);
};

const loadQuery = async (queryId, next) => {
  if (!mongoose.isValidObjectId(queryId)) {
    next(new ErrorHandler("Attendance query not found", 404));
    return null;
  }
  const query = await AttendanceQuery.findById(queryId);
  if (!query) {
    next(new ErrorHandler("Attendance query not found", 404));
    return null;
  }
  return query;
};

exports.createQuery = catchAsyncError(async (req, res, next) => {
  await expireStaleQueries();
  const settings = await getSettings();
  if (!settings.allowStudentQueries) {
    return next(new ErrorHandler("Attendance queries are currently disabled by the administrator.", 403));
  }

  const { sessionId, reason } = req.body || {};
  if (!sessionId || !mongoose.isValidObjectId(sessionId)) {
    return next(new ErrorHandler("A valid check-in session is required.", 400));
  }
  const message = String(reason || "").trim();
  if (message.length < 10) {
    return next(new ErrorHandler("Describe what happened in at least 10 characters.", 400));
  }
  if (message.length > 1000) {
    return next(new ErrorHandler("Keep the query under 1000 characters.", 400));
  }

  const session = await CheckInSession.findById(sessionId)
    .populate("courseClass", "courseCode title section")
    .populate("room", "roomNo");
  if (!session) return next(new ErrorHandler("Check-in session not found", 404));

  const email = String(req.user.email || "").trim().toLowerCase();
  const enrolled = await Enrollment.exists({
    class: session.courseClass?._id || session.courseClass,
    email,
    status: "active",
  });
  if (!enrolled) {
    return next(new ErrorHandler("You are not on this class roster", 403));
  }

  if (session.status !== STATUS_CLOSED) {
    return next(
      new ErrorHandler(
        "The session is still live. Wait for your teacher to close it, then raise a query if you were present but unmarked.",
        409
      )
    );
  }

  const expiresAt =
    session.queryWindowEndsAt || queryWindowEnd(session.closedAt, settings);
  if (new Date(expiresAt).getTime() <= Date.now()) {
    return next(
      new ErrorHandler(
        "The query window for this session has closed. Ask your teacher to reopen an existing query if you already raised one.",
        409
      )
    );
  }

  const existing = await AttendanceQuery.findOne({
    session: session._id,
    studentEmail: email,
  });
  if (existing) {
    return next(
      new ErrorHandler(
        `A query already exists for this session (${existing.status}). Ask your teacher to reopen it if needed.`,
        409
      )
    );
  }

  const record = await AttendanceRecord.findOne({
    session: session._id,
    studentEmail: email,
  });
  if (!record) {
    return next(new ErrorHandler("You are not on this session's attendance roster.", 403));
  }
  if (record.status === "present") {
    return next(new ErrorHandler("You are already marked present for this session.", 409));
  }

  const studentLocation = normaliseLocation(req.body?.studentLocation, {
    defaultSource: "browser",
  });
  if (settings.requireQueryLocation && !studentLocation) {
    return next(
      new ErrorHandler(
        "Location is required for a query. Allow location access in your browser and try again.",
        400
      )
    );
  }

  const attemptLocation = record.attemptLocation || null;
  const teacherLocation = session.teacherLocation || null;
  const referenceLocation = studentLocation || attemptLocation;
  const distance = referenceLocation ? distanceMeters(teacherLocation, referenceLocation) : null;
  const radius = Number(settings.geofenceRadiusMeters) || 30;
  const withinRadius = distance === null ? null : distance <= radius;

  const locationNote = String(req.body?.locationNote || "").slice(0, 300);
  const classSnapshot =
    session.classSnapshot?.courseCode
      ? session.classSnapshot
      : sessionClassSnapshot(session.courseClass, session.room);

  const query = await AttendanceQuery.create({
    session: session._id,
    courseClass: session.courseClass?._id || session.courseClass,
    teacher: session.teacher,
    student: req.user._id,
    attendance: record._id,
    studentEmail: email,
    studentName: record.studentName,
    classSnapshot,
    reason: message,
    teacherLocation,
    attemptLocation,
    studentLocation: studentLocation || attemptLocation,
    locationNote,
    distanceMeters: distance,
    withinRadius,
    radiusMeters: radius,
    expiresAt,
    isDemo: Boolean(req.user.isDemo || session.isDemo || record.isDemo),
  });

  record.query = query._id;
  await record.save();

  await writeAudit(req, {
    action: "query.created",
    entityType: "AttendanceQuery",
    entityId: query._id,
    summary: `Attendance query raised for ${classSnapshot.courseCode || "a session"}.`,
    metadata: {
      session: String(session._id),
      hasStudentLocation: Boolean(studentLocation),
      distanceMeters: distance,
      withinRadius,
    },
    isDemo: query.isDemo,
  });

  await createNotification({
    user: session.teacher,
    type: "query.created",
    title: "New attendance query",
    message: `${record.studentName || email} raised a query for ${classSnapshot.courseCode || "a class"}. Review the location evidence and decide.`,
    link: "/queries",
    data: { queryId: String(query._id) },
    isDemo: query.isDemo,
  });

  res.status(201).json({ success: true, query: queryView(query) });
});

exports.listMine = catchAsyncError(async (req, res, next) => {
  await expireStaleQueries();
  const queries = await AttendanceQuery.find({ student: req.user._id })
    .sort({ createdAt: -1 })
    .limit(200);
  res.status(200).json({ success: true, queries: queries.map((query) => queryView(query)) });
});

exports.listReview = catchAsyncError(async (req, res, next) => {
  await expireStaleQueries();
  const filter = { teacher: req.user._id };
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.classId && mongoose.isValidObjectId(req.query.classId)) {
    filter.courseClass = req.query.classId;
  }
  if (req.query.sessionId && mongoose.isValidObjectId(req.query.sessionId)) {
    filter.session = req.query.sessionId;
  }
  const queries = await AttendanceQuery.find(filter)
    .sort({ status: 1, createdAt: -1 })
    .limit(300);
  res.status(200).json({
    success: true,
    queries: queries.map((query) => queryView(query)),
    counts: queries.reduce(
      (accumulator, query) => ({
        ...accumulator,
        [query.status]: (accumulator[query.status] || 0) + 1,
      }),
      { pending: 0, approved: 0, rejected: 0, expired: 0 }
    ),
  });
});

exports.listAll = catchAsyncError(async (req, res, next) => {
  await expireStaleQueries();
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.teacherId && mongoose.isValidObjectId(req.query.teacherId)) {
    filter.teacher = req.query.teacherId;
  }
  if (req.query.classId && mongoose.isValidObjectId(req.query.classId)) {
    filter.courseClass = req.query.classId;
  }
  const queries = await AttendanceQuery.find(filter).sort({ createdAt: -1 }).limit(500);
  res.status(200).json({ success: true, queries: queries.map((query) => queryView(query)) });
});

exports.getQuery = catchAsyncError(async (req, res, next) => {
  const query = await loadQuery(req.params.queryId, next);
  if (!query) return;

  const user = req.user;
  const isOwnerStudent = String(query.student) === String(user._id);
  if (user.role !== "superadmin" && !isOwnerStudent && !canReview(user, query)) {
    return next(new ErrorHandler("You do not have permission to view this query.", 403));
  }

  const audit = await require("../models/auditLogModels")
    .find({ entityType: "AttendanceQuery", entityId: String(query._id) })
    .sort({ createdAt: -1 })
    .limit(30)
    .lean();

  res.status(200).json({
    success: true,
    query: queryView(query),
    audit: audit.map(toAuditView),
  });
});

/**
 * A teacher's decision updates the durable attendance register. Approving a
 * query makes the student present with source "query"; the audit entry keeps
 * the original student reason and the teacher's note together.
 */
exports.decideQuery = catchAsyncError(async (req, res, next) => {
  await expireStaleQueries();
  const query = await loadQuery(req.params.queryId, next);
  if (!query) return;

  if (!canReview(req.user, query)) {
    return next(new ErrorHandler("You do not have permission to decide this query.", 403));
  }

  const decision = String(req.body?.decision || "").toLowerCase();
  if (!["approved", "rejected"].includes(decision)) {
    return next(new ErrorHandler("Decision must be approved or rejected.", 400));
  }
  if (query.status === "approved" || query.status === "rejected") {
    return next(new ErrorHandler(`This query has already been ${query.status}.`, 409));
  }

  const wasExpired = query.status === "expired";
  const note = String(req.body?.note || "").slice(0, 500);
  const now = new Date();

  query.status = decision;
  query.decidedBy = req.user._id;
  query.decidedByEmail = req.user.email;
  query.decidedAt = now;
  query.decisionNote = note;
  if (wasExpired) query.expiredAt = query.expiredAt || now;
  await query.save();

  let record = await AttendanceRecord.findById(query.attendance);
  if (!record) {
    record = await AttendanceRecord.findOne({
      session: query.session,
      studentEmail: query.studentEmail,
    });
  }
  if (!record) {
    record = await AttendanceRecord.create({
      session: query.session,
      courseClass: query.courseClass,
      teacher: query.teacher,
      student: query.student,
      studentEmail: query.studentEmail,
      studentName: query.studentName,
      classSnapshot: query.classSnapshot,
      status: "absent",
      source: "pending",
      teacherLocation: query.teacherLocation,
      isDemo: query.isDemo,
    });
  }
  if (decision === "approved") {
    record.status = "present";
    record.source = "query";
    record.markedBy = req.user._id;
    record.markedByEmail = req.user.email;
    record.markedAt = now;
    record.decisionNote = note || "Attendance query approved.";
    record.query = query._id;
  } else {
    record.decisionNote = note || "Attendance query rejected.";
    record.query = query._id;
    if (record.status === "present" && record.source === "query") {
      record.status = "absent";
      record.source = "pending";
    }
  }
  await record.save();

  await writeAudit(req, {
    action: decision === "approved" ? "query.approved" : "query.rejected",
    entityType: "AttendanceQuery",
    entityId: query._id,
    summary: `${wasExpired ? "Decided expired query" : "Decided query"} for ${query.studentEmail}: ${decision}.`,
    metadata: {
      note,
      wasExpired,
      studentReason: query.reason,
      attendanceRecord: String(record._id),
    },
    isDemo: query.isDemo,
  });

  await createNotification({
    user: query.student,
    type: decision === "approved" ? "query.approved" : "query.rejected",
    title: decision === "approved" ? "Attendance query approved" : "Attendance query rejected",
    message:
      decision === "approved"
        ? `Your query for ${query.classSnapshot?.courseCode || "a class"} was approved. You are now marked present.`
        : `Your query for ${query.classSnapshot?.courseCode || "a class"} was rejected. ${note || "Contact your teacher if you have more evidence."}`,
    link: "/queries",
    data: { queryId: String(query._id) },
    isDemo: query.isDemo,
  });

  res.status(200).json({
    success: true,
    query: queryView(query),
    attendance: {
      id: String(record._id),
      status: record.status,
      source: record.source,
    },
  });
});

exports.reopenQuery = catchAsyncError(async (req, res, next) => {
  const query = await loadQuery(req.params.queryId, next);
  if (!query) return;
  if (!canReview(req.user, query)) {
    return next(new ErrorHandler("You do not have permission to reopen this query.", 403));
  }
  if (query.status === "pending") {
    return next(new ErrorHandler("This query is already pending.", 409));
  }

  const settings = await getSettings();
  const now = new Date();
  const previousStatus = query.status;
  query.status = "pending";
  query.reopenedAt = now;
  query.reopenedBy = req.user._id;
  query.reopenCount = (query.reopenCount || 0) + 1;
  query.expiresAt = queryWindowEnd(now, settings);
  query.decidedAt = null;
  query.decidedBy = null;
  query.decidedByEmail = "";
  query.decisionNote = String(req.body?.note || "").slice(0, 500);
  await query.save();

  await writeAudit(req, {
    action: "query.reopened",
    entityType: "AttendanceQuery",
    entityId: query._id,
    summary: `Reopened ${previousStatus} query for ${query.studentEmail}.`,
    metadata: {
      previousStatus,
      note: query.decisionNote,
      newExpiresAt: query.expiresAt,
    },
    isDemo: query.isDemo,
  });

  await createNotification({
    user: query.student,
    type: "query.reopened",
    title: "Attendance query reopened",
    message: `Your teacher reopened your query for ${query.classSnapshot?.courseCode || "a class"}. It is pending again.`,
    link: "/queries",
    data: { queryId: String(query._id) },
    isDemo: query.isDemo,
  });

  res.status(200).json({ success: true, query: queryView(query) });
});

exports.queryAudit = catchAsyncError(async (req, res, next) => {
  const query = await loadQuery(req.params.queryId, next);
  if (!query) return;
  const isOwnerStudent = String(query.student) === String(req.user._id);
  if (!isOwnerStudent && !canReview(req.user, query)) {
    return next(new ErrorHandler("You do not have permission to view this query.", 403));
  }
  const AuditLog = require("../models/auditLogModels");
  const logs = await AuditLog.find({
    entityType: "AttendanceQuery",
    entityId: String(query._id),
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  res.status(200).json({ success: true, audit: logs.map(toAuditView) });
});

exports.canReview = canReview;
exports.queryView = queryView;
