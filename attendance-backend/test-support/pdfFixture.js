const PDFDocument = require("pdfkit");

/**
 * Build a PDF buffer in memory for tests. The callback receives the PDFKit
 * document; callers add text/pages and this helper returns the finished bytes.
 */
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

module.exports = { createPdf };
