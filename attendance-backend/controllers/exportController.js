const mongoose = require("mongoose");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const catchAsyncError = require("../middleware/catchasyncerror");
const ErrorHandler = require("../utils/errorhandler");
const CourseClass = require("../models/classModels");
const CheckInSession = require("../models/checkInSessionModels");
const AttendanceRecord = require("../models/attendanceRecordModels");
const AttendanceQuery = require("../models/attendanceQueryModels");
const AuditLog = require("../models/auditLogModels");
const User = require("../models/userModels");
const { getSettings } = require("../utils/settings");
const { resolveTermRange, summariseRecords, percentage, expireStaleQueries } = require("../utils/attendance");
const { toAuditView } = require("../utils/audit");

const BRAND = { indigo: "#4f46e5", teal: "#0f766e", slate: "#334155", light: "#eef2ff" };

const safeFilename = (value) =>
  String(value || "bio-attend")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

const sendPdf = async (res, filename, build) => {
  res.set("Content-Type", "application/pdf");
  res.set("Content-Disposition", `attachment; filename="${filename}.pdf"`);
  res.set("Cache-Control", "no-store");
  const doc = new PDFDocument({ size: "A4", margin: 44, bufferPages: true });
  doc.pipe(res);
  build(doc);
  doc.end();
};

