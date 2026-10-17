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
