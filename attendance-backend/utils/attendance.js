const AttendanceRecord = require("../models/attendanceRecordModels");
const AttendanceQuery = require("../models/attendanceQueryModels");
const CheckInSession = require("../models/checkInSessionModels");
const Enrollment = require("../models/enrollmentModels");
const User = require("../models/userModels");
const AuditLog = require("../models/auditLogModels");
const Notification = require("../models/notificationModels");
const { getSettings } = require("./settings");
const { locationView } = require("./location");
const { isDbReady } = require("./dbReady");

const QUERY_WINDOW_HOURS_DEFAULT = 24;

const sessionClassSnapshot = (courseClass, room) => ({
  courseCode: courseClass?.courseCode || "",
  title: courseClass?.title || "",
  section: courseClass?.section || "",
  roomNo: room?.roomNo || "",
});

const classSnapshotForSession = (session, courseClass, room) => {
  if (session?.classSnapshot?.courseCode) return session.classSnapshot;
  return sessionClassSnapshot(courseClass || session?.courseClass, room || session?.room);
};

const randomKey = () => Math.floor(Math.random() * 15 ** 7);

/**
 * Build one attendance row per active roster entry. These rows are the stable
 * register for the semester; proof evidence and query decisions layer on top.
 * The operation is idempotent so a retried start cannot duplicate rows.
 */
const snapshotRosterAttendance = async ({
  session,
  courseClass,
  room,
  teacherLocation = null,
  isDemo = false,
}) => {
  if (!isDbReady()) return { count: 0, enrollments: [] };
  const enrollments = await Enrollment.find({
    class: courseClass._id,
    status: "active",
  })
    .select("email name identity phoneLabel")
    .lean();

  if (!enrollments.length) {
    await CheckInSession.updateOne({ _id: session._id }, { $set: { rosterCount: 0 } });
    return { count: 0, enrollments: [] };
  }

  const emails = enrollments.map((entry) => String(entry.email).trim().toLowerCase());
  const users = await User.find({ email: { $in: emails } })
    .select("_id email name rollNumber")
    .lean();
  const userByEmail = new Map(users.map((user) => [String(user.email).toLowerCase(), user]));

  // Keep the roster linked to an account once it appears. The email remains
  // the key; this link only makes notifications and student views cheap.
  const linkedEnrollments = enrollments
    .map((entry) => {
      const user = userByEmail.get(String(entry.email).trim().toLowerCase());
      return user ? { email: entry.email, student: user._id } : null;
    })
    .filter(Boolean);
  if (linkedEnrollments.length) {
    await Enrollment.bulkWrite(
      linkedEnrollments.map((entry) => ({
        updateOne: {
          filter: { class: courseClass._id, email: entry.email },
          update: { $set: { student: entry.student } },
        },
      })),
      { ordered: false }
    ).catch(() => null);
  }

  const snapshot = sessionClassSnapshot(courseClass, room);
  const now = new Date();

  await AttendanceRecord.bulkWrite(
    enrollments.map((entry) => {
      const email = String(entry.email).trim().toLowerCase();
      const user = userByEmail.get(email) || null;
      return {
        updateOne: {
          filter: { session: session._id, studentEmail: email },
          update: {
            $setOnInsert: {
              session: session._id,
              courseClass: courseClass._id,
              teacher: session.teacher,
              student: user?._id || null,
              studentEmail: email,
              studentName: entry.name || user?.name || email.split("@")[0],
              rollNumber: entry.identity?.rollNumber || user?.rollNumber || "",
              classSnapshot: snapshot,
              status: "pending",
              source: "pending",
              teacherLocation,
              evidence: { proofCount: 0, waves: [] },
              isDemo,
              createdAt: now,
            },
          },
          upsert: true,
        },
      };
    }),
    { ordered: false }
  );

  const count = await AttendanceRecord.countDocuments({ session: session._id });
  await CheckInSession.updateOne(
    { _id: session._id },
    { $set: { rosterCount: count, "classSnapshot": snapshot } }
  );

  return { count, enrollments };
};

const queryWindowEnd = (closedAt, settings) => {
  const hours = Number(settings?.queryWindowHours) || QUERY_WINDOW_HOURS_DEFAULT;
  const start = closedAt ? new Date(closedAt) : new Date();
  return new Date(start.getTime() + hours * 60 * 60 * 1000);
};

/**
 * Lazily expire pending queries. MongoDB TTL cannot update status or emit
 * notifications, so the API calls this before reading and a small sweeper in
 * the server process calls it periodically. Each transition is atomic.
 */
