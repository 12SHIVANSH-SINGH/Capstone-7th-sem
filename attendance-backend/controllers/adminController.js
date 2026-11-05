const mongoose = require("mongoose");
const catchAsyncError = require("../middleware/catchasyncerror");
const ErrorHandler = require("../utils/errorhandler");
const User = require("../models/userModels");
const CourseClass = require("../models/classModels");
const Enrollment = require("../models/enrollmentModels");
const CheckInSession = require("../models/checkInSessionModels");
const AttendanceRecord = require("../models/attendanceRecordModels");
const AttendanceQuery = require("../models/attendanceQueryModels");
const AuditLog = require("../models/auditLogModels");
const Notification = require("../models/notificationModels");
const Timetable = require("../models/timetableModels");
const DeviceBindingRequest = require("../models/deviceBindingRequestModels");
const { Room } = require("../models/roomModels");
const { writeAudit, toAuditView } = require("../utils/audit");
const { verifyAuditChain } = require("../utils/auditChain");
const { getSettings, updateSettings, settingsView, DEFAULTS } = require("../utils/settings");
const { expireStaleQueries, summariseRecords, randomKey, queryWindowEnd } = require("../utils/attendance");
const { normaliseEmail, isValidEmail, isSessionAllowed } = require("../utils/signInPolicy");
const presentUser = require("../utils/presentUser");
const { normaliseLocation, distanceMeters, locationView } = require("../utils/location");
const cookieOptions = require("../utils/cookieOptions");
const { STATUS_CLOSED } = require("../utils/checkInSession");
const { isDevAuthEnabled } = require("../utils/devAuth");
const { sessionVersionMatches } = require("../utils/sessionVersion");
const { verifyJwt } = require("../utils/verifyJwt");

const isProduction = () =>
  String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";

const DEMO_DOMAIN = "@demo.invalid";
const DEMO_ROOM = "DEMO-101";
const DEMO_STUDENT_NAMES = [
  "Aarav Mehta",
  "Ishita Rao",
  "Kabir Singh",
  "Meera Nair",
  "Rohan Das",
  "Sara Khan",
  "Ved Patel",
  "Zoya Ali",
];

const userView = (user) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status || "active",
  authProvider: user.authProvider,
  isDemo: Boolean(user.isDemo),
  demoLabel: user.demoLabel || "",
  phoneLabel: user.phoneLabel || "",
  rollNumber: user.rollNumber || "",
  createdAt: user.createdAt,
  lastSeenAt: user.deviceBinding?.lastSeenAt || null,
  deviceApproved: Boolean(user.deviceBinding?.approvedAt),
});

const attendanceSummaryForSessions = async (sessionIds = []) => {
  if (!sessionIds.length) return new Map();
  const rows = await AttendanceRecord.aggregate([
    { $match: { session: { $in: sessionIds } } },
    { $group: { _id: { session: "$session", status: "$status" }, count: { $sum: 1 } } },
  ]);
  const map = new Map();
  for (const row of rows) {
    const key = String(row._id.session);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ status: row._id.status, count: row.count });
  }
  const summaries = new Map();
  for (const [key, groups] of map.entries()) {
    const summary = { total: 0, present: 0, absent: 0, pending: 0, excused: 0 };
    for (const group of groups) {
      summary.total += group.count;
      if (group.status === "present") summary.present += group.count;
      else if (group.status === "absent") summary.absent += group.count;
      else if (group.status === "excused") summary.excused += group.count;
      else summary.pending += group.count;
    }
    const decided = summary.present + summary.absent;
    summary.percentage = decided > 0 ? Math.round((summary.present / decided) * 1000) / 10 : null;
    summaries.set(key, summary);
  }
  return summaries;
};

exports.overview = catchAsyncError(async (req, res) => {
  await expireStaleQueries();
  const [users, teachers, students, superadmins, classes, sessions, pendingQueries, finalizedSessions, recentAudit, demoUsers] =
    await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ role: "teacher", status: { $ne: "disabled" } }),
      User.countDocuments({ role: "student", status: { $ne: "disabled" } }),
      User.countDocuments({ role: "superadmin", status: { $ne: "disabled" } }),
      CourseClass.countDocuments({}),
      CheckInSession.countDocuments({}),
      AttendanceQuery.countDocuments({ status: "pending" }),
      CheckInSession.countDocuments({ attendanceFinalized: true }),
      AuditLog.find({}).sort({ createdAt: -1 }).limit(8).lean(),
      User.countDocuments({ isDemo: true }),
    ]);

  const attendanceRows = await AttendanceRecord.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const attendance = attendanceRows.reduce(
    (accumulator, row) => ({ ...accumulator, [row._id]: row.count }),
    { present: 0, absent: 0, pending: 0, excused: 0 }
  );
  const decided = attendance.present + attendance.absent;

  res.status(200).json({
    success: true,
    counts: {
      users,
      teachers,
      students,
      superadmins,
      classes,
      sessions,
      finalizedSessions,
      pendingQueries,
      demoUsers,
      attendance,
      attendancePercentage: decided ? Math.round((attendance.present / decided) * 1000) / 10 : null,
    },
    production: isProduction(),
    demoEnabled: !isProduction(),
    recentAudit: recentAudit.map(toAuditView),
  });
});

