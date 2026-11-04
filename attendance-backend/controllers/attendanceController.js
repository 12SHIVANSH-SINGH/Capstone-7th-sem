const mongoose = require("mongoose");
const catchAsyncError = require("../middleware/catchasyncerror");
const ErrorHandler = require("../utils/errorhandler");
const CourseClass = require("../models/classModels");
const Enrollment = require("../models/enrollmentModels");
const CheckInSession = require("../models/checkInSessionModels");
const AttendanceRecord = require("../models/attendanceRecordModels");
const AttendanceQuery = require("../models/attendanceQueryModels");
const AuditLog = require("../models/auditLogModels");
const { STATUS_CLOSED } = require("../utils/checkInSession");
const {
  attendanceRecordView,
  summariseRecords,
  percentage,
  resolveTermRange,
  expireStaleQueries,
  classSnapshotForSession,
} = require("../utils/attendance");
const { distanceMeters, locationView } = require("../utils/location");
const { writeAudit, toAuditView } = require("../utils/audit");
const { getSettings } = require("../utils/settings");
const { createNotifications } = require("../utils/notifications");
const { toTeacherSession } = require("../utils/checkInSession");
const { isDbReady } = require("../utils/dbReady");

const getOwnedClass = async (classId, user, next) => {
  if (!mongoose.isValidObjectId(classId)) {
    next(new ErrorHandler("Class not found", 404));
    return null;
  }
  // A super admin can inspect any class without becoming its owner. The
  // teacher path still scopes every read and write to the signed-in teacher.
  const filter = { _id: classId };
  if (user?.role !== "superadmin") filter.teacher = user?._id || user;
  const courseClass = await CourseClass.findOne(filter).populate("defaultRoom", "roomNo");
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
    .populate("courseClass", "courseCode title section")
    .populate("room", "roomNo");
  if (!session) {
    next(new ErrorHandler("Check-in session not found", 404));
    return null;
  }
  return session;
};

const sessionQueryInfo = async (sessionIds = []) => {
  if (!sessionIds.length) return new Map();
  await expireStaleQueries();
  const queries = await AttendanceQuery.find({ session: { $in: sessionIds } })
    .select("session studentEmail status reason expiresAt decidedAt")
    .lean();
  const map = new Map();
  for (const query of queries) {
    map.set(`${String(query.session)}:${String(query.studentEmail).toLowerCase()}`, {
      id: String(query._id),
      status: query.status,
      reason: query.reason,
      expiresAt: query.expiresAt ? new Date(query.expiresAt).toISOString() : null,
      decidedAt: query.decidedAt ? new Date(query.decidedAt).toISOString() : null,
    });
  }
  return map;
};

const decorateRecord = (record, query) => ({
  ...attendanceRecordView(record),
  query: query || null,
  attemptDistanceMeters:
    record.attemptLocation && record.teacherLocation
      ? distanceMeters(record.teacherLocation, record.attemptLocation)
      : null,
});

