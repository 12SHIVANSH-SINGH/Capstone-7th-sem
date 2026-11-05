const crypto = require("crypto");
const AuditLog = require("../models/auditLogModels");

/**
 * Canonical hash payload: every field that must not change after append.
 * `hash` itself is excluded, and the actor/impersonator ids are normalised to
 * strings so a lean read hashes identically to a Mongoose document.
 */
const CHAINED_FIELDS = [
  "seq",
  "prevHash",
  "action",
  "entityType",
  "entityId",
  "actor",
  "actorEmail",
  "actorRole",
  "impersonator",
  "impersonatorEmail",
  "summary",
  "before",
  "after",
  "metadata",
  "ip",
  "userAgent",
  "isDemo",
  "createdAt",
];

const normalise = (value) => {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString("base64");
  if (typeof value === "object" && typeof value.toHexString === "function") {
    return value.toHexString();
  }
  if (Array.isArray(value)) return value.map(normalise);
  if (typeof value === "object") {
    const output = {};
    for (const key of Object.keys(value).sort()) output[key] = normalise(value[key]);
    return output;
  }
  return value;
};

const auditPayload = (entry) => {
  const payload = {};
  for (const field of CHAINED_FIELDS) {
    payload[field] = field === "isDemo" ? Boolean(entry?.[field]) : entry?.[field];
    if (payload[field] === undefined) payload[field] = null;
  }
  return payload;
};

const canonicalJson = (entry) => JSON.stringify(normalise(auditPayload(entry)));

const computeAuditHash = (entry) =>
  crypto.createHash("sha256").update(canonicalJson(entry)).digest("hex");

// Audit writes are low-volume and the current deployment is one process. This
// queue prevents two concurrent requests from reading the same previous hash
// and forking the chain. A multi-instance deployment would need a database
// transaction or a distributed lock instead.
let chainQueue = Promise.resolve();

const appendAuditEntry = (fields) => {
  const run = chainQueue.then(async () => {
    const last = await AuditLog.findOne({ hash: { $ne: "" } })
      .sort({ seq: -1 })
      .select("seq hash")
      .lean();
    const seq = Number(last?.seq || 0) + 1;
    const prevHash = String(last?.hash || "");
    const createdAt = fields.createdAt instanceof Date ? fields.createdAt : new Date();

    const entry = { ...fields, seq, prevHash, createdAt };
    const hash = computeAuditHash(entry);
    return AuditLog.create({ ...entry, hash });
  });

  chainQueue = run.then(
    () => undefined,
    (error) => {
      // writeAudit reports the detailed failure. Keep the queue usable.
      console.error(`[audit] chain append failed: ${error.message}`);
    }
  );

  return run;
};

const firstBreak = (reason, entry, checked) => ({
  ok: false,
  checked,
  reason,
  brokenSeq: Number(entry?.seq),
  brokenHash: String(entry?.hash || ""),
  expectedHash: "",
  firstSeq: null,
  lastSeq: null,
  lastHash: "",
});

/**
 * Recompute the chain from an ordered list of entries. Pure so it can be
 * tested without a database and reused by the admin verification endpoint.
 */
const verifyAuditEntries = (entries = []) => {
  let previousHash = "";
  let expectedSeq = 1;
  let checked = 0;
  let firstSeq = null;
  let lastSeq = null;

  for (const entry of entries) {
    const seq = Number(entry?.seq);
    if (!Number.isInteger(seq) || seq <= 0) {
      return firstBreak("invalid-sequence", entry, checked);
    }
    if (seq !== expectedSeq) {
      return firstBreak("sequence-gap", entry, checked);
    }

    const expected = computeAuditHash(entry);
    if (String(entry?.hash || "") !== expected) {
      return {
        ...firstBreak("hash-mismatch", entry, checked),
        expectedHash: expected,
      };
    }
    if (String(entry?.prevHash || "") !== previousHash) {
      return firstBreak("prev-hash-mismatch", entry, checked);
    }

    previousHash = expected;
    firstSeq = firstSeq ?? seq;
    lastSeq = seq;
    checked += 1;
    expectedSeq += 1;
  }

  return {
    ok: true,
    checked,
    reason: "",
    brokenSeq: null,
    brokenHash: "",
    expectedHash: "",
    firstSeq,
    lastSeq,
    lastHash: previousHash,
  };
};

const verifyAuditChain = async () => {
  const [entries, legacy] = await Promise.all([
    AuditLog.find({ hash: { $exists: true, $nin: ["", null] } })
      .sort({ seq: 1 })
      .lean(),
    AuditLog.countDocuments({
      $or: [{ hash: { $exists: false } }, { hash: null }, { hash: "" }],
    }),
  ]);
  return { ...verifyAuditEntries(entries), legacy };
};

module.exports = {
  CHAINED_FIELDS,
  appendAuditEntry,
  auditPayload,
  canonicalJson,
  computeAuditHash,
  normalise,
  verifyAuditChain,
  verifyAuditEntries,
};
