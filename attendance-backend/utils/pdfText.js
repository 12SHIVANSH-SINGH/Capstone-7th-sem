/**
 * Deterministic PDF text extraction.
 *
 * This module never renders, OCRs or stores a document. It reads the PDF's
 * embedded text layer with PDF.js, reconstructs visual lines from text-item
 * positions and returns plain text for a teacher to review. A scanned PDF with
 * no text layer is rejected explicitly; local OCR is a later slice.
 *
 * PDF.js is ESM-only, so it is loaded with a dynamic import from this CommonJS
 * module. `isEvalSupported` stays false: a teacher-supplied PDF is untrusted
 * input and must never be allowed to execute embedded JavaScript.
 */

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_PAGES = 20;
const MAX_CHARS = 200000;

class PdfTextError extends Error {
  constructor(message, { code = "pdf_invalid", statuscode = 422 } = {}) {
    super(message);
    this.name = "PdfTextError";
    this.code = code;
    this.statuscode = statuscode;
  }
}

let pdfjsPromise;

const loadPdfjs = () => {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  return pdfjsPromise;
};

const hasPdfHeader = (buffer) => {
  const headerWindow = buffer.subarray(0, Math.min(buffer.length, 1024));
  return headerWindow.includes("%PDF-");
};

const lineTolerance = (fragment) => {
  const height = Number(fragment.height) || 0;
  return Math.max(1.5, Math.min(height > 0 ? height * 0.35 : 2.5, 4));
};

const shouldInsertSpace = (previous, current) => {
  const previousRight = previous.x + (Number(previous.width) || 0);
  const gap = current.x - previousRight;
  const characters = Math.max(previous.str.length, 1);
  const characterWidth = (Number(previous.width) || 0) / characters;
  const threshold = Math.max(0.8, Math.min(characterWidth * 0.5, 3));
  return gap > threshold;
};

/**
 * Turn PDF.js text items into reading-order plain-text lines.
 *
 * PDF y coordinates grow upwards, so lines are sorted by descending y. Items on
 * the same visual line are grouped with a small tolerance, sorted by x, and
 * joined without spaces when the generator emitted one item per character.
 * This handles both whole-line items (PDFKit) and per-word/per-character items
 * (many office exporters) without trusting the content stream order.
 */
const reconstructLines = (items = []) => {
  const fragments = [];

  for (const item of items) {
    if (!item || typeof item.str !== "string" || !item.str.trim()) continue;
    if (!Array.isArray(item.transform) && !ArrayBuffer.isView(item.transform)) continue;
    const x = Number(item.transform[4]);
    const y = Number(item.transform[5]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    fragments.push({
      str: item.str,
      x,
      y,
      width: Number(item.width) || 0,
      height: Number(item.height) || 0,
    });
  }

  fragments.sort((left, right) => right.y - left.y || left.x - right.x);

  const lines = [];
  for (const fragment of fragments) {
    let line = lines.find((candidate) => Math.abs(candidate.y - fragment.y) <= lineTolerance(fragment));
    if (!line) {
      line = { y: fragment.y, fragments: [] };
      lines.push(line);
    }
    line.fragments.push(fragment);
  }

  return lines
    .sort((left, right) => right.y - left.y)
    .map((line) => {
      const ordered = line.fragments.sort((left, right) => left.x - right.x);
      let text = "";
      let previous = null;

      for (const fragment of ordered) {
        if (!previous) {
          text = fragment.str;
        } else {
          if (shouldInsertSpace(previous, fragment)) text += " ";
          text += fragment.str;
        }
        previous = fragment;
      }

      return text.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean);
};

/**
 * Extract selectable text from a PDF buffer.
 *
 * @param {Buffer} buffer
 * @param {{ maxPages?: number, maxChars?: number }} options
 * @returns {Promise<{
 *   text: string,
 *   pageCount: number,
 *   extractedPages: number,
 *   lineCount: number,
 *   charCount: number,
 *   hasText: boolean
 * }>}
 */
const extractPdfText = async (buffer, { maxPages = MAX_PAGES, maxChars = MAX_CHARS } = {}) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new PdfTextError("Choose a PDF file to extract.", { code: "pdf_missing", statuscode: 400 });
  }
  if (buffer.length > MAX_PDF_BYTES) {
    throw new PdfTextError("PDF must be 10 MB or smaller.", {
      code: "pdf_too_large",
      statuscode: 413,
    });
  }
  if (!hasPdfHeader(buffer)) {
    throw new PdfTextError("That file is not a valid PDF.", { code: "pdf_invalid", statuscode: 400 });
  }

  const pdfjs = await loadPdfjs();
  let loadingTask;
  let document;

  try {
    loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      useSystemFonts: true,
      disableFontFace: true,
      useWorkerFetch: false,
      verbosity: 0,
    });
    document = await loadingTask.promise;

    if (document.numPages > maxPages) {
      throw new PdfTextError(`PDF has too many pages (max ${maxPages}).`, {
        code: "pdf_too_many_pages",
        statuscode: 422,
      });
    }

    const pageTexts = [];
    let lineCount = 0;
    let charCount = 0;

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = reconstructLines(content.items);
      const text = lines.join("\n");

      lineCount += lines.length;
      charCount += text.length;
      if (charCount > maxChars) {
        throw new PdfTextError("PDF contains too much text to review safely.", {
          code: "pdf_too_much_text",
          statuscode: 422,
        });
      }

      pageTexts.push(text);
      page.cleanup();
    }

    const text = pageTexts.join("\n\n").trim();
    return {
      text,
      pageCount: document.numPages,
      extractedPages: document.numPages,
      lineCount,
      charCount,
      hasText: text.length > 0,
    };
  } catch (error) {
    if (error instanceof PdfTextError) throw error;
    if (error?.name === "PasswordException") {
      throw new PdfTextError("This PDF is password-protected. Remove the password and try again.", {
        code: "pdf_password_protected",
        statuscode: 422,
      });
    }
    throw new PdfTextError("Could not read this PDF. It may be damaged or unsupported.", {
      code: "pdf_unreadable",
      statuscode: 422,
    });
  } finally {
    try {
      if (loadingTask) await loadingTask.destroy();
      else if (document) await document.cleanup();
    } catch (error) {
      // Cleanup must never mask the extraction result.
    }
  }
};

module.exports = {
  MAX_PDF_BYTES,
  MAX_PAGES,
  MAX_CHARS,
  PdfTextError,
  extractPdfText,
  reconstructLines,
};
