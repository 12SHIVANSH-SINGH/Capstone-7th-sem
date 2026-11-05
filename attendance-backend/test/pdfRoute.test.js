const { test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../models/userModels");
const CourseClass = require("../models/classModels");
const classRoute = require("../routes/classRoute");
const errorMiddleware = require("../middleware/error");
const { createPdf } = require("../test-support/pdfFixture");

const SECRET = "pdf-route-secret-that-is-long-enough";
const classId = new mongoose.Types.ObjectId();

const user = {
  _id: new mongoose.Types.ObjectId(),
  name: "PDF Teacher",
  email: "teacher@nitjsr.ac.in",
  role: "teacher",
  authProvider: "google",
  status: "active",
  tokenVersion: 0,
};

let server;
let baseUrl;
let token;

const start = async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = SECRET;
  delete process.env.DEV_AUTH_ENABLED;
  delete process.env.TEST_STUDENT_EMAILS;
  delete process.env.TEST_TEACHER_EMAILS;

  const app = express();
  app.use(cookieParser());
  app.use("/api/v1", classRoute);
  app.use(errorMiddleware);
  server = app.listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  token = jwt.sign({ id: String(user._id) }, SECRET, { expiresIn: "1h" });
};

const stop = () => new Promise((resolve) => server.close(resolve));

const upload = (buffer, name, type) => {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type }), name);
  return fetch(`${baseUrl}/api/v1/classes/${classId}/roster/pdf/preview`, {
    method: "POST",
    headers: { cookie: `token=${token}` },
    body: form,
  });
};

test("the real multipart route extracts a PDF and does not save a roster", async (t) => {
  await start();
  t.after(stop);

  t.mock.method(User, "findById", async () => user);
  t.mock.method(CourseClass, "findOne", async () => ({ _id: classId }));

  const buffer = await createPdf((document) => {
    document.text("2023ugcs001@nitjsr.ac.in  Aarav Kumar");
    document.text("2023ugcs002@nitjsr.ac.in  Diya Sharma");
  });

  const response = await upload(buffer, "roster.pdf", "application/pdf");
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.extraction.institutionalEmailCount, 2);
  assert.match(body.extraction.text, /Aarav Kumar/);
});

test("the real multipart route rejects a non-PDF with a stable code", async (t) => {
  await start();
  t.after(stop);

  t.mock.method(User, "findById", async () => user);
  t.mock.method(CourseClass, "findOne", async () => ({ _id: classId }));

  const response = await upload(
    Buffer.from("email,name\n2023ugcs001@nitjsr.ac.in,Student"),
    "roster.csv",
    "text/csv"
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.code, "pdf_invalid");
});

test("the multipart route requires a signed-in teacher", async (t) => {
  await start();
  t.after(stop);

  const form = new FormData();
  form.append("file", new Blob([Buffer.from("%PDF-1.4\n")], { type: "application/pdf" }), "x.pdf");

  const response = await fetch(
    `${baseUrl}/api/v1/classes/${classId}/roster/pdf/preview`,
    { method: "POST", body: form }
  );

  assert.equal(response.status, 401);
});
