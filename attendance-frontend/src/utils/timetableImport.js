/**
 * Helpers for the timetable PDF text preview.
 *
 * The server extracts only the embedded text layer. The browser never parses
 * rows, matches classes or creates slots; the teacher reads the preview and
 * adds each slot through the normal timetable form.
 */

const { isPdfFile } = require("./rosterImport");

const extractionSummary = (extraction) => {
  const pages = Number(extraction?.pageCount) || 0;
  const lines = Number(extraction?.lineCount) || 0;
  const pageLabel = `${pages} page${pages === 1 ? "" : "s"}`;
  const lineLabel = `${lines} line${lines === 1 ? "" : "s"}`;

  return `Extracted ${pageLabel} and ${lineLabel}. Nothing has been scheduled; review the text and add each slot manually.`;
};

const importErrorMessage = (error, fallback = "Could not extract this timetable PDF.") => {
  const code = error?.response?.data?.code;
  if (code === "pdf_no_text_layer") {
    return "This timetable PDF has no selectable text layer. Add slots manually for now; local OCR is not built yet.";
  }
  if (code === "pdf_password_protected") {
    return "This PDF is password-protected. Remove the password and upload it again.";
  }
  if (code === "pdf_too_many_pages") {
    return "This PDF has too many pages to review safely (max 20).";
  }
  if (code === "pdf_too_much_text") {
    return "This PDF contains too much text to review safely. Upload a smaller timetable.";
  }
  return error?.response?.data?.message || error?.message || fallback;
};

module.exports = { isPdfFile, extractionSummary, importErrorMessage };