const sendXlsx = async (res, filename, workbook) => {
  res.set(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.set("Content-Disposition", `attachment; filename="${filename}.xlsx"`);
  res.set("Cache-Control", "no-store");
  await workbook.xlsx.write(res);
  res.end();
};

const heading = (doc, title, subtitle) => {
  doc.fillColor(BRAND.indigo).font("Helvetica-Bold").fontSize(19).text(title);
  doc.fillColor(BRAND.slate).font("Helvetica").fontSize(9).text(subtitle);
  doc.moveDown(0.8);
};

const sectionTitle = (doc, title) => {
  doc.fillColor(BRAND.indigo).font("Helvetica-Bold").fontSize(12).text(title);
  doc.moveDown(0.35);
};

const keyValue = (doc, label, value) => {
  doc.fillColor(BRAND.slate).font("Helvetica-Bold").fontSize(9).text(`${label}: `, { continued: true });
  doc.font("Helvetica").text(String(value ?? "—"));
};

const table = (doc, columns, rows) => {
  const pageWidth = doc.page.width - 88;
  const totalWeight = columns.reduce((sum, column) => sum + column.weight, 0);
  const widths = columns.map((column) => (column.weight / totalWeight) * pageWidth);
  const x0 = 44;

  const drawRow = (values, { header = false } = {}) => {
    const height = 18;
    if (doc.y + height > doc.page.height - 50) {
      doc.addPage();
    }
    const top = doc.y;
    doc.save();
    if (header) doc.fillColor(BRAND.indigo).rect(x0, top, pageWidth, height).fill();
    let x = x0;
    values.forEach((value, index) => {
      doc
        .fillColor(header ? "#ffffff" : BRAND.slate)
        .font(header ? "Helvetica-Bold" : "Helvetica")
        .fontSize(8.2)
        .text(String(value ?? ""), x + 4, top + 5, {
          width: widths[index] - 8,
          ellipsis: true,
          lineBreak: false,
        });
      x += widths[index];
    });
    doc.restore();
    doc.y = top + height;
    doc
      .strokeColor("#e2e8f0")
      .lineWidth(0.4)
      .moveTo(x0, doc.y)
      .lineTo(x0 + pageWidth, doc.y)
      .stroke();
  };

  drawRow(columns.map((column) => column.label), { header: true });
  rows.forEach((row) => drawRow(row));
  doc.moveDown(0.8);
};

const classReportData = async (user, query) => {
  const settings = await getSettings();
  const term = await resolveTermRange(query);
  const isAdmin = user.role === "superadmin";

  let classes = [];
  if (query.classId) {
    if (!mongoose.isValidObjectId(query.classId)) {
      throw new ErrorHandler("Class not found", 404);
    }
    const filter = { _id: query.classId };
    if (!isAdmin) filter.teacher = user._id;
    const courseClass = await CourseClass.findOne(filter).populate("defaultRoom", "roomNo");
    if (!courseClass) throw new ErrorHandler("Class not found", 404);
    classes = [courseClass];
  } else if (isAdmin) {
    classes = await CourseClass.find({}).populate("defaultRoom", "roomNo").sort({ courseCode: 1 });
  } else {
    throw new ErrorHandler("Choose one of your classes to export.", 400);
  }

  const reports = [];
  for (const courseClass of classes) {
    const sessionFilter = { courseClass: courseClass._id };
    if (query.from || query.to) {
      const range = {};
      if (query.from) range.$gte = new Date(query.from);
      if (query.to) {
        const end = new Date(query.to);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      sessionFilter.startedAt = range;
    }
    const sessions = await CheckInSession.find(sessionFilter).sort({ startedAt: 1 }).lean();
    const sessionIds = sessions.map((session) => session._id);
    const records = sessionIds.length
      ? await AttendanceRecord.find({ session: { $in: sessionIds } }).lean()
      : [];

    const students = new Map();
    for (const record of records) {
      if (!students.has(record.studentEmail)) {
        students.set(record.studentEmail, {
          email: record.studentEmail,
          name: record.studentName,
          roll: record.rollNumber,
          present: 0,
          absent: 0,
          pending: 0,
          excused: 0,
          total: 0,
        });
      }
      const entry = students.get(record.studentEmail);
      entry.total += 1;
      if (record.status === "present") entry.present += 1;
      else if (record.status === "absent") entry.absent += 1;
      else if (record.status === "excused") entry.excused += 1;
      else entry.pending += 1;
    }

    const studentRows = [...students.values()]
      .map((student) => ({
        ...student,
        percentage: percentage(student.present, student.absent),
      }))
      .sort((left, right) => String(left.roll).localeCompare(String(right.roll)));

    const summary = summariseRecords(records);
    const sessionsRows = sessions.map((session) => {
      const sessionRecords = records.filter((record) => String(record.session) === String(session._id));
      return {
        date: new Date(session.startedAt).toLocaleString(),
        status: session.status,
        finalized: session.attendanceFinalized ? "Yes" : "No",
        summary: summariseRecords(sessionRecords),
      };
    });

    reports.push({
      courseClass,
      sessions,
      records,
      studentRows,
      sessionsRows,
      summary,
      effectiveFrom: query.from || term.from,
      effectiveTo: query.to || term.to,
    });
  }

  return { reports, term, settings };
};

exports.attendancePdf = catchAsyncError(async (req, res) => {
  const { reports, term, settings } = await classReportData(req.user, req.query);
  const label = reports.map((report) => report.courseClass.courseCode).join("-") || "attendance";
  await sendPdf(res, safeFilename(`bio-attend-${label}`), (doc) => {
    heading(
      doc,
      "Bio Attend — attendance register",
      `${req.user.name || req.user.email} · Generated ${new Date().toLocaleString()} · Term ${term.termName || "—"}`
    );
    doc.fillColor(BRAND.teal).font("Helvetica-Bold").fontSize(9).text(
      "Teacher-confirmed register. Pending rows are not counted as absent until the session is finalised."
    );
    doc.moveDown(0.8);

    for (const report of reports) {
      const courseClass = report.courseClass;
      sectionTitle(doc, `${courseClass.courseCode}${courseClass.section ? ` · ${courseClass.section}` : ""} — ${courseClass.title}`);
      keyValue(doc, "Room", courseClass.defaultRoom?.roomNo || "—");
      keyValue(doc, "Range", `${report.effectiveFrom || "term start"} to ${report.effectiveTo || "now"}`);
      keyValue(
        doc,
        "Class average",
        report.summary.percentage === null ? "—" : `${report.summary.percentage}% (${report.summary.present}/${report.summary.decided})`
      );
      keyValue(doc, "Query window", `${settings.queryWindowHours}h after each session closes`);
      doc.moveDown(0.5);

      sectionTitle(doc, "Students");
      table(
        doc,
        [
          { label: "Roll", weight: 1.1 },
          { label: "Student", weight: 2.3 },
          { label: "Email", weight: 2.6 },
          { label: "Present", weight: 0.9 },
          { label: "Absent", weight: 0.9 },
          { label: "Pending", weight: 0.9 },
          { label: "%", weight: 0.8 },
        ],
        report.studentRows.map((student) => [
          student.roll || "—",
          student.name || "—",
          student.email,
          student.present,
          student.absent,
          student.pending,
          student.percentage === null ? "—" : `${student.percentage}%`,
        ])
      );

      sectionTitle(doc, "Sessions");
      table(
        doc,
        [
          { label: "Started", weight: 2.4 },
          { label: "Status", weight: 0.8 },
          { label: "Finalised", weight: 0.9 },
          { label: "Present", weight: 0.8 },
          { label: "Absent", weight: 0.8 },
          { label: "Pending", weight: 0.8 },
        ],
        report.sessionsRows.map((session) => [
          session.date,
          session.status,
          session.finalized,
          session.summary.present,
          session.summary.absent,
          session.summary.pending,
        ])
      );
    }
  });
});

exports.attendanceXlsx = catchAsyncError(async (req, res) => {
  const { reports, term, settings } = await classReportData(req.user, req.query);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Bio Attend";
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [
    { header: "Class", key: "class", width: 18 },
    { header: "Title", key: "title", width: 30 },
    { header: "Section", key: "section", width: 10 },
    { header: "Room", key: "room", width: 10 },
    { header: "Present", key: "present", width: 10 },
    { header: "Absent", key: "absent", width: 10 },
    { header: "Pending", key: "pending", width: 10 },
    { header: "Percentage", key: "percentage", width: 12 },
  ];
  for (const report of reports) {
    summarySheet.addRow({
      class: report.courseClass.courseCode,
      title: report.courseClass.title,
      section: report.courseClass.section,
      room: report.courseClass.defaultRoom?.roomNo || "",
      present: report.summary.present,
      absent: report.summary.absent,
      pending: report.summary.pending,
      percentage: report.summary.percentage,
    });
  }
  summarySheet.addRow({});
  summarySheet.addRow({ class: "Term", title: term.termName || "—" });
  summarySheet.addRow({ class: "Query window", title: `${settings.queryWindowHours} hours` });
  summarySheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  summarySheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };

  const studentsSheet = workbook.addWorksheet("Students");
  studentsSheet.columns = [
    { header: "Class", key: "class", width: 14 },
    { header: "Roll", key: "roll", width: 14 },
    { header: "Student", key: "name", width: 26 },
    { header: "Email", key: "email", width: 32 },
    { header: "Present", key: "present", width: 9 },
    { header: "Absent", key: "absent", width: 9 },
    { header: "Excused", key: "excused", width: 9 },
    { header: "Pending", key: "pending", width: 9 },
    { header: "Sessions", key: "total", width: 9 },
    { header: "Percentage", key: "percentage", width: 11 },
  ];
  for (const report of reports) {
    for (const student of report.studentRows) {
      studentsSheet.addRow({
        class: report.courseClass.courseCode,
        ...student,
      });
    }
  }
  studentsSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  studentsSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };

  const sessionsSheet = workbook.addWorksheet("Sessions");
  sessionsSheet.columns = [
    { header: "Class", key: "class", width: 14 },
    { header: "Started", key: "started", width: 24 },
    { header: "Closed", key: "closed", width: 24 },
    { header: "Status", key: "status", width: 10 },
    { header: "Finalised", key: "finalised", width: 10 },
    { header: "Present", key: "present", width: 9 },
    { header: "Absent", key: "absent", width: 9 },
    { header: "Pending", key: "pending", width: 9 },
    { header: "Percentage", key: "percentage", width: 11 },
  ];
  for (const report of reports) {
    for (const session of report.sessionsRows) {
      sessionsSheet.addRow({
        class: report.courseClass.courseCode,
        started: session.date,
        status: session.status,
        finalised: session.finalized,
        present: session.summary.present,
        absent: session.summary.absent,
        pending: session.summary.pending,
        percentage: session.summary.percentage,
      });
    }
  }
  sessionsSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sessionsSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };

  const rawSheet = workbook.addWorksheet("Raw rows");
  rawSheet.columns = [
    { header: "Class", key: "class", width: 14 },
    { header: "Session", key: "session", width: 24 },
    { header: "Roll", key: "roll", width: 14 },
    { header: "Student", key: "name", width: 26 },
    { header: "Email", key: "email", width: 32 },
    { header: "Status", key: "status", width: 10 },
    { header: "Source", key: "source", width: 10 },
    { header: "Proofs", key: "proofs", width: 9 },
    { header: "Marked at", key: "markedAt", width: 22 },
  ];
  for (const report of reports) {
    const sessionMap = new Map(report.sessions.map((session) => [String(session._id), session]));
    for (const record of report.records) {
      const session = sessionMap.get(String(record.session));
      rawSheet.addRow({
        class: report.courseClass.courseCode,
        session: session ? new Date(session.startedAt).toLocaleString() : String(record.session),
        roll: record.rollNumber,
        name: record.studentName,
        email: record.studentEmail,
        status: record.status,
        source: record.source,
        proofs: record.evidence?.proofCount || 0,
        markedAt: record.markedAt ? new Date(record.markedAt).toLocaleString() : "",
      });
    }
  }
  rawSheet.getRow(1).font = { bold: true };

  await sendXlsx(res, safeFilename(`bio-attend-${reports.map((r) => r.courseClass.courseCode).join("-") || "attendance"}`), workbook);
});

