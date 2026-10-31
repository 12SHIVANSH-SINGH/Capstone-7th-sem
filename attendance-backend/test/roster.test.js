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

test("rehearsal enrollment accepts only the exact allowlisted test email", () => {
  const roster = [
    "tester@gmail.com,Tester",
    "other@gmail.com,Other",
    "2023ugcs061@nitjsr.ac.in,College Student",
  ].join("\n");

  const withoutFlag = parseRosterText(roster);
  assert.equal(withoutFlag.entries.length, 1);
  assert.equal(withoutFlag.entries[0].email, "2023ugcs061@nitjsr.ac.in");
  assert.equal(withoutFlag.errors.length, 2);

  const withRehearsal = parseRosterText(roster, {
    allowedTestEmails: ["TESTER@gmail.com"],
  });
  assert.equal(withRehearsal.errors.length, 1);
  assert.equal(withRehearsal.errors[0].row, 2);
  assert.deepEqual(
    withRehearsal.entries.map((entry) => entry.email),
    ["tester@gmail.com", "2023ugcs061@nitjsr.ac.in"]
  );
  assert.deepEqual(withRehearsal.entries[0].identity, { loginId: "tester" });
});

test("an allowlisted college email does not change the college rule", () => {
  const { entries, errors } = parseRosterText("2023ugcs062@nitjsr.ac.in", {
    allowedTestEmails: ["2023ugcs062@nitjsr.ac.in"],
  });

  assert.deepEqual(errors, []);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].email, "2023ugcs062@nitjsr.ac.in");
});
