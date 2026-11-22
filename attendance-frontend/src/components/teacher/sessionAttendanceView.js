/**
 * Pure helpers for the teacher/admin session register modal.
 *
 * A row can change in two independent ways: its status or its decision note.
 * The old modal only tracked status drafts, so a note typed without a status
 * change was silently dropped, and a status-only change cleared an existing
 * note. These helpers make both fields first-class and are testable in Node.
 */

const hasOwn = (value, key) =>
  Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);

const normaliseNote = (value) => String(value ?? "");

const noteValueFor = (record, notes) => {
  if (hasOwn(notes, record?.id)) return normaliseNote(notes[record.id]);
  return normaliseNote(record?.decisionNote);
};

const hasNoteChange = (record, notes) =>
  hasOwn(notes, record?.id) &&
  normaliseNote(notes[record.id]) !== normaliseNote(record?.decisionNote);

const changedRecordIds = (records, drafts, notes) => {
  const list = Array.isArray(records) ? records : [];
  return list
    .filter((record) => {
      if (!record?.id) return false;
      const statusChanged =
        hasOwn(drafts, record.id) && drafts[record.id] !== record.status;
      return statusChanged || hasNoteChange(record, notes);
    })
    .map((record) => record.id);
};

const attendanceUpdates = (records, drafts, notes) => {
  const list = Array.isArray(records) ? records : [];
  const byId = new Map(
    list.filter((record) => record?.id).map((record) => [record.id, record])
  );
  return changedRecordIds(list, drafts, notes).map((recordId) => {
    const record = byId.get(recordId);
    return {
      recordId,
      status: hasOwn(drafts, recordId) ? drafts[recordId] : record.status,
      note: noteValueFor(record, notes),
    };
  });
};

const chosenStatus = (record, drafts) =>
  hasOwn(drafts, record?.id) ? drafts[record.id] : record?.status;

const evidenceCount = (record) => Number(record?.evidence?.proofCount) || 0;

const isEvidenceBackedPending = (record, drafts) =>
  chosenStatus(record, drafts) === "pending" && evidenceCount(record) > 0;

const evidenceBackedPendingIds = (records, drafts) =>
  (Array.isArray(records) ? records : [])
    .filter((record) => isEvidenceBackedPending(record, drafts))
    .map((record) => record.id);

/**
 * Set every currently-pending row with at least one proof to the Present
 * draft. A teacher's existing draft is respected: if they already chose
 * Absent or Excused for a row, the bulk action does not overwrite it.
 */
const markEvidenceBackedPresent = (records, drafts) => {
  const next = { ...drafts };
  for (const record of Array.isArray(records) ? records : []) {
    if (!record?.id || !isEvidenceBackedPending(record, drafts)) continue;
    if (record.status === "present") delete next[record.id];
    else next[record.id] = "present";
  }
  return next;
};

const pendingEvidenceBreakdown = (records, drafts) => {
  const pendingWithEvidence = [];
  const pendingWithoutEvidence = [];
  for (const record of Array.isArray(records) ? records : []) {
    if (!record?.id || chosenStatus(record, drafts) !== "pending") continue;
    if (evidenceCount(record) > 0) pendingWithEvidence.push(record);
    else pendingWithoutEvidence.push(record);
  }
  return {
    pendingWithEvidence,
    pendingWithoutEvidence,
    pendingWithEvidenceCount: pendingWithEvidence.length,
    pendingWithoutEvidenceCount: pendingWithoutEvidence.length,
  };
};

const EVIDENCE_FILTERS = ["all", "pending-evidence", "pending-no-evidence"];

const filterRecords = (records, drafts, filter) => {
  const list = Array.isArray(records) ? records : [];
  if (filter === "pending-evidence") {
    return list.filter((record) => isEvidenceBackedPending(record, drafts));
  }
  if (filter === "pending-no-evidence") {
    return list.filter(
      (record) => chosenStatus(record, drafts) === "pending" && evidenceCount(record) === 0
    );
  }
  return list;
};

const SOURCE_LABELS = {
  pending: "No decision",
  manual: "Teacher",
  query: "Query",
  override: "Override",
  auto: "Auto-absent",
  evidence: "Evidence",
  demo: "Demo",
  browser: "Browser",
};

const sourceLabel = (source) => SOURCE_LABELS[source] || source || "No decision";

module.exports = {
  changedRecordIds,
  attendanceUpdates,
  noteValueFor,
  hasNoteChange,
  chosenStatus,
  evidenceCount,
  isEvidenceBackedPending,
  evidenceBackedPendingIds,
  markEvidenceBackedPresent,
  pendingEvidenceBreakdown,
  EVIDENCE_FILTERS,
  filterRecords,
  sourceLabel,
};