exports.listUsers = catchAsyncError(async (req, res) => {
  const filter = {};
  if (req.query.role) filter.role = String(req.query.role);
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.demo === "true") filter.isDemo = true;
  if (req.query.demo === "false") filter.isDemo = false;
  if (req.query.q) {
    const q = String(req.query.q).trim();
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { rollNumber: { $regex: q, $options: "i" } },
    ];
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const users = await User.find(filter).sort({ role: 1, name: 1 }).limit(limit);
  res.status(200).json({ success: true, users: users.map(userView) });
});

exports.createUser = catchAsyncError(async (req, res, next) => {
  const email = normaliseEmail(req.body?.email);
  const name = String(req.body?.name || "").trim();
  const role = String(req.body?.role || "student").trim();
  if (!name) return next(new ErrorHandler("Name is required.", 400));
  if (!isValidEmail(email)) return next(new ErrorHandler("A valid email address is required.", 400));
  if (!["student", "teacher"].includes(role)) {
    return next(new ErrorHandler("New accounts must be students or teachers; super admin is an environment grant.", 400));
  }
  if (isProduction() && Boolean(req.body?.isDemo)) {
    return next(new ErrorHandler("Demo accounts cannot be created in production.", 403));
  }

  const existing = await User.findOne({ email });
  if (existing) return next(new ErrorHandler("An account with this email already exists.", 409));

  const user = await User.create({
    name,
    email,
    role,
    status: "active",
    authProvider: "google",
    isDemo: Boolean(req.body?.isDemo),
    demoLabel: String(req.body?.demoLabel || "").slice(0, 80),
    phoneLabel: String(req.body?.phoneLabel || "").slice(0, 80),
    rollNumber: String(req.body?.rollNumber || "").slice(0, 40),
  });

  await writeAudit(req, {
    action: "admin.user.created",
    entityType: "User",
    entityId: user._id,
    summary: `Created ${role} account ${email}.`,
    after: userView(user),
    isDemo: user.isDemo,
  });

  res.status(201).json({ success: true, user: userView(user) });
});

exports.updateUser = catchAsyncError(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.userId)) {
    return next(new ErrorHandler("User not found", 404));
  }
  const user = await User.findById(req.params.userId);
  if (!user) return next(new ErrorHandler("User not found", 404));

  const before = userView(user);
  const previousStatus = user.status;
  const previousRole = user.role;
  const allowed = ["name", "status", "phoneLabel", "demoLabel", "rollNumber", "role"];
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(req.body || {}, key)) continue;
    // Super-admin is an environment grant, not a row-level role. A second
    // admin must not be able to demote or disable the listed owner account
    // from the UI/API and then lock the deployment out of /admin.
    if (user.role === "superadmin" && key === "role") {
      return next(
        new ErrorHandler(
          "Super-admin access is granted by environment configuration and cannot be changed here.",
          400
        )
      );
    }
    if (user.role === "superadmin" && key === "status" && req.body.status === "disabled") {
      return next(new ErrorHandler("Super-admin accounts cannot be disabled here.", 400));
    }
    if (key === "role" && !["student", "teacher"].includes(req.body.role)) {
      return next(new ErrorHandler("Role must be student or teacher. Super admin is an environment grant.", 400));
    }
    if (key === "status" && !["active", "disabled"].includes(req.body.status)) {
      return next(new ErrorHandler("Status must be active or disabled.", 400));
    }
    user[key] = req.body[key];
  }

  if (String(user._id) === String(req.user._id) && (user.status === "disabled" || user.role !== "superadmin")) {
    return next(new ErrorHandler("You cannot disable or demote your own super-admin account.", 400));
  }
  if (user.isDemo && isProduction()) {
    return next(new ErrorHandler("Demo accounts cannot be edited in production.", 403));
  }
  if (!user.name) return next(new ErrorHandler("Name is required.", 400));

  // A status or role change must not leave the old cookie alive. This covers
  // disabling, re-enabling and role changes; profile-only edits do not bump.
  const sessionsRevoked = previousStatus !== user.status || previousRole !== user.role;
  if (sessionsRevoked) {
    user.tokenVersion = (user.tokenVersion || 0) + 1;
  }

  await user.save();
  await writeAudit(req, {
    action: "admin.user.updated",
    entityType: "User",
    entityId: user._id,
    summary: `Updated account ${user.email}.`,
    before,
    after: userView(user),
    metadata: { sessionsRevoked },
    isDemo: user.isDemo,
  });

  res.status(200).json({ success: true, user: userView(user) });
});