const queryReportData = async (user, query) => {
  await expireStaleQueries();
  const filter = {};
  if (user.role !== "superadmin") filter.teacher = user._id;
  if (query.status) filter.status = String(query.status);
  if (query.from || query.to) {
    const range = {};
    if (query.from) range.$gte = new Date(query.from);
    if (query.to) {
      const end = new Date(query.to);
      end.setHours(23, 59, 59, 999);
      range.$lte = end;
    }
    filter.createdAt = range;
  }
  return AttendanceQuery.find(filter).sort({ createdAt: -1 }).limit(2000).lean();
};

exports.queriesPdf = catchAsyncError(async (req, res) => {
  const queries = await queryReportData(req.user, req.query);
  await sendPdf(res, safeFilename(`bio-attend-queries-${Date.now()}`), (doc) => {
    heading(doc, "Bio Attend — attendance queries", `${req.user.name || req.user.email} · ${new Date().toLocaleString()}`);
    table(
      doc,
      [
        { label: "Created", weight: 1.8 },
        { label: "Student", weight: 2 },
        { label: "Class", weight: 1.3 },
        { label: "Status", weight: 0.9 },
        { label: "Distance", weight: 0.9 },
        { label: "Reason", weight: 3.4 },
      ],
      queries.map((query) => [
        new Date(query.createdAt).toLocaleString(),
        query.studentEmail,
        `${query.classSnapshot?.courseCode || ""}${query.classSnapshot?.section ? ` · ${query.classSnapshot.section}` : ""}`,
        query.status,
        query.distanceMeters === null || query.distanceMeters === undefined ? "—" : `${query.distanceMeters} m`,
        query.reason,
      ])
    );
  });
});

