const { test } = require("node:test");
const assert = require("node:assert/strict");

const AuditLog = require("../models/auditLogModels");
const { requestIp } = require("../utils/audit");
const {
  appendAuditEntry,
  computeAuditHash,
  verifyAuditEntries,
} = require("../utils/auditChain");

const baseEntry = (overrides = {}) => ({
  action: "admin.user.updated",
  entityType: "User",
  entityId: "507f1f77bcf86cd799439011",
  actor: "507f1f77bcf86cd799439012",
  actorEmail: "owner@nitjsr.ac.in",
  actorRole: "superadmin",
  impersonator: null,
  impersonatorEmail: "",
  summary: "Updated a user.",
  before: { status: "active", role: "student" },
  after: { status: "active", role: "teacher" },
  metadata: null,
  ip: "203.0.113.7",
  userAgent: "test-agent",
  isDemo: false,
  createdAt: new Date("2026-11-05T10:00:00.000Z"),
  ...overrides,
});

const chainOf = (count) => {
  const entries = [];
  let prevHash = "";
  for (let seq = 1; seq <= count; seq += 1) {
    const entry = baseEntry({
      seq,
      prevHash,
      summary: `Entry ${seq}`,
      createdAt: new Date(`2026-11-05T10:00:0${seq}.000Z`),
    });
    const hash = computeAuditHash(entry);
    entries.push({ ...entry, hash });
    prevHash = hash;
  }
  return entries;
};

test("the hash is stable across object key order and binds every field", () => {
  const first = baseEntry({
    before: { status: "active", role: "student" },
    after: { role: "teacher", status: "active" },
  });
  const second = baseEntry({
    before: { role: "student", status: "active" },
    after: { status: "active", role: "teacher" },
  });

  assert.equal(computeAuditHash(first), computeAuditHash(second));
  assert.notEqual(
    computeAuditHash(first),
    computeAuditHash({ ...first, summary: "Different summary" })
  );
});

test("appending uses the previous sequence and hash", async (t) => {
  const last = { seq: 7, hash: "a".repeat(64) };
  t.mock.method(AuditLog, "findOne", () => ({
    sort: () => ({
      select: () => ({
        lean: async () => last,
      }),
    }),
  }));
  t.mock.method(AuditLog, "create", async (entry) => entry);

  const createdAt = new Date("2026-11-05T10:00:00.000Z");
  const entry = await appendAuditEntry(baseEntry({ createdAt }));

  assert.equal(entry.seq, 8);
  assert.equal(entry.prevHash, last.hash);
  assert.equal(entry.createdAt, createdAt);
  assert.equal(entry.hash, computeAuditHash(entry));
});

test("a clean chain verifies from sequence one", () => {
  const entries = chainOf(4);
  const result = verifyAuditEntries(entries);

  assert.equal(result.ok, true);
  assert.equal(result.checked, 4);
  assert.equal(result.firstSeq, 1);
  assert.equal(result.lastSeq, 4);
  assert.equal(result.lastHash, entries[3].hash);
});

test("verification reports the first tampered entry", () => {
  const entries = chainOf(3);
  entries[1] = { ...entries[1], summary: "Tampered after append" };
  const result = verifyAuditEntries(entries);

  assert.equal(result.ok, false);
  assert.equal(result.reason, "hash-mismatch");
  assert.equal(result.brokenSeq, 2);
  assert.equal(result.checked, 1);
  assert.equal(result.expectedHash, computeAuditHash(entries[1]));
});

test("a forked entry with a valid hash still fails the previous-hash check", () => {
  const entries = chainOf(3);
  entries[2] = {
    ...entries[2],
    prevHash: "b".repeat(64),
  };
  entries[2].hash = computeAuditHash(entries[2]);
  const result = verifyAuditEntries(entries);

  assert.equal(result.ok, false);
  assert.equal(result.reason, "prev-hash-mismatch");
  assert.equal(result.brokenSeq, 3);
  assert.equal(result.checked, 2);
});

test("a missing sequence is reported as a gap", () => {
  const entries = chainOf(3).filter((entry) => entry.seq !== 2);
  const result = verifyAuditEntries(entries);

  assert.equal(result.ok, false);
  assert.equal(result.reason, "sequence-gap");
  assert.equal(result.brokenSeq, 3);
});

test("audit IP uses the proxy-resolved req.ip, not a raw client header", () => {
  const request = {
    ip: "203.0.113.7",
    headers: { "x-forwarded-for": "198.51.100.99, 203.0.113.7" },
    socket: { remoteAddress: "10.0.0.1" },
  };

  assert.equal(requestIp(request), "203.0.113.7");
  assert.equal(requestIp({ socket: { remoteAddress: "10.0.0.2" } }), "10.0.0.2");
  assert.equal(requestIp({}), "");
});
