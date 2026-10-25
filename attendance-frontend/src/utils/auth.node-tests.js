const test = require("node:test");
const assert = require("node:assert/strict");
const { dashboardPath } = require("./auth");

test("teacher sessions route to the teacher dashboard", () => {
  assert.equal(dashboardPath("teacher"), "/teacher-dashboard");
});

test("student sessions (and unknown roles) route to the student dashboard", () => {
  assert.equal(dashboardPath("student"), "/student-dashboard");
  assert.equal(dashboardPath(undefined), "/student-dashboard");
});
