const { test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../models/userModels");
const Timetable = require("../models/timetableModels");
const timetableRoute = require("../routes/timetableRoute");
const errorMiddleware = require("../middleware/error");
const { createPdf } = require("../test-support/pdfFixture");

const SECRET = "timetable-pdf-route-secret-that-is-long-enough";

const teacher = {
  _id: new mongoose.Types.ObjectId(),
  name: "Timetable Teacher",
  email: "teacher@nitjsr.ac.in",
  role: "teacher",
  authProvider: "google",
  status: "active",
  tokenVersion: 0,
};

const student = {
  _id: new mongoose.Types.ObjectId(),
  name: "Timetable Student",
  email: "student@nitjsr.ac.in",
  role: "student",
  authProvider: "google",
  status: "active",
  tokenVersion: 0,
};

let server;
let baseUrl;

const start = async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = SECRET;
  process.env.TEACHER_EMAILS = "teacher@nitjsr.ac.in";
  process.env.TEST_STUDENT_EMAILS = "";
  process.env.TEST_TEACHER_EMAILS = "";
  delete process.env.DEV_AUTH_ENABLED;

  const app = express();
  app.use(cookieParser());
  app.use("/api/v1", timetableRoute);
  app.use(errorMiddleware);
  server = app.listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
};

const stop = () => new Promise((resolve) => server.close(resolve));

const tokenFor = (user) => jwt.sign({ id: String(user._id) }, SECRET, { expiresIn: "1h" });

const upload = (buffer, name, type, user = teacher) => {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type }), name);
  return fetch(`${baseUrl}/api/v1/timetable/pdf/preview`, {
    method: "POST",
    headers: user ? { cookie: `token=${tokenFor(user)}` } : {},
    body: form,
  });
};

test("the real multipart route extracts a timetable PDF and writes no slot", async (t) => {
  await start();
  t.after(stop);

  t.mock.method(User, "findById", async () => teacher);
  let writes = 0;
  t.mock.method(Timetable, "create", async () => {
    writes += 1;
    return {};
  });

  const buffer = await createPdf((document) => {
    document.text("Monday 09:00-10:00 CS301 Computer Networks");
    document.text("Wednesday 14:00-15:00 CS302 Operating Systems");
  });

  const response = await upload(buffer, "timetable.pdf", "application/pdf");
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.extraction.fileName, "timetable.pdf");
  assert.match(body.extraction.text, /CS301 Computer Networks/);
  assert.match(body.extraction.text, /CS302 Operating Systems/);
  assert.equal(writes, 0);
});

test("a student cannot extract a timetable PDF", async (t) => {
  await start();
  t.after(stop);

  t.mock.method(User, "findById", async () => student);

  const response = await upload(Buffer.from("%PDF-1.4\n"), "timetable.pdf", "application/pdf", student);
  assert.equal(response.status, 403);
  assert.match((await response.json()).message, /permission/i);
});

test("an anonymous request cannot extract a timetable PDF", async (t) => {
  await start();
  t.after(stop);

  const form = new FormData();
  form.append("file", new Blob([Buffer.from("%PDF-1.4\n")], { type: "application/pdf" }), "x.pdf");
  const response = await fetch(`${baseUrl}/api/v1/timetable/pdf/preview`, {
    method: "POST",
    body: form,
  });

  assert.equal(response.status, 401);
});

test("a non-PDF timetable upload returns pdf_invalid", async (t) => {
  await start();
  t.after(stop);

  t.mock.method(User, "findById", async () => teacher);

  const response = await upload(
    Buffer.from("Monday,09:00-10:00,CS301"),
    "timetable.csv",
    "text/csv"
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.code, "pdf_invalid");
});

test("a scanned timetable returns pdf_no_text_layer and creates nothing", async (t) => {
  await start();
  t.after(stop);

  t.mock.method(User, "findById", async () => teacher);
  let writes = 0;
  t.mock.method(Timetable, "create", async () => {
    writes += 1;
    return {};
  });

  const buffer = await createPdf(() => {});
  const response = await upload(buffer, "scan.pdf", "application/pdf");
  const body = await response.json();

  assert.equal(response.status, 422);
  assert.equal(body.code, "pdf_no_text_layer");
  assert.equal(writes, 0);
});
