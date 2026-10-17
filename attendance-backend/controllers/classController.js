const mongoose = require("mongoose");
const catchAsyncError = require("../middleware/catchasyncerror");
const ErrorHandler = require("../utils/errorhandler");
const CourseClass = require("../models/classModels");
const Enrollment = require("../models/enrollmentModels");
const { Location } = require("../models/locationModels");
const { parseRosterText } = require("../utils/roster");

const getOwnedClass = async (classId, teacherId, next) => {
  if (!mongoose.isValidObjectId(classId)) {
    return next(new ErrorHandler("Class not found", 404));
  }

  const courseClass = await CourseClass.findOne({ _id: classId, teacher: teacherId });
  if (!courseClass) {
    return next(new ErrorHandler("Class not found", 404));
  }

  return courseClass;
};

exports.listRooms = catchAsyncError(async (req, res) => {
  const rooms = await Location.find({}).select("roomNo createdAt").sort({ roomNo: 1 });
  res.status(200).json({ success: true, rooms });
});

exports.createClass = catchAsyncError(async (req, res, next) => {
  const { courseCode, title, section = "", roomId } = req.body;

  if (!courseCode || !title || !roomId) {
    return next(new ErrorHandler("Course code, title, and room are required", 400));
  }

  if (!mongoose.isValidObjectId(roomId) || !(await Location.exists({ _id: roomId }))) {
    return next(new ErrorHandler("Select an existing room", 400));
  }

  const courseClass = await CourseClass.create({
    courseCode,
    title,
    section,
    defaultRoom: roomId,
    teacher: req.user._id,
  });

  await courseClass.populate("defaultRoom", "roomNo");
  res.status(201).json({ success: true, courseClass });
});

exports.listClasses = catchAsyncError(async (req, res) => {
  const classes = await CourseClass.find({ teacher: req.user._id })
    .populate("defaultRoom", "roomNo")
    .sort({ createdAt: -1 });

  const counts = await Enrollment.aggregate([
    { $match: { class: { $in: classes.map((courseClass) => courseClass._id) }, status: "active" } },
    { $group: { _id: "$class", count: { $sum: 1 } } },
  ]);
  const countsByClass = new Map(counts.map((count) => [count._id.toString(), count.count]));

  res.status(200).json({
    success: true,
    classes: classes.map((courseClass) => ({
      ...courseClass.toObject(),
      activeStudentCount: countsByClass.get(courseClass._id.toString()) || 0,
    })),
  });
});

exports.previewRoster = catchAsyncError(async (req, res, next) => {
  const courseClass = await getOwnedClass(req.params.classId, req.user._id, next);
  if (!courseClass) return;

  const preview = parseRosterText(req.body.rosterText);
  res.status(200).json({ success: true, preview });
});

exports.replaceRoster = catchAsyncError(async (req, res, next) => {
  const courseClass = await getOwnedClass(req.params.classId, req.user._id, next);
  if (!courseClass) return;

  const { entries, errors } = parseRosterText(req.body.rosterText);
  if (errors.length > 0) {
    return next(new ErrorHandler("Fix roster validation errors before saving", 400));
  }
  if (entries.length === 0) {
    return next(new ErrorHandler("A class must have at least one student", 400));
  }

  const updatedAt = new Date();
  await Enrollment.bulkWrite(
    entries.map((entry) => ({
      updateOne: {
        filter: { class: courseClass._id, email: entry.email },
        update: {
          $set: {
            name: entry.name,
            identity: entry.identity,
            status: "active",
            rosterUpdatedAt: updatedAt,
          },
          $setOnInsert: { class: courseClass._id, email: entry.email },
        },
        upsert: true,
      },
    }))
  );

  await Enrollment.updateMany(
    { class: courseClass._id, email: { $nin: entries.map((entry) => entry.email) } },
    { $set: { status: "inactive", rosterUpdatedAt: updatedAt } }
  );

  const activeStudentCount = await Enrollment.countDocuments({ class: courseClass._id, status: "active" });
  res.status(200).json({
    success: true,
    message: "Roster saved",
    activeStudentCount,
  });
});

exports.getRoster = catchAsyncError(async (req, res, next) => {
  const courseClass = await getOwnedClass(req.params.classId, req.user._id, next);
  if (!courseClass) return;

  const enrollments = await Enrollment.find({ class: courseClass._id, status: "active" })
    .sort({ "identity.rollNumber": 1, email: 1 });
  res.status(200).json({ success: true, enrollments });
});
