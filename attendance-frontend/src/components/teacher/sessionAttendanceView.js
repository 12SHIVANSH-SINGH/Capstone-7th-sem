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

module.exports = {
  changedRecordIds,
  attendanceUpdates,
  noteValueFor,
  hasNoteChange,
};
