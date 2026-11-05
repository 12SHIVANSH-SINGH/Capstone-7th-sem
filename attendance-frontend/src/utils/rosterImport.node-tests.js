const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isPdfFile,
  extractionSummary,
  importErrorMessage,
} = require("./rosterImport");

test("recognises a PDF from its MIME type", () => {
  assert.equal(isPdfFile({ type: "application/pdf", name: "roster" }), true);
});

test("recognises a PDF by extension and rejects CSV", () => {
  assert.equal(isPdfFile({ type: "", name: "ROSTER.PDF" }), true);
  assert.equal(isPdfFile({ type: "text/csv", name: "roster.csv" }), false);
  assert.equal(isPdfFile(null), false);
});

test("summarises page and email counts with correct plurals", () => {
  assert.equal(
    extractionSummary({ pageCount: 1, institutionalEmailCount: 1 }),
    "Extracted 1 page; 1 college email found. Review the text, then run Preview roster."
  );
  assert.equal(
    extractionSummary({ pageCount: 2, institutionalEmailCount: 3 }),
    "Extracted 2 pages; 3 college emails found. Review the text, then run Preview roster."
  );
});

test("warns when extraction found no college emails", () => {
  assert.match(
    extractionSummary({ pageCount: 1, institutionalEmailCount: 0 }),
    /no college emails found/
  );
});

test("explains a scanned PDF without pretending OCR exists", () => {
  assert.match(
    importErrorMessage({ response: { data: { code: "pdf_no_text_layer" } } }),
    /no selectable text layer.*OCR is not built/i
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
