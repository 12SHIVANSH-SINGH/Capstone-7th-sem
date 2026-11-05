/**
 * Helpers for the roster PDF import UI.
 *
 * The browser only decides whether to send a file as multipart PDF. The server
 * remains authoritative: it checks the PDF header, extracts text and rejects a
 * scanned document with no text layer.
 */

const PDF_MIME = "application/pdf";

const isPdfFile = (file) => {
  if (!file) return false;
  if (file.type === PDF_MIME) return true;
  return /\.pdf$/i.test(String(file.name || ""));
};

const extractionSummary = (extraction) => {
  const pages = Number(extraction?.pageCount) || 0;
  const emails = Number(extraction?.institutionalEmailCount) || 0;
  const pageLabel = `${pages} page${pages === 1 ? "" : "s"}`;
  const emailLabel = emails > 0
    ? `${emails} college email${emails === 1 ? "" : "s"} found`
    : "no college emails found";

  return `Extracted ${pageLabel}; ${emailLabel}. Review the text, then run Preview roster.`;
};

const importErrorMessage = (error, fallback = "Could not extract this PDF.") => {
  const code = error?.response?.data?.code;
  if (code === "pdf_no_text_layer") {
    return "This PDF has no selectable text layer. Use CSV or paste the list instead; local OCR is not built yet.";
  }
  if (code === "pdf_password_protected") {
    return "This PDF is password-protected. Remove the password and upload it again.";
  }
  if (code === "pdf_too_many_pages") {
    return "This PDF has too many pages to review safely (max 20).";
  }
  if (code === "pdf_too_much_text") {
    return "This PDF contains too much text to review safely. Upload a smaller roster.";
  }
  return error?.response?.data?.message || error?.message || fallback;
};

module.exports = { PDF_MIME, isPdfFile, extractionSummary, importErrorMessage };