exports.listClasses = catchAsyncError(async (req, res) => {
  const classes = await CourseClass.find({})
    .populate("teacher", "name email")
    .populate("defaultRoom", "roomNo")
    .sort({ createdAt: -1 });
  const counts = await Enrollment.aggregate([
    { $match: { class: { $in: classes.map((courseClass) => courseClass._id) }, status: "active" } },
    { $group: { _id: "$class", count: { $sum: 1 } } },
  ]);
  const countByClass = new Map(counts.map((row) => [String(row._id), row.count]));
  res.status(200).json({
    success: true,
    classes: classes.map((courseClass) => ({
      id: String(courseClass._id),
      courseCode: courseClass.courseCode,
      title: courseClass.title,
      section: courseClass.section,
      room: courseClass.defaultRoom
        ? { id: String(courseClass.defaultRoom._id), roomNo: courseClass.defaultRoom.roomNo }
        : null,
      teacher: courseClass.teacher
        ? {
            id: String(courseClass.teacher._id),
            name: courseClass.teacher.name,
            email: courseClass.teacher.email,
          }
        : null,
      activeStudentCount: countByClass.get(String(courseClass._id)) || 0,
      isDemo: Boolean(courseClass.isDemo),
      createdAt: courseClass.createdAt,
    })),
  });
});

exports.createClass = catchAsyncError(async (req, res, next) => {
  const { courseCode, title, section = "", teacherId, roomId } = req.body || {};
  if (!courseCode || !title) return next(new ErrorHandler("Course code and title are required.", 400));
  if (!mongoose.isValidObjectId(teacherId)) return next(new ErrorHandler("Select a teacher.", 400));
  if (!mongoose.isValidObjectId(roomId)) return next(new ErrorHandler("Select a room.", 400));
  const teacher = await User.findOne({ _id: teacherId, role: "teacher", status: { $ne: "disabled" } });
  if (!teacher) return next(new ErrorHandler("Teacher not found or disabled.", 404));
  const room = await Room.findById(roomId);
  if (!room) return next(new ErrorHandler("Room not found.", 404));

  const courseClass = await CourseClass.create({
    courseCode: String(courseCode).trim().toUpperCase(),
    title: String(title).trim(),
    section: String(section).trim(),
    teacher: teacher._id,
    defaultRoom: room._id,
    isDemo: Boolean(req.body?.isDemo),
  });
  await writeAudit(req, {
    action: "admin.class.created",
    entityType: "CourseClass",
    entityId: courseClass._id,
    summary: `Created class ${courseClass.courseCode} for ${teacher.email}.`,
    isDemo: courseClass.isDemo,
  });
  res.status(201).json({ success: true, class: { id: String(courseClass._id) } });
});

exports.updateClass = catchAsyncError(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.classId)) {
    return next(new ErrorHandler("Class not found", 404));
  }
  const courseClass = await CourseClass.findById(req.params.classId);
  if (!courseClass) return next(new ErrorHandler("Class not found", 404));
  const before = {
    title: courseClass.title,
    section: courseClass.section,
    teacher: String(courseClass.teacher),
    room: String(courseClass.defaultRoom),
  };
  if (req.body?.title) courseClass.title = String(req.body.title).trim();
  if (req.body?.section !== undefined) courseClass.section = String(req.body.section).trim();
  if (req.body?.teacherId && mongoose.isValidObjectId(req.body.teacherId)) {
    const teacher = await User.findOne({ _id: req.body.teacherId, role: "teacher" });
    if (!teacher) return next(new ErrorHandler("Teacher not found.", 404));
    courseClass.teacher = teacher._id;
  }
  if (req.body?.roomId && mongoose.isValidObjectId(req.body.roomId)) {
    const room = await Room.findById(req.body.roomId);
    if (!room) return next(new ErrorHandler("Room not found.", 404));
    courseClass.defaultRoom = room._id;
  }
  await courseClass.save();
  await writeAudit(req, {
    action: "admin.class.updated",
    entityType: "CourseClass",
    entityId: courseClass._id,
    summary: `Updated class ${courseClass.courseCode}.`,
    before,
    after: {
      title: courseClass.title,
      section: courseClass.section,
      teacher: String(courseClass.teacher),
      room: String(courseClass.defaultRoom),
    },
    isDemo: courseClass.isDemo,
  });
  res.status(200).json({ success: true });
});

exports.listSessions = catchAsyncError(async (req, res) => {
  const filter = {};
  if (req.query.classId && mongoose.isValidObjectId(req.query.classId)) {
    filter.courseClass = req.query.classId;
  }
  if (req.query.teacherId && mongoose.isValidObjectId(req.query.teacherId)) {
    filter.teacher = req.query.teacherId;
  }
  if (req.query.status) filter.status = req.query.status;
  const sessions = await CheckInSession.find(filter)
    .populate("courseClass", "courseCode title section")
    .populate("teacher", "name email")
    .populate("room", "roomNo")
    .sort({ startedAt: -1 })
    .limit(200)
    .lean();
  const summaries = await attendanceSummaryForSessions(sessions.map((session) => session._id));
  const sessionIds = sessions.map((session) => session._id);
  const queryRows = sessionIds.length
    ? await AttendanceQuery.aggregate([
        { $match: { session: { $in: sessionIds } } },
        { $group: { _id: { session: "$session", status: "$status" }, count: { $sum: 1 } } },
      ])
    : [];
  const queryCounts = new Map();
  for (const row of queryRows) {
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
      class: session.courseClass,
      teacher: session.teacher,
      room: session.room,
      status: session.status,
      startedAt: session.startedAt,
      closedAt: session.closedAt,
      wave: session.wave,
      attendanceFinalized: Boolean(session.attendanceFinalized),
      attendanceFinalizedAt: session.attendanceFinalizedAt,
      queryWindowEndsAt: session.queryWindowEndsAt,
      rosterCount: session.rosterCount,
      isDemo: Boolean(session.isDemo),
      attendanceSummary: summaries.get(String(session._id)) || null,
      queries: queryCounts.get(String(session._id)) || { total: 0, pending: 0 },
    })),
  });
});

