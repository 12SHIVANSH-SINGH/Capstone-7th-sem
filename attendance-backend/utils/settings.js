const SystemSetting = require("../models/systemSettingModels");
const { isDbReady } = require("./dbReady");

const DEFAULTS = Object.freeze({
  key: "global",
  queryWindowHours: 24,
  geofenceRadiusMeters: 30,
  lateGraceMinutes: 10,
  requireQueryLocation: false,
  allowStudentQueries: true,
  demoModeEnabled: true,
  termName: "Autumn 2026",
  termStart: null,
  termEnd: null,
});

const getSettings = async () => {
  if (!isDbReady()) return { ...DEFAULTS };
  const settings = await SystemSetting.findOneAndUpdate(
    { key: "global" },
    { $setOnInsert: DEFAULTS },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return settings;
};

const buildSettingsUpdate = (updates, updatedBy = null) => {
  const allowed = [
    "queryWindowHours",
    "geofenceRadiusMeters",
    "lateGraceMinutes",
    "requireQueryLocation",
    "allowStudentQueries",
    "demoModeEnabled",
    "termName",
    "termStart",
    "termEnd",
  ];

  const patch = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) patch[key] = updates[key];
  }
  if (updatedBy) patch.updatedBy = updatedBy;

  // MongoDB rejects a single update where $set and $setOnInsert touch the
  // same path ("would create a conflict"). Only insert defaults for fields
  // this request is not already setting.
  const insertDefaults = {};
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) insertDefaults[key] = value;
  }

  return { $set: patch, $setOnInsert: insertDefaults };
};

const updateSettings = async (updates, updatedBy = null) => {
  if (!isDbReady()) return { ...DEFAULTS, ...updates };

  return SystemSetting.findOneAndUpdate(
    { key: "global" },
    buildSettingsUpdate(updates, updatedBy),
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
};

const settingsView = (settings) => ({
  queryWindowHours: settings?.queryWindowHours ?? DEFAULTS.queryWindowHours,
  geofenceRadiusMeters: settings?.geofenceRadiusMeters ?? DEFAULTS.geofenceRadiusMeters,
  lateGraceMinutes: settings?.lateGraceMinutes ?? DEFAULTS.lateGraceMinutes,
  requireQueryLocation: settings?.requireQueryLocation ?? DEFAULTS.requireQueryLocation,
  allowStudentQueries: settings?.allowStudentQueries ?? DEFAULTS.allowStudentQueries,
  demoModeEnabled: settings?.demoModeEnabled ?? DEFAULTS.demoModeEnabled,
  termName: settings?.termName ?? DEFAULTS.termName,
  termStart: settings?.termStart ? new Date(settings.termStart).toISOString() : null,
  termEnd: settings?.termEnd ? new Date(settings.termEnd).toISOString() : null,
  updatedAt: settings?.updatedAt ? new Date(settings.updatedAt).toISOString() : null,
});

module.exports = {
  DEFAULTS,
  buildSettingsUpdate,
  getSettings,
  updateSettings,
  settingsView,
};
