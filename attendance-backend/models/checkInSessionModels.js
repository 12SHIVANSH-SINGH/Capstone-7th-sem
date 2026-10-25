const mongoose = require("mongoose");
const {
  MAX_KEY_VALUE,
  INITIAL_WAVE,
  MAX_WAVE,
  SESSION_STATUSES,
  STATUS_ACTIVE,
} = require("../utils/checkInSession");

const checkInSessionSchema = new mongoose.Schema(
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
    // Snapshot the room at start time. Renaming a room later must not rewrite
    // where an old check-in happened.
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    status: {
      type: String,
      enum: SESSION_STATUSES,
      default: STATUS_ACTIVE,
      index: true,
    },
    wave: {
      type: Number,
      default: INITIAL_WAVE,
      min: 0,
      max: MAX_WAVE,
      // min/max accept 1.5, so the integer check is explicit.
      validate: {
        validator: Number.isInteger,
        message: "wave must be a non-negative integer.",
      },
    },
    key: {
      type: Number,
      required: true,
      min: 0,
      max: MAX_KEY_VALUE,
    },
    keyIssuedAt: {
      type: Date,
      required: true,
    },
    keyExpiresAt: {
      type: Date,
      required: true,
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    closedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// At most one active check-in per class. The partial filter leaves closed
// sessions in place as history. The controller also checks first and turns the
// rare concurrent-create duplicate into a clear 409.
checkInSessionSchema.index(
  { courseClass: 1 },
  {
    unique: true,
    partialFilterExpression: { status: STATUS_ACTIVE },
    name: "one_active_check_in_per_class",
  }
);

checkInSessionSchema.index({ courseClass: 1, startedAt: -1 });

module.exports = mongoose.model("CheckInSession", checkInSessionSchema);