exports.sessionAttendance = catchAsyncError(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.sessionId)) {
    return next(new ErrorHandler("Check-in session not found", 404));
  }
  const session = await CheckInSession.findById(req.params.sessionId)
    .populate("courseClass", "courseCode title section")
    .populate("teacher", "name email")
    .populate("room", "roomNo");
  if (!session) return next(new ErrorHandler("Check-in session not found", 404));

  const records = await AttendanceRecord.find({ session: session._id }).sort({
    rollNumber: 1,
    studentName: 1,
  });
  const queries = await AttendanceQuery.find({ session: session._id }).sort({ createdAt: -1 });
  const settings = await getSettings();
  res.status(200).json({
    success: true,
    session: {
      id: String(session._id),
      class: session.courseClass,
      teacher: session.teacher,
      room: session.room,
      status: session.status,
      wave: session.wave,
      keyIssuedAt: session.keyIssuedAt,
      keyExpiresAt: session.keyExpiresAt,
      waveHistory: (Array.isArray(session.keyHistory) ? session.keyHistory : []).map((entry) => ({
        wave: entry.wave,
        keyIssuedAt: entry.keyIssuedAt,
        keyExpiresAt: entry.keyExpiresAt,
      })),
      teacherLocation: locationView(session.teacherLocation),
      geofenceRadiusMeters: settings.geofenceRadiusMeters,
      startedAt: session.startedAt,
      closedAt: session.closedAt,
      attendanceFinalized: Boolean(session.attendanceFinalized),
      attendanceFinalizedAt: session.attendanceFinalizedAt,
      queryWindowEndsAt: session.queryWindowEndsAt,
      isDemo: Boolean(session.isDemo),
    },
    summary: summariseRecords(records),
    records: records.map((record) => ({
      id: String(record._id),
      student: record.student ? String(record.student) : null,
      studentEmail: record.studentEmail,
      studentName: record.studentName,
      rollNumber: record.rollNumber,
      status: record.status,
      source: record.source,
      markedByEmail: record.markedByEmail,
      markedAt: record.markedAt,
      decisionNote: record.decisionNote,
      evidence: record.evidence,
      attemptLocation: locationView(record.attemptLocation),
      teacherLocation: locationView(record.teacherLocation),
      attemptDistanceMeters:
        record.attemptLocation && record.teacherLocation
          ? distanceMeters(record.teacherLocation, record.attemptLocation)
          : null,
      isDemo: record.isDemo,
    })),
    queries: queries.map((query) => ({
      id: String(query._id),
      studentEmail: query.studentEmail,
      status: query.status,
      reason: query.reason,
      distanceMeters: query.distanceMeters,
      createdAt: query.createdAt,
    })),
  });
});

exports.overrideAttendance = catchAsyncError(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.recordId)) {
    return next(new ErrorHandler("Attendance record not found", 404));
  }
  const record = await AttendanceRecord.findById(req.params.recordId);
  if (!record) return next(new ErrorHandler("Attendance record not found", 404));
  const status = String(req.body?.status || "").toLowerCase();
  if (!["present", "absent", "excused", "pending"].includes(status)) {
    return next(new ErrorHandler("Status must be present, absent, excused or pending.", 400));
  }
  const before = {
    status: record.status,
    source: record.source,
    decisionNote: record.decisionNote,
  };
  record.status = status;
  record.source = "override";
  record.markedBy = req.user._id;
  record.markedByEmail = req.user.email;
  record.markedAt = new Date();
  record.decisionNote = String(req.body?.note || "Super-admin override").slice(0, 500);
  await record.save();
  await writeAudit(req, {
    action: "attendance.override",
    entityType: "AttendanceRecord",
    entityId: record._id,
    summary: `Overrode attendance for ${record.studentEmail} to ${status}.`,
    before,
    after: { status: record.status, source: record.source, note: record.decisionNote },
    isDemo: record.isDemo,
  });
  res.status(200).json({
    success: true,
    record: { id: String(record._id), status: record.status, source: record.source },
  });
});

exports.deleteAttendance = catchAsyncError(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.recordId)) {
    return next(new ErrorHandler("Attendance record not found", 404));
  }
  if (req.body?.confirm !== "DELETE") {
    return next(new ErrorHandler('Send { "confirm": "DELETE" } to remove an attendance record.', 400));
  }
  const record = await AttendanceRecord.findById(req.params.recordId);
  if (!record) return next(new ErrorHandler("Attendance record not found", 404));
  await record.deleteOne();
  await writeAudit(req, {
    action: "attendance.deleted",
    entityType: "AttendanceRecord",
    entityId: record._id,
    summary: `Deleted attendance record for ${record.studentEmail}.`,
    before: {
      status: record.status,
      source: record.source,
      session: String(record.session),
      class: record.classSnapshot,
    },
    isDemo: record.isDemo,
  });
  res.status(200).json({ success: true });
});