exports.queriesXlsx = catchAsyncError(async (req, res) => {
  const queries = await queryReportData(req.user, req.query);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Queries");
  sheet.columns = [
    { header: "Created", key: "created", width: 22 },
    { header: "Student", key: "student", width: 28 },
    { header: "Roll", key: "roll", width: 14 },
    { header: "Class", key: "class", width: 16 },
    { header: "Status", key: "status", width: 10 },
    { header: "Distance (m)", key: "distance", width: 12 },
    { header: "Within radius", key: "within", width: 12 },
    { header: "Location", key: "location", width: 24 },
    { header: "Reason", key: "reason", width: 50 },
    { header: "Decision note", key: "decisionNote", width: 32 },
  ];
  for (const query of queries) {
    sheet.addRow({
      created: new Date(query.createdAt).toLocaleString(),
      student: query.studentName || query.studentEmail,
      roll: query.rollNumber || "",
      class: `${query.classSnapshot?.courseCode || ""}${query.classSnapshot?.section ? ` · ${query.classSnapshot.section}` : ""}`,
      status: query.status,
      distance: query.distanceMeters ?? "",
      within: query.withinRadius === null ? "" : query.withinRadius ? "Yes" : "No",
      location: query.studentLocation?.latitude
        ? `${query.studentLocation.latitude.toFixed(6)}, ${query.studentLocation.longitude.toFixed(6)}`
        : "",
      reason: query.reason,
      decisionNote: query.decisionNote || "",
    });
  }
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  await sendXlsx(res, safeFilename(`bio-attend-queries-${Date.now()}`), workbook);
});

