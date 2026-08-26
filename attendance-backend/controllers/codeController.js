const catchAsyncError = require("../middleware/catchasyncerror");
const UniqueCode = require("../models/uniqueCodeModels");
const ErrorHandler = require("../utils/errorhandler");
// const cron = require('node-cron');

// Generate new attendance code
exports.generateCode = catchAsyncError(async (req, res, next) => {
  const { batch, year, course, room } = req.body;

  // Check for existing active code for this class
  const existingCode = await UniqueCode.findOne({
    batch,
    year,
    course,
    room,
    expiresAt: { $gt: new Date() }
  });

  if (existingCode) {
    return next(new ErrorHandler("An active code already exists for this class", 400));
  }

  // Generate unique 6-digit code
  const generateUniqueCode = async () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString().substring(0, 6);
    const exists = await UniqueCode.findOne({ code });
    return exists ? generateUniqueCode() : code;
  };

  const code = await generateUniqueCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  const newCode = await UniqueCode.create({
    code,
    batch,
    year,
    course,
    room
  });

  res.status(201).json({
    success: true,
    code: newCode.code,
  });
});

// Delete code
exports.deleteCode = catchAsyncError(async (req, res, next) => {
  const { generatedCode } = req.body;

  // Verify database field name matches "code"
  const deletedCode = await UniqueCode.findOneAndDelete({ code: generatedCode }); // Explicit syntax

  if (!deletedCode) {
    return next(new ErrorHandler("Code not found", 404));
  }

  res.status(200).json({
    success: true,
    message: "Code deleted successfully"
  });
})

// Get code details
exports.getCodeDetails = catchAsyncError(async (req, res, next) => {
  const { uniqueNumber } = req.body;


  const codeData = await UniqueCode.findOne({ code: uniqueNumber });

  if (!codeData || codeData.expiresAt < new Date()) {
    return next(new ErrorHandler("Invalid or expired code", 400));
  }

  res.status(200).json({
    success: true,
    data: {
      batch: codeData.batch,
      year: codeData.year,
      course: codeData.course,
      room: codeData.room,
    }
  });
});

// // Cleanup expired codes (run every hour)
// cron.schedule('0 * * * *', async () => {
//   const result = await UniqueCode.deleteMany({ expiresAt: { $lt: new Date() } });
//   console.log(`Cleaned up ${result.deletedCount} expired codes`);
// });