exports.listAudit = catchAsyncError(async (req, res) => {
  const filter = {};
  if (req.query.action) filter.action = String(req.query.action);
  if (req.query.entityType) filter.entityType = String(req.query.entityType);
  if (req.query.actorId && mongoose.isValidObjectId(req.query.actorId)) filter.actor = req.query.actorId;
  if (req.query.demo === "true") filter.isDemo = true;
  if (req.query.q) {
    const q = String(req.query.q).trim();
    filter.$or = [
      { summary: { $regex: q, $options: "i" } },
      { actorEmail: { $regex: q, $options: "i" } },
      { entityId: { $regex: q, $options: "i" } },
    ];
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 1000);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.status(200).json({ success: true, total, logs: logs.map(toAuditView) });
});

exports.verifyAudit = catchAsyncError(async (req, res) => {
  const result = await verifyAuditChain();
  res.status(200).json({ success: true, ...result });
});

exports.getSettings = catchAsyncError(async (req, res) => {
  const settings = await getSettings();
  res.status(200).json({ success: true, settings: settingsView(settings) });
});

exports.updateSettings = catchAsyncError(async (req, res, next) => {
  const before = settingsView(await getSettings());
  if (req.body?.demoModeEnabled === true && isProduction()) {
    return next(new ErrorHandler("Demo mode cannot be enabled in production.", 403));
  }
  const settings = await updateSettings(req.body || {}, req.user._id);
  await writeAudit(req, {
    action: "admin.settings.updated",
    entityType: "SystemSetting",
    entityId: settings._id,
    summary: "Updated system settings.",
    before,
    after: settingsView(settings),
  });
  res.status(200).json({ success: true, settings: settingsView(settings) });
});

exports.revokeUserSessions = catchAsyncError(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.userId)) {
    return next(new ErrorHandler("User not found", 404));
  }
  const user = await User.findById(req.params.userId);
  if (!user) return next(new ErrorHandler("User not found", 404));

  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();

  await writeAudit(req, {
    action: "admin.user.sessions_revoked",
    entityType: "User",
    entityId: user._id,
    summary: `Revoked all sessions for ${user.email}.`,
    isDemo: user.isDemo,
  });

  res.status(200).json({
    success: true,
    message: "All sessions for this account have been revoked.",
  });
});

exports.impersonate = catchAsyncError(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.userId)) {
    return next(new ErrorHandler("User not found", 404));
  }
  const target = await User.findById(req.params.userId);
  if (!target) return next(new ErrorHandler("User not found", 404));
  if (target.role === "superadmin") {
    return next(new ErrorHandler("Super-admin accounts cannot be impersonated.", 403));
  }
  if (target.status === "disabled") {
    return next(new ErrorHandler("This account is disabled.", 409));
  }
  if (String(target._id) === String(req.user._id)) {
    return next(new ErrorHandler("You are already signed in as this account.", 409));
  }

  const token = target.getJWTtoken({
    expiresIn: "15m",
    impersonatorId: String(req.user._id),
    impersonatorVersion: req.user.tokenVersion || 0,
  });
  const cookieSession = Boolean(req.cookies?.token);
  if (cookieSession) {
    res.cookie("admin_token", req.cookies.token, cookieOptions(new Date(Date.now() + 30 * 60 * 1000)));
    res.cookie("token", token, cookieOptions(new Date(Date.now() + 15 * 60 * 1000)));
  }

  await writeAudit(req, {
    action: "admin.impersonation.started",
    entityType: "User",
    entityId: target._id,
    summary: `Impersonation started for ${target.email}.`,
    isDemo: target.isDemo,
  });

  res.status(200).json({
    success: true,
    // A cookie session already holds the token in an httpOnly cookie. Echoing
    // it in JSON would let any page script read and exfiltrate it.
    ...(cookieSession ? {} : { token }),
    cookieSession,
    impersonating: true,
    user: presentUser(target),
  });
});

