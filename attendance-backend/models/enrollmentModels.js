const mongoose = require("mongoose");

const enrollmentSchema = new mongoose.Schema(
  {
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourseClass",
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      trim: true,
      default: "",
      maxlength: 120,
    },
    identity: {
      loginId: String,
      batch: String,
      programmeBranch: String,
      rollNumber: String,
    },
    // Optional link to a real or demo student account. The email remains the
    // roster key so a roster can be uploaded before the student first signs in.
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    phoneLabel: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
    rosterUpdatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

enrollmentSchema.index({ class: 1, email: 1 }, { unique: true });

module.exports = mongoose.model("Enrollment", enrollmentSchema);
