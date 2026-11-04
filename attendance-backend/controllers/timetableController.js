const mongoose = require("mongoose");
const catchAsyncError = require("../middleware/catchasyncerror");
const ErrorHandler = require("../utils/errorhandler");
const Timetable = require("../models/timetableModels");
const CourseClass = require("../models/classModels");
const Enrollment = require("../models/enrollmentModels");
const { writeAudit } = require("../utils/audit");
const { getSettings } = require("../utils/settings");
const { DAYS } = require("../models/timetableModels");

const POPULATE = [
  { path: "courseClass", select: "courseCode title section teacher defaultRoom", populate: { path: "defaultRoom", select: "roomNo" } },
  { path: "room", select: "roomNo" },
  { path: "teacher", select: "name email" },
];

const timetableView = (entry) => ({
  id: String(entry._id),
  dayOfWeek: entry.dayOfWeek,
  dayName: DAYS[entry.dayOfWeek] || "",
  startTime: entry.startTime,
  endTime: entry.endTime,
  term: entry.term || "",
  active: Boolean(entry.active),
  room: entry.room ? { id: String(entry.room._id), roomNo: entry.room.roomNo } : null,
  class: entry.courseClass
    ? {
        id: String(entry.courseClass._id),
        courseCode: entry.courseClass.courseCode,
        title: entry.courseClass.title,
        section: entry.courseClass.section || "",
        roomNo: entry.courseClass.defaultRoom?.roomNo || "",
        teacher: entry.teacher
          ? { id: String(entry.teacher._id || entry.teacher), name: entry.teacher.name || "", email: entry.teacher.email || "" }
          : null,
      }
    : null,
  isDemo: Boolean(entry.isDemo),
});

const parseEntry = async (body, user, settings, next) => {
  const classId = body.classId || body.courseClass;
  if (!classId || !mongoose.isValidObjectId(classId)) {
    next(new ErrorHandler("Select a class for this timetable entry.", 400));
    return null;
  }
  const courseClass = await CourseClass.findById(classId);
  if (!courseClass) {
    next(new ErrorHandler("Class not found", 404));
    return null;
  }
  if (user.role !== "superadmin" && String(courseClass.teacher) !== String(user._id)) {
    next(new ErrorHandler("You do not own this class.", 403));
    return null;
  }

  const dayOfWeek = Number(body.dayOfWeek);
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    next(new ErrorHandler("Choose a weekday.", 400));
    return null;
  }
  const startTime = String(body.startTime || "").trim();
  const endTime = String(body.endTime || "").trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) {
    next(new ErrorHandler("Use 24-hour times such as 09:30 and 10:50.", 400));
    return null;
  }
  if (startTime >= endTime) {
    next(new ErrorHandler("End time must be after start time.", 400));
    return null;
  }

  return {
    courseClass: courseClass._id,
    teacher: courseClass.teacher,
    room: body.roomId && mongoose.isValidObjectId(body.roomId) ? body.roomId : courseClass.defaultRoom || null,
    dayOfWeek,
    startTime,
    endTime,
    term: String(body.term || settings.termName || "").slice(0, 80),
    active: body.active === undefined ? true : Boolean(body.active),
    isDemo: Boolean(user.isDemo || courseClass.isDemo),
  };
};

exports.listTimetable = catchAsyncError(async (req, res) => {
  const settings = await getSettings();
  let filter = { active: { $ne: false } };
  if (req.user.role === "teacher") filter.teacher = req.user._id;
  if (req.user.role === "student") {
    const classIds = await Enrollment.distinct("class", {
      email: String(req.user.email || "").trim().toLowerCase(),
      status: "active",
    });
    filter.courseClass = { $in: classIds };
  }
  if (req.query.classId && mongoose.isValidObjectId(req.query.classId)) {
    filter.courseClass = req.query.classId;
  }

  const entries = await Timetable.find(filter).populate(POPULATE).sort({
    dayOfWeek: 1,
    startTime: 1,
  });

  res.status(200).json({
    success: true,
    term: settings.termName,
    days: DAYS,
    entries: entries.map(timetableView),
  });
});

exports.createTimetable = catchAsyncError(async (req, res, next) => {
  const settings = await getSettings();
  const parsed = await parseEntry(req.body, req.user, settings, next);
  if (!parsed) return;

  const entry = await Timetable.create(parsed);
  await entry.populate(POPULATE);

  await writeAudit(req, {
    action: "timetable.created",
    entityType: "Timetable",
    entityId: entry._id,
    summary: `Added ${DAYS[entry.dayOfWeek]} ${entry.startTime}-${entry.endTime} timetable slot.`,
    isDemo: entry.isDemo,
  });

  res.status(201).json({ success: true, entry: timetableView(entry) });
});

exports.updateTimetable = catchAsyncError(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.entryId)) {
    return next(new ErrorHandler("Timetable entry not found", 404));
  }
  const entry = await Timetable.findById(req.params.entryId);
  if (!entry) return next(new ErrorHandler("Timetable entry not found", 404));
  if (req.user.role !== "superadmin" && String(entry.teacher) !== String(req.user._id)) {
    return next(new ErrorHandler("You do not own this timetable entry.", 403));
  }

  const settings = await getSettings();
  const merged = {
    classId: req.body.classId || String(entry.courseClass),
    dayOfWeek: req.body.dayOfWeek ?? entry.dayOfWeek,
    startTime: req.body.startTime ?? entry.startTime,
    endTime: req.body.endTime ?? entry.endTime,
    roomId: req.body.roomId || entry.room,
    term: req.body.term ?? entry.term,
    active: req.body.active ?? entry.active,
  };
  const parsed = await parseEntry(merged, req.user, settings, next);
  if (!parsed) return;

  Object.assign(entry, parsed);
  await entry.save();
  await entry.populate(POPULATE);

  await writeAudit(req, {
    action: "timetable.updated",
    entityType: "Timetable",
    entityId: entry._id,
    summary: `Updated ${DAYS[entry.dayOfWeek]} ${entry.startTime}-${entry.endTime} timetable slot.`,
    isDemo: entry.isDemo,
  });

  res.status(200).json({ success: true, entry: timetableView(entry) });
});

exports.deleteTimetable = catchAsyncError(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.entryId)) {
    return next(new ErrorHandler("Timetable entry not found", 404));
  }
  const entry = await Timetable.findById(req.params.entryId);
  if (!entry) return next(new ErrorHandler("Timetable entry not found", 404));
  if (req.user.role !== "superadmin" && String(entry.teacher) !== String(req.user._id)) {
    return next(new ErrorHandler("You do not own this timetable entry.", 403));
  }

  await entry.deleteOne();
  await writeAudit(req, {
    action: "timetable.deleted",
    entityType: "Timetable",
    entityId: entry._id,
    summary: `Deleted ${DAYS[entry.dayOfWeek]} ${entry.startTime}-${entry.endTime} timetable slot.`,
    isDemo: entry.isDemo,
  });
  res.status(200).json({ success: true });
});