exports.stopImpersonation = catchAsyncError(async (req, res, next) => {
  const original = req.cookies?.admin_token;
  if (!original) {
    return next(new ErrorHandler("No impersonation session is active.", 409));
  }

  let decoded;
  try {
    decoded = verifyJwt(original);
  } catch (error) {
    res.clearCookie("admin_token", cookieOptions());
    return next(new ErrorHandler("The original admin session has expired. Sign in again.", 401));
  }

  const admin = await User.findById(decoded.id);
  const adminStillAllowed =
    admin &&
    admin.role === "superadmin" &&
    admin.status !== "disabled" &&
    isSessionAllowed(admin, { devAuthEnabled: isDevAuthEnabled() }) &&
    sessionVersionMatches(decoded, admin);
  if (!adminStillAllowed) {
    res.clearCookie("admin_token", cookieOptions());
    return next(new ErrorHandler("The original admin session is no longer valid.", 401));
  }

  // The route no longer authenticates the impersonated cookie, so decode it
  // only to identify the target for the audit entry. A missing or expired
  // target token must not block the owner from leaving impersonation.
  let impersonatedId = "";
  try {
    const current = verifyJwt(req.cookies?.token);
    impersonatedId = current?.id ? String(current.id) : "";
  } catch (error) {
    impersonatedId = "";
  }

  // Preserve the original token's real expiry; a fixed 24-hour cookie could
  // outlive the short admin token (and confuse the browser about a dead
  // session). verifyJwt above guarantees exp is still in the future.
  const restoredExpiry = decoded.exp
    ? new Date(decoded.exp * 1000)
    : new Date(Date.now() + 12 * 60 * 60 * 1000);
  res.cookie("token", original, cookieOptions(restoredExpiry));
  res.clearCookie("admin_token", cookieOptions());
  await writeAudit(
    { ...req, user: admin, impersonator: null },
    {
      action: "admin.impersonation.stopped",
      entityType: "User",
      entityId: impersonatedId || admin._id,
      summary: `Impersonation ended; returned to ${admin.email}.`,
    }
  );

  res.status(200).json({ success: true, user: presentUser(admin) });
});

const requireDemoMode = async (req, res, next) => {
  if (isProduction()) return next(new ErrorHandler("Not found", 404));
  const settings = await getSettings();
  if (!settings.demoModeEnabled) {
    return next(new ErrorHandler("Demo mode is disabled in Settings.", 403));
  }
  return next();
};

exports.demoStatus = [
  requireDemoMode,
  catchAsyncError(async (req, res) => {
    const [users, classes, sessions, queries, records] = await Promise.all([
      User.countDocuments({ isDemo: true }),
      CourseClass.countDocuments({ isDemo: true }),
      CheckInSession.countDocuments({ isDemo: true }),
      AttendanceQuery.countDocuments({ isDemo: true }),
      AttendanceRecord.countDocuments({ isDemo: true }),
    ]);
    res.status(200).json({
      success: true,
      demo: { users, classes, sessions, queries, records },
      production: false,
    });
  }),
];

const clearDemoData = async (excludeUserId = null) => {
  const userFilter = { isDemo: true };
  if (excludeUserId) userFilter._id = { $ne: excludeUserId };
  const demoUsers = await User.find(userFilter).select("_id").lean();
  const userIds = demoUsers.map((user) => user._id);
  const demoClasses = await CourseClass.find({ isDemo: true }).select("_id").lean();
  const classIds = demoClasses.map((courseClass) => courseClass._id);
  const demoRoom = await Room.findOne({ roomNo: DEMO_ROOM });

  await Promise.all([
    AttendanceQuery.deleteMany({ $or: [{ isDemo: true }, { courseClass: { $in: classIds } }] }),
    AttendanceRecord.deleteMany({ $or: [{ isDemo: true }, { courseClass: { $in: classIds } }] }),
    CheckInSession.deleteMany({ $or: [{ isDemo: true }, { courseClass: { $in: classIds } }] }),
    Timetable.deleteMany({ $or: [{ isDemo: true }, { teacher: { $in: userIds } }] }),
    Enrollment.deleteMany({ $or: [{ class: { $in: classIds } }, { student: { $in: userIds } }] }),
    Notification.deleteMany({ $or: [{ isDemo: true }, { user: { $in: userIds } }] }),
    DeviceBindingRequest.deleteMany({ student: { $in: userIds } }),
    AuditLog.deleteMany({ isDemo: true }),
    CourseClass.deleteMany({ isDemo: true }),
    User.deleteMany(userFilter),
  ]);
  if (demoRoom) {
    await Room.deleteOne({ _id: demoRoom._id });
  }
};

const buildDemoLocation = (latitude, longitude, offset = 0) => ({
  latitude: latitude + offset,
  longitude: longitude + offset,
  accuracy: 8,
  capturedAt: new Date(),
  source: "demo",
});

