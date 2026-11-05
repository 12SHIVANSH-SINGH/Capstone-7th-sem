const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { AUDIT_ACTIONS } = require("../models/auditLogModels");

// writeAudit() deliberately swallows logging failures, so a typo or a new
// action missing from the model allowlist would silently lose audit history.
// Scan every literal action emitted by the backend and require it to be known.
const collectActionLiterals = (directory) => {
  const found = new Set();
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const action of collectActionLiterals(fullPath)) found.add(action);
      continue;
    }
    if (!entry.name.endsWith(".js")) continue;
    const source = fs.readFileSync(fullPath, "utf8");
    for (const match of source.matchAll(/action:\s*["']([a-z][a-z0-9._-]+)["']/g)) {
      found.add(match[1]);
    }
  }
  return found;
};

test("every literal audit action is in the model allowlist", () => {
  const root = path.join(__dirname, "..");
  const emitted = new Set([
    ...collectActionLiterals(path.join(root, "controllers")),
    ...collectActionLiterals(path.join(root, "utils")),
  ]);
  const unknown = [...emitted].filter((action) => !AUDIT_ACTIONS.includes(action));

  assert.deepEqual(unknown, []);
});

test("session revocation and device decisions are auditable", () => {
  for (const action of [
    "session.revoked_all",
    "admin.user.sessions_revoked",
    "device.binding.first_requested",
    "device.binding.change_requested",
    "device.binding.approved",
    "device.binding.rejected",
  ]) {
    assert.ok(AUDIT_ACTIONS.includes(action), `${action} must be allowed`);
  }
});

test("passkey enrollment and step-up are auditable", () => {
  for (const action of ["admin.webauthn.registered", "admin.webauthn.step_up"]) {
    assert.ok(AUDIT_ACTIONS.includes(action), `${action} must be allowed`);
  }
});

test("every generated export action is auditable", () => {
  // The export controller builds these with a template literal, so the
  // literal scanner above cannot see them. Keep this list in sync with
  // exportController's auditExport calls.
  for (const action of [
    "export.attendance.pdf",
    "export.attendance.xlsx",
    "export.queries.pdf",
    "export.queries.xlsx",
    "export.session.pdf",
    "export.session.xlsx",
    "export.users.xlsx",
    "export.audit.xlsx",
  ]) {
    assert.ok(AUDIT_ACTIONS.includes(action), `${action} must be allowed`);
  }
});
