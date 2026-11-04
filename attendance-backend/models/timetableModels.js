const mongoose = require("mongoose");

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const timetableSchema = new mongoose.Schema(
  {
    courseClass: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourseClass",
      required: true,
      index: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", default: null },
    dayOfWeek: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
      index: true,
    },
    startTime: {
      type: String,
      required: true,
      match: TIME_PATTERN,
    },
    endTime: {
      type: String,
      required: true,
      match: TIME_PATTERN,
    },
    term: { type: String, trim: true, maxlength: 80, default: "" },
    active: { type: Boolean, default: true, index: true },
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

timetableSchema.pre("validate", function validateTimes(next) {
  if (this.startTime && this.endTime && this.startTime >= this.endTime) {
    return next(new Error("End time must be after start time."));
  }
  return next();
});

timetableSchema.index({ teacher: 1, dayOfWeek: 1, startTime: 1 });
timetableSchema.index({ courseClass: 1, dayOfWeek: 1, startTime: 1 });

const Timetable = mongoose.model("Timetable", timetableSchema);

module.exports = Timetable;
module.exports.DAYS = DAYS;
module.exports.TIME_PATTERN = TIME_PATTERN;