exports.seedDemo = [
  requireDemoMode,
  catchAsyncError(async (req, res, next) => {
    await clearDemoData(req.user._id);
    const settings = await getSettings();
    const now = new Date();
    const teacherLocation = buildDemoLocation(22.7766, 86.1434, 0);

    const room = await Room.findOneAndUpdate(
      { roomNo: DEMO_ROOM },
      { $setOnInsert: { roomNo: DEMO_ROOM } },
      { new: true, upsert: true }
    );
    const teacher = await User.create({
      name: "Dr. Ananya Verma",
      email: `demo.teacher${DEMO_DOMAIN}`,
      role: "teacher",
      authProvider: "dev",
      isDemo: true,
      demoLabel: "Demo teacher",
      phoneLabel: "Teacher phone",
    });

    const students = [];
    for (let index = 0; index < DEMO_STUDENT_NAMES.length; index += 1) {
      const user = await User.create({
        name: DEMO_STUDENT_NAMES[index],
        email: `demo.student${index + 1}${DEMO_DOMAIN}`,
        role: "student",
        authProvider: "dev",
        isDemo: true,
        demoLabel: "Demo student",
        phoneLabel: index === 0 ? "Student phone (Android)" : "Demo phone",
        rollNumber: `2026CS${String(index + 1).padStart(3, "0")}`,
      });
      students.push(user);
    }

    const courseClass = await CourseClass.create({
      courseCode: "CS 3101",
      title: "Design & Analysis of Algorithms",
      section: "A",
      teacher: teacher._id,
      defaultRoom: room._id,
      isDemo: true,
    });

    await Enrollment.insertMany(
      students.map((student) => ({
        class: courseClass._id,
        email: student.email,
        name: student.name,
        identity: { rollNumber: student.rollNumber, batch: "2026", programmeBranch: "CSE" },
        student: student._id,
        phoneLabel: student.phoneLabel,
        status: "active",
        rosterUpdatedAt: now,
      }))
    );

    await Timetable.insertMany([
      {
        courseClass: courseClass._id,
        teacher: teacher._id,
        room: room._id,
        dayOfWeek: 1,
        startTime: "10:00",
        endTime: "11:00",
        term: settings.termName,
        isDemo: true,
      },
      {
        courseClass: courseClass._id,
        teacher: teacher._id,
        room: room._id,
        dayOfWeek: 3,
        startTime: "10:00",
        endTime: "11:00",
        term: settings.termName,
        isDemo: true,
      },
      {
        courseClass: courseClass._id,
        teacher: teacher._id,
        room: room._id,
        dayOfWeek: 5,
        startTime: "10:00",
        endTime: "11:00",
        term: settings.termName,
        isDemo: true,
      },
    ]);

    const sessionDays = [21, 18, 14, 11, 7, 4, 2, 1];
    const createdSessions = [];
    for (let sessionIndex = 0; sessionIndex < sessionDays.length; sessionIndex += 1) {
      const days = sessionDays[sessionIndex];
      const startedAt = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      startedAt.setHours(10, 5, 0, 0);
      const closedAt = new Date(startedAt.getTime() + 48 * 60 * 1000);
      const session = await CheckInSession.create({
        courseClass: courseClass._id,
        teacher: teacher._id,
        room: room._id,
        status: STATUS_CLOSED,
        wave: 2,
        key: randomKey(),
        keyIssuedAt: new Date(startedAt.getTime() + 40 * 60 * 1000),
        keyExpiresAt: new Date(startedAt.getTime() + 42 * 60 * 1000),
        startedAt,
        closedAt,
        teacherLocation,
        classSnapshot: {
          courseCode: courseClass.courseCode,
          title: courseClass.title,
          section: courseClass.section,
          roomNo: room.roomNo,
        },
        rosterCount: students.length,
        attendanceFinalized: true,
        attendanceFinalizedAt: new Date(closedAt.getTime() + 20 * 60 * 1000),
        queryWindowEndsAt: queryWindowEnd(sessionDays[sessionIndex] <= 1 ? now : closedAt, settings),
        isDemo: true,
        createdAt: startedAt,
        updatedAt: closedAt,
      });
      createdSessions.push(session);

      const records = students.map((student, studentIndex) => {
        const absentPattern = (sessionIndex + studentIndex) % 7 === 0;
        const latestSession = sessionIndex === sessionDays.length - 1;
        const absent = absentPattern || (latestSession && studentIndex === 2);
        return {
          session: session._id,
          courseClass: courseClass._id,
          teacher: teacher._id,
          student: student._id,
          studentEmail: student.email,
          studentName: student.name,
          rollNumber: student.rollNumber,
          classSnapshot: session.classSnapshot,
          status: absent ? "absent" : "present",
          source: "demo",
          markedBy: teacher._id,
          markedByEmail: teacher.email,
          markedAt: new Date(closedAt.getTime() + 15 * 60 * 1000),
          decisionNote: absent ? "Demo absence for the showcase." : "Demo attendance from simulated wave evidence.",
          attemptLocation: buildDemoLocation(22.7766, 86.1434, studentIndex * 0.00001),
          teacherLocation,
          evidence: absent ? { proofCount: 0, waves: [] } : { proofCount: 2, waves: [0, 1] },
          isDemo: true,
          createdAt: startedAt,
          updatedAt: closedAt,
        };
      });
      await AttendanceRecord.insertMany(records);
    }

    // A pending query on the newest session.
    const latest = createdSessions[createdSessions.length - 1];
    const queryStudent = students[2];
    const pendingQuery = await AttendanceQuery.create({
      session: latest._id,
      courseClass: courseClass._id,
      teacher: teacher._id,
      student: queryStudent._id,
      studentEmail: queryStudent.email,
      studentName: queryStudent.name,
      classSnapshot: latest.classSnapshot,
      reason:
        "I was in the room for the whole lecture and my phone showed the wave, but I did not appear in the register. Please review my location.",
      status: "pending",
      teacherLocation,
      attemptLocation: buildDemoLocation(22.7766, 86.1434, 0.00008),
      studentLocation: buildDemoLocation(22.7766, 86.1434, 0.00009),
      distanceMeters: distanceMeters(
        teacherLocation,
        buildDemoLocation(22.7766, 86.1434, 0.00009)
      ),
      withinRadius: true,
      radiusMeters: settings.geofenceRadiusMeters,
      expiresAt: new Date(now.getTime() + 20 * 60 * 60 * 1000),
      isDemo: true,
    });
    const pendingRecord = await AttendanceRecord.findOne({
      session: latest._id,
      studentEmail: queryStudent.email,
    });
    if (pendingRecord) {
      pendingRecord.query = pendingQuery._id;
      await pendingRecord.save();
    }

    // An approved query from an earlier session.
    const approvedSession = createdSessions[3];
    const approvedStudent = students[4];
    const approvedQuery = await AttendanceQuery.create({
      session: approvedSession._id,
      courseClass: courseClass._id,
      teacher: teacher._id,
      student: approvedStudent._id,
      studentEmail: approvedStudent.email,
      studentName: approvedStudent.name,
      classSnapshot: approvedSession.classSnapshot,
      reason: "I was present but the phone could not decode the second wave. My location is in the classroom.",
      status: "approved",
      teacherLocation,
      attemptLocation: buildDemoLocation(22.7766, 86.1434, 0.00005),
      studentLocation: buildDemoLocation(22.7766, 86.1434, 0.00004),
      distanceMeters: distanceMeters(teacherLocation, buildDemoLocation(22.7766, 86.1434, 0.00004)),
      withinRadius: true,
      radiusMeters: settings.geofenceRadiusMeters,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      decidedBy: teacher._id,
      decidedByEmail: teacher.email,
      decidedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      decisionNote: "Location and time match the class. Marked present.",
      isDemo: true,
    });
    await AttendanceRecord.findOneAndUpdate(
      { session: approvedSession._id, studentEmail: approvedStudent.email },
      {
        $set: {
          status: "present",
          source: "query",
          markedBy: teacher._id,
          markedByEmail: teacher.email,
          markedAt: approvedQuery.decidedAt,
          decisionNote: approvedQuery.decisionNote,
          query: approvedQuery._id,
          isDemo: true,
        },
      }
    );

    // An expired query that demonstrates automatic rejection.
    const expiredSession = createdSessions[1];
    const expiredStudent = students[6];
    await AttendanceQuery.create({
      session: expiredSession._id,
      courseClass: courseClass._id,
      teacher: teacher._id,
      student: expiredStudent._id,
      studentEmail: expiredStudent.email,
      studentName: expiredStudent.name,
      classSnapshot: expiredSession.classSnapshot,
      reason: "I think I was present but could not mark it. Raising this late for the demo.",
      status: "expired",
      teacherLocation,
      studentLocation: buildDemoLocation(22.7766, 86.1434, 0.002),
      attemptLocation: null,
      distanceMeters: distanceMeters(teacherLocation, buildDemoLocation(22.7766, 86.1434, 0.002)),
      withinRadius: false,
      radiusMeters: settings.geofenceRadiusMeters,
      expiresAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      expiredAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      isDemo: true,
    });

    await Notification.insertMany(
      [
        {
          user: teacher._id,
          type: "query.created",
          title: "Demo query waiting for review",
          message: `${queryStudent.name} raised an attendance query for ${courseClass.courseCode}.`,
          link: "/queries",
          isDemo: true,
        },
        {
          user: queryStudent._id,
          type: "query.created",
          title: "Your demo query is pending",
          message: "Your teacher will review the location evidence and decide.",
          link: "/queries",
          isDemo: true,
        },
        {
          user: approvedStudent._id,
          type: "query.approved",
          title: "Demo query approved",
          message: "Your attendance was corrected to present.",
          link: "/queries",
          isDemo: true,
        },
      ].filter((entry) => entry.user)
    );

    await writeAudit(req, {
      action: "admin.demo.seeded",
      entityType: "DemoData",
      entityId: String(courseClass._id),
      summary: "Seeded the showcase teacher, students, classes, timetable, sessions, attendance and queries.",
      metadata: {
        teacher: teacher.email,
        students: students.length,
        sessions: createdSessions.length,
      },
      isDemo: true,
    });

    res.status(201).json({
      success: true,
      message: "Demo data is ready.",
      demo: {
        teacher: { id: String(teacher._id), name: teacher.name, email: teacher.email },
        students: students.map((student) => ({
          id: String(student._id),
          name: student.name,
          email: student.email,
        })),
        classId: String(courseClass._id),
        sessions: createdSessions.length,
      },
    });
  }),
];

exports.resetDemo = [
  requireDemoMode,
  catchAsyncError(async (req, res) => {
    await clearDemoData(req.user._id);
    await writeAudit(req, {
      action: "admin.demo.reset",
      entityType: "DemoData",
      entityId: "",
      summary: "Reset all demo users, classes, sessions, attendance and queries.",
      isDemo: true,
    });
    res.status(200).json({ success: true, message: "Demo data cleared." });
  }),
];

exports.isProduction = isProduction;
exports.isDevAuthEnabled = isDevAuthEnabled;
