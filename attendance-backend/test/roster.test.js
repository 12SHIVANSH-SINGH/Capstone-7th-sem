const test = require("node:test");
const assert = require("node:assert/strict");
const { parseRosterText } = require("../utils/roster");

test("accepts a CSV header and derives identity fields from a college email", () => {
  const { entries, errors } = parseRosterText(
    "email,name\n2023ugcs059@nitjsr.ac.in,Shivansh Singh"
  );

  assert.deepEqual(errors, []);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].email, "2023ugcs059@nitjsr.ac.in");
  assert.deepEqual(entries[0].identity, {
    loginId: "2023ugcs059",
    batch: "2023",
    programmeBranch: "UGCS",
    rollNumber: "059",
  });
});

test("reports duplicate and non-institutional roster rows", () => {
  const { entries, errors } = parseRosterText([
    "2023ugcs059@nitjsr.ac.in",
    "2023ugcs059@nitjsr.ac.in",
    "student@example.com",
  ].join("\n"));

  assert.equal(entries.length, 1);
  assert.equal(errors.length, 2);
  assert.match(errors[0].message, /Duplicate/);
  assert.match(errors[1].message, /@nitjsr\.ac\.in/);
});

test("parses a quoted CSV name without changing the email", () => {
  const { entries, errors } = parseRosterText(
    '2023ugcs060@nitjsr.ac.in,"Singh, Student"'
  );

  assert.deepEqual(errors, []);
  assert.equal(entries[0].name, "Singh, Student");
});
