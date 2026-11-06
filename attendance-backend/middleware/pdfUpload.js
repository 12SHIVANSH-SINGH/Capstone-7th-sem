const multer = require("multer");
const ErrorHandler = require("../utils/errorhandler");
const { createRateLimiter } = require("./rateLimit");
const { MAX_PDF_BYTES } = require("../utils/pdfText");

// Keep a teacher-supplied PDF in memory only. It is parsed for preview and
// discarded; no upload is written to disk or stored in MongoDB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PDF_BYTES,
    files: 1,
    fields: 0,
  },
});

const acceptPdfUpload = (req, res, next) =>
  upload.single("file")(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        const tooLarge = new ErrorHandler("PDF must be 10 MB or smaller.", 413);
        tooLarge.code = "pdf_too_large";
        return next(tooLarge);
      }
      const invalid = new ErrorHandler("Upload exactly one PDF file.", 400);
      invalid.code = "pdf_upload_invalid";
      return next(invalid);
    }

    return next(error);
  });

// Both PDF preview routes share the same preview limits. Each router creates
// its own in-memory bucket, so the cap is per route, account and IP.
const createPdfPreviewLimiter = () =>
  createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 20,
    message: "Too many PDF extractions. Wait a few minutes and try again.",
    keyFor: (req) => `${req.user?._id || "unknown"}:${req.ip || "unknown"}`,
  });

module.exports = acceptPdfUpload;
module.exports.acceptPdfUpload = acceptPdfUpload;
module.exports.createPdfPreviewLimiter = createPdfPreviewLimiter;
module.exports.MAX_PDF_BYTES = MAX_PDF_BYTES;
