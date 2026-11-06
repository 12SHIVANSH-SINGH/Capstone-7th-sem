const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isPdfFile,
  extractionSummary,
  importErrorMessage,
} = require("./timetableImport");

test("recognises a timetable PDF from its MIME type or extension", () => {
  assert.equal(isPdfFile({ type: "application/pdf", name: "timetable" }), true);
  assert.equal(isPdfFile({ type: "", name: "TIMETABLE.PDF" }), true);
  assert.equal(isPdfFile({ type: "text/csv", name: "timetable.csv" }), false);
  assert.equal(isPdfFile(null), false);
});

test("summarises page and line counts without claiming a slot was created", () => {
  assert.equal(
    extractionSummary({ pageCount: 1, lineCount: 12 }),
    "Extracted 1 page and 12 lines. Nothing has been scheduled; review the text and add each slot manually."
  );
  assert.equal(
    extractionSummary({ pageCount: 2, lineCount: 1 }),
    "Extracted 2 pages and 1 line. Nothing has been scheduled; review the text and add each slot manually."
  );
});

test("handles missing counts without inventing data", () => {
  assert.match(extractionSummary({}), /Extracted 0 pages and 0 lines/);
});

test("explains a scanned timetable without pretending OCR exists", () => {
  assert.match(
    importErrorMessage({ response: { data: { code: "pdf_no_text_layer" } } }),
    /no selectable text layer.*OCR is not built/i
  );
});

test("maps password and size errors to plain messages", () => {
  assert.match(
    importErrorMessage({ response: { data: { code: "pdf_password_protected" } } }),
    /password-protected/i
  );
  assert.match(
    importErrorMessage({ response: { data: { code: "pdf_too_many_pages" } } }),
    /max 20/i
  );
  assert.match(
    importErrorMessage({ response: { data: { code: "pdf_too_much_text" } } }),
    /too much text/i
  );
});

test("falls back to the server message for other import errors", () => {
  assert.equal(
    importErrorMessage(
      { response: { data: { code: "pdf_unreadable", message: "Could not read this PDF." } } },
      "Fallback"
    ),
    "Could not read this PDF."
  );
  assert.equal(importErrorMessage(null, "Fallback"), "Fallback");
});