const sessionPayload = async (session, { includeRecords = true } = {}) => {
  const settings = await getSettings();
  const records = includeRecords
    ? await AttendanceRecord.find({ session: session._id }).sort({
        "classSnapshot.courseCode": 1,
        rollNumber: 1,
        studentName: 1,
      })
    : [];
  const summary = summariseRecords(records);
  const queries = await sessionQueryInfo([session._id]);
  const queryList = await AttendanceQuery.find({ session: session._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  return {
    session: {
      ...toTeacherSession(session),
      attendanceSummary: summary,
      queryWindowEndsAt: session.queryWindowEndsAt || null,
      geofenceRadiusMeters: settings.geofenceRadiusMeters,
    },
    records: records.map((record) =>
      decorateRecord(record, queries.get(`${String(session._id)}:${record.studentEmail}`))
    ),
    summary,
    queries: queryList.map((query) => ({
      id: String(query._id),
      studentEmail: query.studentEmail,
      studentName: query.studentName,
      status: query.status,
      reason: query.reason,
      createdAt: query.createdAt,
      expiresAt: query.expiresAt,
      decisionNote: query.decisionNote,
      distanceMeters: query.distanceMeters,
      withinRadius: query.withinRadius,
    })),
    settings: {
      queryWindowHours: settings.queryWindowHours,
      geofenceRadiusMeters: settings.geofenceRadiusMeters,
      requireQueryLocation: settings.requireQueryLocation,
    },
  };
};

exports.getSessionAttendance = catchAsyncError(async (req, res, next) => {
  const session = await getOwnedSession(req.params.sessionId, req.user._id, next);
  if (!session) return;

  const payload = await sessionPayload(session);
  res.status(200).json({ success: true, ...payload });
});

const VALID_STATUSES = ["pending", "present", "absent", "excused"];

/**
 * Teacher decision for one or more roster rows. Marking is allowed while the
 * session is live (useful for a manual roll-call) but finalisation waits until
 * the session is closed, so late queries still have room to correct the record.
 */
exports.markAttendance = catchAsyncError(async (req, res, next) => {
  const session = await getOwnedSession(req.params.sessionId, req.user._id, next);
  if (!session) return;

  const entries = Array.isArray(req.body?.records) ? req.body.records : [];
  if (!entries.length) {
    return next(new ErrorHandler("Provide at least one attendance record to update.", 400));
  }
  if (entries.length > 500) {
    return next(new ErrorHandler("Too many records in one request.", 400));
  }

  const records = await AttendanceRecord.find({ session: session._id });
  const byId = new Map(records.map((record) => [String(record._id), record]));
  const byEmail = new Map(records.map((record) => [record.studentEmail, record]));

  const updates = [];
  const auditChanges = [];
  for (const entry of entries) {
    const record = byId.get(String(entry.recordId || "")) ||
      byEmail.get(String(entry.studentEmail || "").toLowerCase());
    if (!record) {
      return next(new ErrorHandler("One of the selected students is not in this session roster.", 404));
    }
    const status = String(entry.status || "").toLowerCase();
    if (!VALID_STATUSES.includes(status)) {
      return next(new ErrorHandler("Attendance status must be pending, present, absent or excused.", 400));
    }
    updates.push({ record, status, note: String(entry.note || "").slice(0, 500) });
    auditChanges.push({
      studentEmail: record.studentEmail,
      from: record.status,
      to: status,
      note: String(entry.note || "").slice(0, 500),
    });
  }

  const now = new Date();
  await AttendanceRecord.bulkWrite(
    updates.map(({ record, status, note }) => ({
      updateOne: {
        filter: { _id: record._id },
        update: {
          $set: {
            status,
            source: status === "pending" ? "pending" : "manual",
            markedBy: req.user._id,
            markedByEmail: req.user.email,
            markedAt: now,
            decisionNote: note,
          },
        },
      },
    }))
  );

  await writeAudit(req, {
    action: "attendance.marked",
    entityType: "CheckInSession",
    entityId: session._id,
    summary: `Marked ${updates.length} attendance record${updates.length === 1 ? "" : "s"}.`,
    metadata: { changes: auditChanges },
    isDemo: session.isDemo,
  });

  const payload = await sessionPayload(session);
  res.status(200).json({ success: true, updated: updates.length, ...payload });
});

exports.finalizeAttendance = catchAsyncError(async (req, res, next) => {
  const session = await getOwnedSession(req.params.sessionId, req.user._id, next);
  if (!session) return;

  if (session.status !== STATUS_CLOSED) {
    return next(new ErrorHandler("Close the check-in session before finalising attendance.", 409));
  }

  const wasFinalized = session.attendanceFinalized;
  const now = new Date();
  const pending = await AttendanceRecord.find({ session: session._id, status: "pending" });
  if (pending.length) {
    await AttendanceRecord.updateMany(
      { session: session._id, status: "pending" },
      {
        $set: {
          status: "absent",
          source: "auto",
          markedBy: req.user._id,
          markedByEmail: req.user.email,
          markedAt: now,
          decisionNote: "Auto-absent when the teacher finalised the session.",
        },
      }
    );
  }

  session.attendanceFinalized = true;
  session.attendanceFinalizedAt = session.attendanceFinalizedAt || now;
  session.attendanceFinalizedBy = session.attendanceFinalizedBy || req.user._id;
  await session.save();

  const records = await AttendanceRecord.find({ session: session._id }).lean();
  const summary = summariseRecords(records);
  const studentIds = records.map((record) => record.student).filter(Boolean);
  await createNotifications(
    studentIds.map((user) => ({
      user,
      type: "attendance.finalized",
      title: "Attendance published",
      message: `${session.classSnapshot?.courseCode || "Your class"} attendance is final. If you were present but unmarked, raise a query before the review window closes.`,
      link: "/queries",
      isDemo: session.isDemo,
    }))
  );

  await writeAudit(req, {
    action: "session.attendance.finalized",
    entityType: "CheckInSession",
    entityId: session._id,
    summary: `${wasFinalized ? "Re-finalised" : "Finalised"} attendance for ${
      session.classSnapshot?.courseCode || "a session"
    } (${summary.present}/${summary.total} present).`,
    metadata: { summary, autoAbsent: pending.length },
    isDemo: session.isDemo,
  });

  const payload = await sessionPayload(session);
  res.status(200).json({ success: true, autoAbsent: pending.length, ...payload });
});

/**
 * Student attendance home. Percentages count decided records only; pending
 * rows are surfaced separately so the student can see that a roll-call is
 * waiting for the teacher instead of silently appearing absent.
 */
exports.myAttendance = catchAsyncError(async (req, res, next) => {
  await expireStaleQueries();
  const email = String(req.user.email || "").trim().toLowerCase();
  const enrollments = await Enrollment.find({ email, status: "active" })
    .populate({ path: "class", select: "courseCode title section teacher defaultRoom", populate: { path: "defaultRoom", select: "roomNo" } })
    .lean();
  const classIds = enrollments.map((entry) => entry.class?._id).filter(Boolean);

  const records = await AttendanceRecord.find({
    studentEmail: email,
    courseClass: { $in: classIds },
  })
    .populate("session", "startedAt closedAt status classSnapshot attendanceFinalized")
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();

  const byClass = new Map();
  for (const enrollment of enrollments) {
    const courseClass = enrollment.class;
    if (!courseClass) continue;
    byClass.set(String(courseClass._id), {
      id: String(courseClass._id),
      courseCode: courseClass.courseCode,
      title: courseClass.title,
      section: courseClass.section,
      roomNo: courseClass.defaultRoom?.roomNo || "",
      present: 0,
      absent: 0,
      pending: 0,
      excused: 0,
      total: 0,
      percentage: null,
      sessions: [],
    });
  }

  for (const record of records) {
    const key = String(record.courseClass);
    if (!byClass.has(key)) continue;
    const entry = byClass.get(key);
    entry.total += 1;
    if (record.status === "present") entry.present += 1;
    else if (record.status === "absent") entry.absent += 1;
    else if (record.status === "excused") entry.excused += 1;
    else entry.pending += 1;
    entry.sessions.push({
      recordId: String(record._id),
      sessionId: record.session?._id ? String(record.session._id) : null,
      startedAt: record.session?.startedAt || record.createdAt,
      closedAt: record.session?.closedAt || null,
      status: record.status,
      source: record.source,
      decisionNote: record.decisionNote || "",
      finalised: Boolean(record.session?.attendanceFinalized),
    });
  }

  const classes = [...byClass.values()].map((entry) => ({
    ...entry,
    percentage: percentage(entry.present, entry.absent),
  }));
  const totals = classes.reduce(
    (accumulator, entry) => ({
      present: accumulator.present + entry.present,
      absent: accumulator.absent + entry.absent,
      pending: accumulator.pending + entry.pending,
      excused: accumulator.excused + entry.excused,
      total: accumulator.total + entry.total,
    }),
    { present: 0, absent: 0, pending: 0, excused: 0, total: 0 }
  );

  const queries = await AttendanceQuery.find({ student: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  res.status(200).json({
    success: true,
    summary: { ...totals, percentage: percentage(totals.present, totals.absent) },
    classes,
    recent: records.slice(0, 30).map((record) => ({
      recordId: String(record._id),
      class: record.classSnapshot,
      status: record.status,
      source: record.source,
      startedAt: record.session?.startedAt || record.createdAt,
      sessionId: record.session?._id ? String(record.session._id) : null,
      finalised: Boolean(record.session?.attendanceFinalized),
    })),
    queries: queries.map((query) => ({
      id: String(query._id),
      status: query.status,
      reason: query.reason,
      createdAt: query.createdAt,
      expiresAt: query.expiresAt,
      decisionNote: query.decisionNote,
      classSnapshot: query.classSnapshot,
    })),
  });
});

exports.classOverview = catchAsyncError(async (req, res, next) => {
  const courseClass = await getOwnedClass(req.params.classId, req.user, next);
  if (!courseClass) return;

  await expireStaleQueries();
  const term = await resolveTermRange(req.query);
  const sessionFilter = { courseClass: courseClass._id };
  if (term.range) sessionFilter.startedAt = term.range;

  const sessions = await CheckInSession.find(sessionFilter)
    .sort({ startedAt: 1 })
    .limit(200)
    .lean();
  const sessionIds = sessions.map((session) => session._id);
  const records = sessionIds.length
    ? await AttendanceRecord.find({ session: { $in: sessionIds } }).lean()
    : [];

  const sessionMap = new Map(sessions.map((session) => [String(session._id), session]));
  const recordGroups = new Map();
  for (const record of records) {
    const key = String(record.session);
    if (!recordGroups.has(key)) recordGroups.set(key, []);
    recordGroups.get(key).push(record);
  }

  const sessionViews = sessions.map((session) => {
    const summary = summariseRecords(recordGroups.get(String(session._id)) || []);
    return {
      id: String(session._id),
      startedAt: session.startedAt,
      closedAt: session.closedAt,
      status: session.status,
      classSnapshot: session.classSnapshot,
      attendanceFinalized: Boolean(session.attendanceFinalized),
      summary,
      queryWindowEndsAt: session.queryWindowEndsAt || null,
    };
  });

  const trend = sessionViews
    .filter((session) => session.status === STATUS_CLOSED)
    .map((session) => ({
      sessionId: session.id,
      label: new Date(session.startedAt).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      }),
      startedAt: session.startedAt,
      percentage: session.summary.percentage,
      present: session.summary.present,
      absent: session.summary.absent,
      pending: session.summary.pending,
    }));

  const students = new Map();
  for (const record of records) {
    const key = record.studentEmail;
    if (!students.has(key)) {
      students.set(key, {
        email: record.studentEmail,
        name: record.studentName,
        rollNumber: record.rollNumber,
        present: 0,
        absent: 0,
        pending: 0,
        excused: 0,
        total: 0,
        lastStatus: null,
        lastSessionAt: null,
      });
    }
    const entry = students.get(key);
    entry.total += 1;
    if (record.status === "present") entry.present += 1;
    else if (record.status === "absent") entry.absent += 1;
    else if (record.status === "excused") entry.excused += 1;
    else entry.pending += 1;
    const session = sessionMap.get(String(record.session));
    if (session && (!entry.lastSessionAt || session.startedAt > entry.lastSessionAt)) {
      entry.lastSessionAt = session.startedAt;
      entry.lastStatus = record.status;
    }
  }

  const studentList = [...students.values()]
    .map((student) => ({ ...student, percentage: percentage(student.present, student.absent) }))
    .sort((left, right) => {
      const leftRoll = left.rollNumber || "";
      const rightRoll = right.rollNumber || "";
      return leftRoll.localeCompare(rightRoll) || left.email.localeCompare(right.email);
    });

  const totals = studentList.reduce(
    (accumulator, student) => ({
      present: accumulator.present + student.present,
      absent: accumulator.absent + student.absent,
      pending: accumulator.pending + student.pending,
      excused: accumulator.excused + student.excused,
      total: accumulator.total + student.total,
    }),
    { present: 0, absent: 0, pending: 0, excused: 0, total: 0 }
  );

  const queryCounts = await AttendanceQuery.aggregate([
    { $match: { courseClass: courseClass._id } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const queries = queryCounts.reduce(
    (accumulator, row) => ({ ...accumulator, [row._id]: row.count }),
    { pending: 0, approved: 0, rejected: 0, expired: 0 }
  );

  res.status(200).json({
    success: true,
    class: {
      id: String(courseClass._id),
      courseCode: courseClass.courseCode,
      title: courseClass.title,
      section: courseClass.section,
      roomNo: courseClass.defaultRoom?.roomNo || "",
    },
    term: { from: term.from, to: term.to, name: term.termName },
    summary: {
      ...totals,
      decided: totals.present + totals.absent,
      percentage: percentage(totals.present, totals.absent),
      classAverage:
        studentList.length > 0
          ? Math.round(
              (studentList.reduce((sum, student) => sum + (student.percentage ?? 0), 0) /
                studentList.length) *
                10
            ) / 10
          : null,
    },
    students: studentList,
    sessions: sessionViews,
    trend,
    queries,
  });
});

exports.studentAttendance = catchAsyncError(async (req, res, next) => {
  const courseClass = await getOwnedClass(req.params.classId, req.user, next);
  if (!courseClass) return;

  const studentId = String(req.params.studentId || "");
  let recordFilter;
  if (mongoose.isValidObjectId(studentId) && studentId.length === 24) {
    recordFilter = { courseClass: courseClass._id, student: studentId };
  } else {
    recordFilter = {
      courseClass: courseClass._id,
      studentEmail: studentId.trim().toLowerCase(),
    };
  }
  const records = await AttendanceRecord.find(recordFilter)
    .populate("session", "startedAt closedAt status attendanceFinalized classSnapshot")
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();

  if (!records.length) {
    return next(new ErrorHandler("No attendance records found for this student in this class.", 404));
  }

  const summary = summariseRecords(records);
  const queries = await AttendanceQuery.find({
    courseClass: courseClass._id,
    studentEmail: records[0].studentEmail,
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  res.status(200).json({
    success: true,
    student: {
      email: records[0].studentEmail,
      name: records[0].studentName,
      rollNumber: records[0].rollNumber,
      id: records[0].student ? String(records[0].student) : null,
    },
    class: {
      id: String(courseClass._id),
      courseCode: courseClass.courseCode,
      title: courseClass.title,
      section: courseClass.section,
    },
    summary: { ...summary, percentage: percentage(summary.present, summary.absent) },
    records: records.map((record) => ({
      ...decorateRecord(
        record,
        record.query ? { id: String(record.query) } : null
      ),
      session: record.session
        ? {
            id: String(record.session._id),
            startedAt: record.session.startedAt,
            closedAt: record.session.closedAt,
            status: record.session.status,
            attendanceFinalized: Boolean(record.session.attendanceFinalized),
          }
        : null,
    })),
    queries: queries.map((query) => ({
      id: String(query._id),
      status: query.status,
      reason: query.reason,
      createdAt: query.createdAt,
      expiresAt: query.expiresAt,
      decisionNote: query.decisionNote,
      distanceMeters: query.distanceMeters,
    })),
  });
});

/**
 * Student-facing closed-session history. This is the list the query screen
 * needs: each closed session, the student's own attendance state, whether a
 * query already exists, and whether the review window is still open.
 */
exports.mySessionHistory = catchAsyncError(async (req, res) => {
  await expireStaleQueries();
  const settings = await getSettings();
  const email = String(req.user.email || "").trim().toLowerCase();

  const enrollments = await Enrollment.find({ email, status: "active" })
    .populate({ path: "class", select: "courseCode title section defaultRoom" })
    .lean();
  const classIds = enrollments.map((entry) => entry.class?._id).filter(Boolean);

  if (!classIds.length) {
    return res.status(200).json({ success: true, sessions: [], queryWindowHours: settings.queryWindowHours });
  }

  const sessions = await CheckInSession.find({
    courseClass: { $in: classIds },
    status: STATUS_CLOSED,
  })
    .populate("courseClass", "courseCode title section")
    .populate("room", "roomNo")
    .sort({ startedAt: -1 })
    .limit(80)
    .lean();

  const sessionIds = sessions.map((session) => session._id);
  const [records, queries] = await Promise.all([
    AttendanceRecord.find({ session: { $in: sessionIds }, studentEmail: email })
      .select("session status source decisionNote attemptLocation")
      .lean(),
    AttendanceQuery.find({ session: { $in: sessionIds }, studentEmail: email })
      .select("session status reason expiresAt decidedAt decisionNote distanceMeters withinRadius")
      .lean(),
  ]);

  const recordBySession = new Map(records.map((record) => [String(record.session), record]));
  const queryBySession = new Map(queries.map((query) => [String(query.session), query]));
  const now = Date.now();

  const list = sessions.map((session) => {
    const record = recordBySession.get(String(session._id)) || null;
    const query = queryBySession.get(String(session._id)) || null;
    const fallbackWindowEnd = session.closedAt
      ? new Date(
          new Date(session.closedAt).getTime() +
            (Number(settings.queryWindowHours) || 24) * 60 * 60 * 1000
        )
      : null;
    const windowEndsAt = session.queryWindowEndsAt || fallbackWindowEnd;
    const windowOpen = windowEndsAt ? new Date(windowEndsAt).getTime() > now : false;
    const canRaiseQuery =
      Boolean(record) &&
      record.status !== "present" &&
      !query &&
      windowOpen &&
      settings.allowStudentQueries;

    return {
      id: String(session._id),
      class: session.courseClass
        ? {
            id: String(session.courseClass._id),
            courseCode: session.courseClass.courseCode,
            title: session.courseClass.title,
            section: session.courseClass.section || "",
            roomNo: session.room?.roomNo || session.classSnapshot?.roomNo || "",
          }
        : session.classSnapshot,
      startedAt: session.startedAt,
      closedAt: session.closedAt,
      queryWindowEndsAt: windowEndsAt,
      windowOpen,
      attendance: record
        ? {
            recordId: String(record._id),
            status: record.status,
            source: record.source,
            decisionNote: record.decisionNote || "",
            hasLocation: Boolean(record.attemptLocation),
          }
        : null,
      query: query
        ? {
            id: String(query._id),
            status: query.status,
            reason: query.reason,
            expiresAt: query.expiresAt,
            decidedAt: query.decidedAt,
            decisionNote: query.decisionNote || "",
            distanceMeters: query.distanceMeters ?? null,
            withinRadius: query.withinRadius ?? null,
          }
        : null,
      canRaiseQuery,
    };
  });

  res.status(200).json({
    success: true,
    queryWindowHours: settings.queryWindowHours,
    sessions: list,
  });
});

const summariseSessions = async (sessionIds = []) => {
  if (!sessionIds.length) return new Map();
  const rows = await AttendanceRecord.aggregate([
    { $match: { session: { $in: sessionIds } } },
    { $group: { _id: { session: "$session", status: "$status" }, count: { $sum: 1 } } },
  ]);
  const map = new Map();
  for (const row of rows) {
    const key = String(row._id.session);
    if (!map.has(key)) {
      map.set(key, { total: 0, present: 0, absent: 0, pending: 0, excused: 0 });
    }
    const summary = map.get(key);
    summary.total += row.count;
    if (row._id.status === "present") summary.present += row.count;
    else if (row._id.status === "absent") summary.absent += row.count;
    else if (row._id.status === "excused") summary.excused += row.count;
    else summary.pending += row.count;
  }
  for (const summary of map.values()) {
    const decided = summary.present + summary.absent;
    summary.percentage = decided > 0 ? Math.round((summary.present / decided) * 1000) / 10 : null;
  }
  return map;
};

/**
 * Teacher-wide session history. The class-scoped endpoint remains the live
 * check-in screen; this one powers the cross-class history and audit page.
 */
exports.teacherSessionHistory = catchAsyncError(async (req, res) => {
  await expireStaleQueries();
  const filter = req.user.role === "superadmin" ? {} : { teacher: req.user._id };
  if (req.user.role === "superadmin" && req.query.teacherId && mongoose.isValidObjectId(req.query.teacherId)) {
    filter.teacher = req.query.teacherId;
  }
  if (req.query.classId && mongoose.isValidObjectId(req.query.classId)) {
    filter.courseClass = req.query.classId;
  }
  if (["active", "closed"].includes(String(req.query.status || ""))) {
    filter.status = String(req.query.status);
  }
  if (req.query.from || req.query.to) {
    const range = {};
    if (req.query.from) range.$gte = new Date(req.query.from);
    if (req.query.to) {
      const end = new Date(req.query.to);
      end.setHours(23, 59, 59, 999);
      range.$lte = end;
    }
    filter.startedAt = range;
  }

  const limit = Math.min(Math.max(Number(req.query.limit) || 80, 1), 200);
  const sessions = await CheckInSession.find(filter)
    .populate("courseClass", "courseCode title section")
    .populate("room", "roomNo")
    .sort({ startedAt: -1 })
    .limit(limit)
    .lean();

  const sessionIds = sessions.map((session) => session._id);
  const summaries = await summariseSessions(sessionIds);
  const queries = sessionIds.length
    ? await AttendanceQuery.aggregate([
        { $match: { session: { $in: sessionIds } } },
        { $group: { _id: { session: "$session", status: "$status" }, count: { $sum: 1 } } },
      ])
    : [];
  const queryCounts = new Map();
  for (const row of queries) {
    const key = String(row._id.session);
    if (!queryCounts.has(key)) queryCounts.set(key, { total: 0, pending: 0 });
    const counts = queryCounts.get(key);
    counts.total += row.count;
    if (row._id.status === "pending") counts.pending += row.count;
  }

  res.status(200).json({
    success: true,
    sessions: sessions.map((session) => ({
      id: String(session._id),
      class: session.courseClass
        ? {
            id: String(session.courseClass._id),
            courseCode: session.courseClass.courseCode,
            title: session.courseClass.title,
            section: session.courseClass.section || "",
          }
        : session.classSnapshot,
      roomNo: session.room?.roomNo || session.classSnapshot?.roomNo || "",
      status: session.status,
      wave: session.wave,
      startedAt: session.startedAt,
      closedAt: session.closedAt,
      attendanceFinalized: Boolean(session.attendanceFinalized),
      attendanceFinalizedAt: session.attendanceFinalizedAt,
      queryWindowEndsAt: session.queryWindowEndsAt,
      rosterCount: session.rosterCount || 0,
      attendanceSummary:
        summaries.get(String(session._id)) || {
          total: 0,
          present: 0,
          absent: 0,
          pending: 0,
          excused: 0,
          percentage: null,
        },
      queries: queryCounts.get(String(session._id)) || { total: 0, pending: 0 },
      isDemo: Boolean(session.isDemo),
    })),
  });
});

exports.teacherAudit = catchAsyncError(async (req, res, next) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const filter = { actor: req.user._id };
  if (req.query.action) filter.action = String(req.query.action);
  if (req.query.entityType) filter.entityType = String(req.query.entityType);
  const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  res.status(200).json({
    success: true,
    logs: logs.map(toAuditView),
  });
});

exports.sessionQueryListView = async (session) => {
  const queries = await AttendanceQuery.find({ session: session._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  return queries;
};

exports.classSnapshotForSession = classSnapshotForSession;
