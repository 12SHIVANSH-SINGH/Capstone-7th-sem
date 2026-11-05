const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const CourseClass = require("../models/classModels");
const { previewRosterPdf } = require("../controllers/classController");
const { createPdf } = require("../test-support/pdfFixture");

const classId = new mongoose.Types.ObjectId();
const teacherId = new mongoose.Types.ObjectId();

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
  params: { classId: String(classId) },
  user: { _id: teacherId, role: "teacher" },
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

test("a roster PDF is extracted for review without writing enrollments", async (t) => {
  t.mock.method(CourseClass, "findOne", async (filter) => {
    assert.equal(String(filter._id), String(classId));
    assert.equal(String(filter.teacher), String(teacherId));
    return { _id: classId };
  });

  const buffer = await createPdf((document) => {
    document.text("2023ugcs001@nitjsr.ac.in  Aarav Kumar");
    document.text("2023ugcs002@nitjsr.ac.in  Diya Sharma");
  });

  const res = reply();
  const error = await run(
    previewRosterPdf,
    request({ file: { buffer, originalname: "roster.pdf", mimetype: "application/pdf" } }),
    res
  );

  assert.equal(error, null);
  assert.equal(res.calls.status, 200);
  assert.equal(res.calls.body.success, true);
  assert.equal(res.calls.body.extraction.pageCount, 1);
  assert.equal(res.calls.body.extraction.institutionalEmailCount, 2);
  assert.equal(res.calls.body.extraction.fileName, "roster.pdf");
  assert.match(res.calls.body.extraction.text, /2023ugcs001@nitjsr\.ac\.in/);
});

test("a non-PDF upload is rejected with a stable code", async (t) => {
  t.mock.method(CourseClass, "findOne", async () => ({ _id: classId }));

  const error = await run(
    previewRosterPdf,
    request({
      file: {
        buffer: Buffer.from("email,name\n2023ugcs001@nitjsr.ac.in,Student"),
        originalname: "roster.csv",
        mimetype: "text/csv",
      },
    }),
    reply()
  );

  assert.equal(error.statuscode, 400);
  assert.equal(error.code, "pdf_invalid");
  assert.match(error.message, /valid PDF/i);
});

test("a PDF without a text layer points the teacher back to CSV/paste", async (t) => {
  t.mock.method(CourseClass, "findOne", async () => ({ _id: classId }));
  const buffer = await createPdf(() => {});

  const error = await run(
    previewRosterPdf,
    request({ file: { buffer, originalname: "scan.pdf", mimetype: "application/pdf" } }),
    reply()
  );

  assert.equal(error.statuscode, 422);
  assert.equal(error.code, "pdf_no_text_layer");
  assert.match(error.message, /no selectable text layer/i);
  assert.match(error.message, /OCR is not built/i);
});

test("a missing file is rejected before extraction", async (t) => {
  t.mock.method(CourseClass, "findOne", async () => ({ _id: classId }));

  const error = await run(previewRosterPdf, request(), reply());

  assert.equal(error.statuscode, 400);
  assert.equal(error.code, "pdf_missing");
});

test("a class owned by another teacher never reaches extraction", async (t) => {
  t.mock.method(CourseClass, "findOne", async () => null);

  const error = await run(
    previewRosterPdf,
    request({
      file: {
        buffer: Buffer.from("%PDF-1.4\n"),
        originalname: "roster.pdf",
        mimetype: "application/pdf",
      },
    }),
    reply()
  );

  assert.equal(error.statuscode, 404);
  assert.match(error.message, /Class not found/);
});