const expireStaleQueries = async ({ now = new Date(), limit = 100 } = {}) => {
  if (!isDbReady()) return 0;
  const candidates = await AttendanceQuery.find({
    status: "pending",
    expiresAt: { $lte: now },
  })
    .select("_id teacher student studentEmail classSnapshot courseCode")
    .limit(limit)
    .lean();

  let expired = 0;
  for (const candidate of candidates) {
    /* eslint-disable no-await-in-loop */
    const updated = await AttendanceQuery.findOneAndUpdate(
      { _id: candidate._id, status: "pending", expiresAt: { $lte: now } },
      { $set: { status: "expired", expiredAt: now } },
      { new: true }
    );
    if (!updated) continue;
    expired += 1;

    const label = `${candidate.classSnapshot?.courseCode || "class"} · ${
      candidate.classSnapshot?.title || ""
    }`.trim();
    await AuditLog.create({
      action: "query.expired",
      entityType: "AttendanceQuery",
      entityId: String(updated._id),
      actorEmail: "system",
      actorRole: "system",
      summary: `Query auto-expired after the review window for ${candidate.studentEmail}.`,
      metadata: { classLabel: label, expiresAt: updated.expiresAt },
      isDemo: Boolean(updated.isDemo),
    }).catch(() => null);

    const notifications = [
      {
        user: updated.student,
        type: "query.expired",
        title: "Attendance query expired",
        message:
          "Your query passed the review window and was auto-rejected. Your teacher can still reopen it with an audit entry.",
        link: "/queries",
      },
      {
        user: updated.teacher,
        type: "query.expired",
        title: "Query expired without a decision",
        message: `${candidate.studentEmail}'s query for ${label || "a class"} expired automatically. You can still reopen it.`,
        link: "/queries",
      },
    ].filter((entry) => entry.user);

    if (notifications.length) {
      await Notification.insertMany(
        notifications.map((entry) => ({ ...entry, isDemo: Boolean(updated.isDemo) })),
        { ordered: false }
      ).catch(() => null);
    }
  }

  return expired;
};

const attendanceRecordView = (record) => ({
  id: String(record._id),
  student: record.student ? String(record.student) : null,
  studentEmail: record.studentEmail,
  studentName: record.studentName,
  rollNumber: record.rollNumber,
  classSnapshot: record.classSnapshot,
  status: record.status,
  source: record.source,
  markedAt: record.markedAt ? new Date(record.markedAt).toISOString() : null,
  markedByEmail: record.markedByEmail || "",
  decisionNote: record.decisionNote || "",
  query: record.query ? String(record.query) : null,
  attemptLocation: locationView(record.attemptLocation),
  teacherLocation: locationView(record.teacherLocation),
  evidence: {
    proofCount: record.evidence?.proofCount || 0,
    waves: Array.isArray(record.evidence?.waves) ? record.evidence.waves : [],
    firstProofAt: record.evidence?.firstProofAt
      ? new Date(record.evidence.firstProofAt).toISOString()
      : null,
    lastProofAt: record.evidence?.lastProofAt
      ? new Date(record.evidence.lastProofAt).toISOString()
      : null,
  },
  isDemo: Boolean(record.isDemo),
});

const summariseRecords = (records = []) => {
  const summary = { total: records.length, present: 0, absent: 0, pending: 0, excused: 0 };
  for (const record of records) {
    if (record.status === "present") summary.present += 1;
    else if (record.status === "absent") summary.absent += 1;
    else if (record.status === "excused") summary.excused += 1;
    else summary.pending += 1;
  }
  const decided = summary.present + summary.absent;
  summary.decided = decided;
  summary.percentage = decided > 0 ? Math.round((summary.present / decided) * 1000) / 10 : null;
  return summary;
};

const percentage = (present, absent) => {
  const decided = present + absent;
  return decided > 0 ? Math.round((present / decided) * 1000) / 10 : null;
};

const dateRange = (from, to) => {
  const range = {};
  if (from) {
    const start = new Date(from);
    if (!Number.isNaN(start.getTime())) range.$gte = start;
  }
  if (to) {
    const end = new Date(to);
    if (!Number.isNaN(end.getTime())) {
      // A date-only `to` should include the whole day.
      end.setHours(23, 59, 59, 999);
      range.$lte = end;
    }
  }
  return Object.keys(range).length ? range : null;
};

const resolveTermRange = async (query = {}) => {
  const settings = await getSettings();
  const from = query.from || settings.termStart || null;
  const to = query.to || settings.termEnd || null;
  return {
    from,
    to,
    termName: settings.termName || "",
    range: dateRange(from, to),
  };
};

module.exports = {
  QUERY_WINDOW_HOURS_DEFAULT,
  sessionClassSnapshot,
  classSnapshotForSession,
  snapshotRosterAttendance,
  queryWindowEnd,
  expireStaleQueries,
  attendanceRecordView,
  summariseRecords,
  percentage,
  dateRange,
  resolveTermRange,
  randomKey,
};
