const { test } = require("node:test");
const assert = require("node:assert/strict");

const { DEFAULTS, buildSettingsUpdate } = require("../utils/settings");

test("a settings update never sets and inserts the same path", () => {
  const update = buildSettingsUpdate({
    queryWindowHours: 12,
    termName: "Spring 2027",
  });

  assert.equal(update.$set.queryWindowHours, 12);
  assert.equal(update.$set.termName, "Spring 2027");
  assert.equal(
    Object.prototype.hasOwnProperty.call(update.$setOnInsert, "queryWindowHours"),
    false
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(update.$setOnInsert, "termName"),
    false
  );
  assert.equal(update.$setOnInsert.key, DEFAULTS.key);
  assert.equal(update.$setOnInsert.geofenceRadiusMeters, DEFAULTS.geofenceRadiusMeters);
});

test("read-only document metadata is stripped and the actor is recorded", () => {
  const update = buildSettingsUpdate(
    {
      _id: "not-allowed",
      createdAt: "not-allowed",
      updatedAt: "not-allowed",
      __v: 9,
      allowStudentQueries: false,
    },
    "507f1f77bcf86cd799439011"
  );

  assert.deepEqual(update.$set, {
    allowStudentQueries: false,
    updatedBy: "507f1f77bcf86cd799439011",
  });
  assert.equal(Object.prototype.hasOwnProperty.call(update.$setOnInsert, "allowStudentQueries"), false);
});

test("every default is inserted when the patch is empty", () => {
  const update = buildSettingsUpdate({});

  assert.deepEqual(update.$set, {});
  assert.deepEqual(update.$setOnInsert, DEFAULTS);
});
