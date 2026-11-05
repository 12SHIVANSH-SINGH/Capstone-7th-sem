const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  extractPdfText,
  reconstructLines,
  PdfTextError,
} = require("../utils/pdfText");
const { createPdf } = require("../test-support/pdfFixture");

const fragment = (str, x, y, width = str.length * 6, height = 10) => ({
  str,
  transform: [10, 0, 0, height, x, y],
  width,
  height,
});

test("reconstructLines joins per-character items and preserves word gaps", () => {
  const lines = reconstructLines([
    fragment("2023", 72, 700),
    fragment("ugcs001", 96, 700),
    fragment("@nitjsr.ac.in", 138, 700),
    fragment("Aarav", 225, 700, 30),
    fragment("Kumar", 260, 700, 30),
  ]);

  assert.deepEqual(lines, ["2023ugcs001@nitjsr.ac.in Aarav Kumar"]);
});

test("reconstructLines reads a visual page top-to-bottom, not content order", () => {
  const lines = reconstructLines([
    fragment("Second line", 72, 680, 60),
    fragment("First line", 72, 700, 55),
    fragment("Third line", 72, 660, 55),
  ]);

  assert.deepEqual(lines, ["First line", "Second line", "Third line"]);
});

test("extractPdfText returns a roster's visual lines", async () => {
  const buffer = await createPdf((document) => {
    document.fontSize(14).text("Class roster");
    document.moveDown();
    document.fontSize(11).text("2023ugcs001@nitjsr.ac.in  Aarav Kumar");
    document.text("2023ugcs002@nitjsr.ac.in  Diya Sharma");
    document.text("2023ugcs003@nitjsr.ac.in  Kabir Singh");
  });

  const result = await extractPdfText(buffer);

  assert.equal(result.pageCount, 1);
  assert.equal(result.extractedPages, 1);
  assert.equal(result.hasText, true);
  assert.equal(result.lineCount, 4);
  assert.match(result.text, /Class roster/);
  assert.match(result.text, /2023ugcs001@nitjsr\.ac\.in\s+Aarav Kumar/);
  assert.match(result.text, /2023ugcs002@nitjsr\.ac\.in\s+Diya Sharma/);
  assert.match(result.text, /2023ugcs003@nitjsr\.ac\.in\s+Kabir Singh/);
  assert.ok(
    result.text.indexOf("Aarav Kumar") < result.text.indexOf("Diya Sharma"),
    "visual order should be preserved"
  );
});

test("extractPdfText keeps page boundaries and both pages", async () => {
  const buffer = await createPdf((document) => {
    document.text("2023ugcs001@nitjsr.ac.in  Aarav Kumar");
    document.addPage();
    document.text("2023ugcs002@nitjsr.ac.in  Diya Sharma");
  });

  const result = await extractPdfText(buffer);

  assert.equal(result.pageCount, 2);
  assert.equal(result.extractedPages, 2);
  assert.match(result.text, /Aarav Kumar/);
  assert.match(result.text, /Diya Sharma/);
  assert.match(result.text, /\n\n/);
});

test("extractPdfText reports a PDF with no text layer instead of pretending it parsed", async () => {
  const buffer = await createPdf(() => {});
  const result = await extractPdfText(buffer);

  assert.equal(result.hasText, false);
  assert.equal(result.text, "");
  assert.equal(result.lineCount, 0);
});

test("extractPdfText rejects a file without a PDF header", async () => {
  await assert.rejects(
    () => extractPdfText(Buffer.from("email,name\nstudent@nitjsr.ac.in,Student")),
    (error) => {
      assert.ok(error instanceof PdfTextError);
      assert.equal(error.code, "pdf_invalid");
      assert.equal(error.statuscode, 400);
      return true;
    }
  );
});

test("extractPdfText rejects a missing or oversized buffer before loading PDF.js", async () => {
  await assert.rejects(
    () => extractPdfText(Buffer.alloc(0)),
    (error) => error.code === "pdf_missing" && error.statuscode === 400
  );

  const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 0x20);
  oversized.write("%PDF-", 0, "latin1");
  await assert.rejects(
    () => extractPdfText(oversized),
    (error) => error.code === "pdf_too_large" && error.statuscode === 413
  );
});

test("extractPdfText refuses a PDF above the page limit", async () => {
  const buffer = await createPdf((document) => {
    document.text("page 1");
    for (let page = 2; page <= 21; page += 1) {
      document.addPage();
      document.text(`page ${page}`);
    }
  });

  await assert.rejects(
    () => extractPdfText(buffer),
    (error) => error.code === "pdf_too_many_pages" && error.statuscode === 422
  );
});
