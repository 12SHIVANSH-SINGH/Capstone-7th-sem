const mongoose = require("mongoose");
const { MAX_KEY_VALUE, MAX_WAVE } = require("../utils/checkInSession");
const { PROOF_MESSAGE_VERSION, SIGNATURE_BASE64 } = require("../utils/checkInProof");

/**
 * Evidence that one student's phone decoded one wave of a check-in.
 *
 * There is intentionally no attendance/score/status field. Transport records
 * what arrived; scoring and the ID round are separate, gated layers. The
 * student email and device fingerprint are snapshots so a later account or
 * device-key change cannot rewrite what was submitted.
 */
const checkInProofSchema = new mongoose.Schema(
  {
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CheckInSession",
      required: true,
      index: true,
    },
    courseClass: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourseClass",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    studentEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    deviceFingerprint: {
      type: String,
      required: true,
    },
    wave: {
      type: Number,
      required: true,
      min: 0,
      max: MAX_WAVE,
    },
    key: {
      type: Number,
      required: true,
      min: 0,
      max: MAX_KEY_VALUE,
    },
    // The raw P-256 signature is kept as evidence that the approved device
    // produced this payload. It is never included in an API response.
    signature: {
      type: String,
      required: true,
      match: SIGNATURE_BASE64,
    },
    protocolVersion: {
      type: String,
      required: true,
      default: PROOF_MESSAGE_VERSION,
    },
  },
  { timestamps: true }
);

// One piece of evidence per student per wave. A retry must be idempotent, and
// a phone that hears the same wave repeatedly must not inflate the record.
checkInProofSchema.index(
  { session: 1, student: 1, wave: 1 },
  { unique: true, name: "one_proof_per_student_wave" }
);

// Future wave summaries read by session and wave; the index stays useful after
// scoring exists without implying that any proof counts as attendance.
checkInProofSchema.index({ session: 1, wave: 1 });

// Proof evidence contains the student email, device fingerprint, session/wave/
// key, signature and protocol version. The 1-day promise applies to this whole
// record; no GPS or IP is stored here.
checkInProofSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 24 * 60 * 60, name: "proof_retention_1_day" }
);

module.exports = mongoose.model("CheckInProof", checkInProofSchema);
