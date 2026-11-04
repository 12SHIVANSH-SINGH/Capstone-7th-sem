const mongoose = require("mongoose");

/**
 * One document holds the live system settings. Keeping a singleton avoids a
 * scatter of feature flags in environment variables that need a redeploy.
 */
const systemSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    queryWindowHours: { type: Number, default: 24, min: 1, max: 168 },
    geofenceRadiusMeters: { type: Number, default: 30, min: 1, max: 1000 },
    lateGraceMinutes: { type: Number, default: 10, min: 0, max: 120 },
    requireQueryLocation: { type: Boolean, default: false },
    allowStudentQueries: { type: Boolean, default: true },
    demoModeEnabled: { type: Boolean, default: true },
    termName: { type: String, trim: true, maxlength: 80, default: "Autumn 2026" },
    termStart: { type: Date, default: null },
    termEnd: { type: Date, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

const SystemSetting = mongoose.model("SystemSetting", systemSettingSchema);

module.exports = SystemSetting;
