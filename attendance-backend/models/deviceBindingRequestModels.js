const mongoose = require("mongoose");

const deviceBindingRequestSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    fingerprint: {
      type: String,
      required: true,
    },
    publicKeyJwk: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: Date,
  },
  { timestamps: true }
);

deviceBindingRequestSchema.index({ student: 1, fingerprint: 1 }, { unique: true });

module.exports = mongoose.model("DeviceBindingRequest", deviceBindingRequestSchema);