exports.auditXlsx = catchAsyncError(async (req, res) => {
  const logs = await AuditLog.find({}).sort({ createdAt: -1 }).limit(5000).lean();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Audit log");
  sheet.columns = [
    { header: "Timestamp", key: "createdAt", width: 24 },
    { header: "Action", key: "action", width: 28 },
    { header: "Actor", key: "actor", width: 28 },
    { header: "Role", key: "role", width: 12 },
    { header: "Entity", key: "entity", width: 26 },
    { header: "Summary", key: "summary", width: 58 },
    { header: "Impersonator", key: "impersonator", width: 26 },
  ];
  for (const log of logs.map(toAuditView)) {
    sheet.addRow({
      createdAt: log.createdAt ? new Date(log.createdAt).toLocaleString() : "",
      action: log.action,
      actor: log.actorEmail,
      role: log.actorRole,
      entity: `${log.entityType} ${log.entityId}`.trim(),
      summary: log.summary,
      impersonator: log.impersonatorEmail,
    });
  }
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  await sendXlsx(res, safeFilename(`bio-attend-audit-${Date.now()}`), workbook);
});

exports.sessionPdf = catchAsyncError(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.sessionId)) {
    return next(new ErrorHandler("Session not found", 404));
  }
  const filter = { _id: req.params.sessionId };
  if (req.user.role !== "superadmin") filter.teacher = req.user._id;
  const session = await CheckInSession.findOne(filter)
    .populate("courseClass", "courseCode title section")
    .populate("room", "roomNo");
  if (!session) return next(new ErrorHandler("Session not found", 404));
  const records = await AttendanceRecord.find({ session: session._id }).sort({ rollNumber: 1 });
  const summary = summariseRecords(records);

  await sendPdf(res, safeFilename(`bio-attend-session-${session._id}`), (doc) => {
    heading(
      doc,
      "Bio Attend — session register",
      `${session.classSnapshot?.courseCode || session.courseClass?.courseCode || "Class"} · ${new Date(session.startedAt).toLocaleString()}`
    );
    keyValue(doc, "Room", session.room?.roomNo || session.classSnapshot?.roomNo || "—");
    keyValue(doc, "Status", session.status);
    keyValue(doc, "Finalised", session.attendanceFinalized ? "Yes" : "No");
    keyValue(doc, "Present", summary.present);
    keyValue(doc, "Absent", summary.absent);
    keyValue(doc, "Pending", summary.pending);
    doc.moveDown(0.8);
    table(
      doc,
      [
        { label: "Roll", weight: 1.1 },
        { label: "Student", weight: 2.3 },
        { label: "Email", weight: 2.6 },
        { label: "Status", weight: 1 },
        { label: "Source", weight: 1 },
        { label: "Proofs", weight: 0.8 },
      ],
      records.map((record) => [
        record.rollNumber || "—",
        record.studentName || "—",
        record.studentEmail,
        record.status,
        record.source,
        record.evidence?.proofCount || 0,
      ])
    );
  });
});

