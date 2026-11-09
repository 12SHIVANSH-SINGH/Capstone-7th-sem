#!/usr/bin/env node
/**
 * Generate synthetic PDF fixtures for manual document-import testing.
 *
 * These files contain fake student data only. They exercise the embedded text
 * layer and the "no text layer" rejection path; they do not represent a real
 * college roster or timetable layout.
 *
 * Run from attendance-backend:
 *   node scripts/generate-test-pdfs.js
 */

const fs = require("node:fs/promises");
const path = require("node:path");
const PDFDocument = require("pdfkit");
const { extractPdfText } = require("../utils/pdfText");

const OUTPUT_DIR = path.resolve(__dirname, "../../test-artifacts");

const createPdf = (build) =>
  new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];

    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);

    build(document);
    document.end();
  });

const syntheticRoster = [
  "email,name",
  "2023ugcs001@nitjsr.ac.in,Aarav Kumar",
  "2023ugcs002@nitjsr.ac.in,Diya Sharma",
  "2023ugcs003@nitjsr.ac.in,Kabir Singh",
  "2023ugcs004@nitjsr.ac.in,Meera Nair",
  "2023ugcs005@nitjsr.ac.in,Rohan Das",
  "2023ugcs006@nitjsr.ac.in,Ananya Roy",
  "2023ugcs007@nitjsr.ac.in,Vikram Patel",
  "2023ugcs008@nitjsr.ac.in,Sneha Verma",
  "2023ugcs009@nitjsr.ac.in,Arjun Mehta",
  "2023ugcs010@nitjsr.ac.in,Ishita Bose",
];

const syntheticTimetable = [
  "Synthetic weekly timetable - TST101 Section A",
  "For preview mechanics only. This is not a real college timetable.",
  "",
  "Monday    09:00-10:00  CS101  Data Structures      Room B-204",
  "Monday    11:00-12:00  CS102  Discrete Mathematics  Room B-204",
  "Tuesday   09:00-10:00  CS101  Data Structures      Room B-204",
  "Wednesday 14:00-15:00  CS201  Operating Systems     Lab C-101",
  "Thursday  10:00-11:00  CS102  Discrete Mathematics  Room B-204",
  "Friday    09:00-10:00  CS201  Operating Systems     Room B-204",
];

const writeRoster = () =>
  createPdf((document) => {
    document.fontSize(16).text("Synthetic class roster - TST101 Section A");
    document.moveDown(0.5);
    document
      .fontSize(10)
      .fillColor("#444444")
      .text("Fake data for preview testing only. Not a real student roster.");
    document.moveDown();
    document.fillColor("#000000").fontSize(11);
    for (const line of syntheticRoster) {
      document.text(line);
    }
    document.moveDown();
    document
      .fontSize(9)
      .fillColor("#444444")
      .text("End of synthetic roster.");
  });

const writeTimetable = () =>
  createPdf((document) => {
    document.fontSize(16).text("Synthetic weekly timetable - TST101 Section A");
    document.moveDown(0.5);
    document
      .fontSize(10)
      .fillColor("#444444")
      .text("Fake data for text-layer preview testing only. Not a real timetable.");
    document.moveDown();
    document.fillColor("#000000").fontSize(11);
    for (const line of syntheticTimetable) {
      document.text(line);
    }
  });

const writeNoTextLayer = () =>
  createPdf((document) => {
    document.rect(50, 50, 495, 300).fill("#e5e7eb");
    document.rect(80, 90, 300, 18).fill("#9ca3af");
    document.rect(80, 130, 420, 12).fill("#d1d5db");
    document.rect(80, 160, 360, 12).fill("#d1d5db");
  });

const verify = async (fileName, { expectText }) => {
  const buffer = await fs.readFile(path.join(OUTPUT_DIR, fileName));
  const result = await extractPdfText(buffer);

  if (expectText && !result.hasText) {
    throw new Error(`${fileName} was generated without a text layer`);
  }
  if (!expectText && result.hasText) {
    throw new Error(`${fileName} unexpectedly contains a text layer`);
  }

  console.log(
    `${fileName}: ${buffer.length} bytes, ${result.pageCount} page(s), ` +
      `${result.lineCount} line(s), hasText=${result.hasText}`
  );
};

const main = async () => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  await fs.writeFile(path.join(OUTPUT_DIR, "roster-text-layer.pdf"), await writeRoster());
  await fs.writeFile(
    path.join(OUTPUT_DIR, "timetable-text-layer.pdf"),
    await writeTimetable()
  );
  await fs.writeFile(path.join(OUTPUT_DIR, "no-text-layer.pdf"), await writeNoTextLayer());

  await verify("roster-text-layer.pdf", { expectText: true });
  await verify("timetable-text-layer.pdf", { expectText: true });
  await verify("no-text-layer.pdf", { expectText: false });

  console.log(`Wrote synthetic PDFs to ${OUTPUT_DIR}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
