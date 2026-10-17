const mongoose = require("mongoose");

const classSchema = new mongoose.Schema(
  {
    courseCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 40,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    section: {
      type: String,
      trim: true,
      default: "",
      maxlength: 40,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    defaultRoom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
  },
  { timestamps: true }
);

classSchema.index({ teacher: 1, courseCode: 1, section: 1 }, { unique: true });

module.exports = mongoose.model("CourseClass", classSchema);
