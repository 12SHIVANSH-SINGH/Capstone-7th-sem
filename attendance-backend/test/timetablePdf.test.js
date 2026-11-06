const { test } = require("node:test");
const assert = require("node:assert/strict");

const Timetable = require("../models/timetableModels");
const { previewTimetablePdf } = require("../controllers/timetableController");
const { createPdf } = require("../test-support/pdfFixture");

const reply = () => {
  const calls = { status: null, body: null };
  return {
    calls,
    status(code) {
      calls.status = code;
      return this;
    },
    json(body) {
      calls.body = body;
      return this;
    },
  };
};

const request = (overrides = {}) => ({
  user: { _id: "teacher-1", role: "teacher" },
  file: null,
  ip: "127.0.0.1",
  ...overrides,
});

const run = async (handler, req, res) => {
  let error = null;
  await new Promise((resolve) => {
    handler(req, res, (nextError) => {
      error = nextError || null;
      resolve();
    });
    setTimeout(resolve, 0);
  });
  return error;
};

test("a timetable PDF is extracted for review without writing a slot", async (t) => {
  let writes = 0;
  t.mock.method(Timetable, "create", async () => {
    writes += 1;
    return {};
  });

  const buffer = await createPdf((document) => {
    document.text("Monday 09:00-10:00 CS301 Computer Networks");
    document.text("Tuesday 11:00-12:00 CS302 Operating Systems");
  });

  const res = reply();
  const error = await run(
    previewTimetablePdf,
    request({ file: { buffer, originalname: "timetable.pdf", mimetype: "application/pdf" } }),
    res
  );

  assert.equal(error, null);
  assert.equal(res.calls.status, 200);
  assert.equal(res.calls.body.success, true);
  assert.equal(res.calls.body.extraction.pageCount, 1);
  assert.equal(res.calls.body.extraction.fileName, "timetable.pdf");
  assert.match(res.calls.body.extraction.text, /CS301 Computer Networks/);
  assert.match(res.calls.body.extraction.text, /CS302 Operating Systems/);
  assert.equal(writes, 0, "preview must never create a timetable slot");
});

test("a non-PDF upload is rejected with a stable code", async () => {
  const error = await run(
    previewTimetablePdf,
    request({
      file: {
        buffer: Buffer.from("Monday 09:00-10:00 CS301"),
        originalname: "timetable.csv",
        mimetype: "text/csv",
      },
    }),
    reply()
  );

  assert.equal(error.statuscode, 400);
  assert.equal(error.code, "pdf_invalid");
  assert.match(error.message, /valid PDF/i);
});

test("a timetable PDF without a text layer points back to manual entry", async () => {
  const buffer = await createPdf(() => {});
  const error = await run(
    previewTimetablePdf,
    request({ file: { buffer, originalname: "scan.pdf", mimetype: "application/pdf" } }),
    reply()
  );

  assert.equal(error.statuscode, 422);
  assert.equal(error.code, "pdf_no_text_layer");
  assert.match(error.message, /no selectable text layer/i);
  assert.match(error.message, /OCR is not built/i);
});

test("a missing timetable file is rejected before extraction", async () => {
  const error = await run(previewTimetablePdf, request(), reply());

  assert.equal(error.statuscode, 400);
  assert.equal(error.code, "pdf_missing");
});