exports.sessionXlsx = catchAsyncError(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.sessionId)) {
    return next(new ErrorHandler("Session not found", 404));
  }
  const filter = { _id: req.params.sessionId };
  if (req.user.role !== "superadmin") filter.teacher = req.user._id;
  const session = await CheckInSession.findOne(filter)
    .populate("courseClass", "courseCode title section")
    .populate("room", "roomNo");
  if (!session) return next(new ErrorHandler("Session not found", 404));
  const records = await AttendanceRecord.find({ session: session._id }).sort({ rollNumber: 1 });
  const summary = summariseRecords(records);

  const workbook = new ExcelJS.Workbook();
  const summarySheet = workbook.addWorksheet("Session");
  summarySheet.columns = [
    { header: "Field", key: "field", width: 24 },
    { header: "Value", key: "value", width: 48 },
  ];
  summarySheet.addRows([
    { field: "Class", value: `${session.classSnapshot?.courseCode || ""} — ${session.classSnapshot?.title || ""}` },
    { field: "Started", value: new Date(session.startedAt).toLocaleString() },
    { field: "Closed", value: session.closedAt ? new Date(session.closedAt).toLocaleString() : "" },
    { field: "Room", value: session.room?.roomNo || session.classSnapshot?.roomNo || "" },
    { field: "Status", value: session.status },
    { field: "Finalised", value: session.attendanceFinalized ? "Yes" : "No" },
    { field: "Present", value: summary.present },
    { field: "Absent", value: summary.absent },
    { field: "Pending", value: summary.pending },
    { field: "Percentage", value: summary.percentage ?? "" },
  ]);
  summarySheet.getRow(1).font = { bold: true };

  const roster = workbook.addWorksheet("Roster");
  roster.columns = [
    { header: "Roll", key: "roll", width: 14 },
    { header: "Student", key: "student", width: 26 },
    { header: "Email", key: "email", width: 32 },
    { header: "Status", key: "status", width: 10 },
    { header: "Source", key: "source", width: 10 },
    { header: "Proofs", key: "proofs", width: 9 },
    { header: "Note", key: "note", width: 40 },
  ];
  for (const record of records) {
    roster.addRow({
      roll: record.rollNumber,
      student: record.studentName,
      email: record.studentEmail,
      status: record.status,
      source: record.source,
      proofs: record.evidence?.proofCount || 0,
      note: record.decisionNote,
    });
  }
  roster.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  roster.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };

  await sendXlsx(res, safeFilename(`bio-attend-session-${session._id}`), workbook);
});

exports.exportUsersXlsx = catchAsyncError(async (req, res) => {
  const users = await User.find({}).sort({ role: 1, name: 1 }).lean();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Users");
  sheet.columns = [
    { header: "Name", key: "name", width: 26 },
    { header: "Email", key: "email", width: 34 },
    { header: "Role", key: "role", width: 12 },
    { header: "Status", key: "status", width: 10 },
    { header: "Demo", key: "demo", width: 8 },
    { header: "Roll", key: "roll", width: 14 },
    { header: "Phone label", key: "phone", width: 22 },
    { header: "Created", key: "created", width: 22 },
  ];
  for (const user of users) {
    sheet.addRow({
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status || "active",
      demo: user.isDemo ? "Yes" : "No",
      roll: user.rollNumber || "",
      phone: user.phoneLabel || "",
      created: user.createdAt ? new Date(user.createdAt).toLocaleString() : "",
    });
  }
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  await sendXlsx(res, safeFilename(`bio-attend-users-${Date.now()}`), workbook);
});
