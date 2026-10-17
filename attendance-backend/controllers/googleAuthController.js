const { OAuth2Client } = require("google-auth-library");
const catchAsyncError = require("../middleware/catchasyncerror");
const ErrorHandler = require("../utils/errorhandler");
const sendToken = require("../utils/jwttoken");
const User = require("../models/userModels");
const Enrollment = require("../models/enrollmentModels");
const DeviceBindingRequest = require("../models/deviceBindingRequestModels");
const CourseClass = require("../models/classModels");
const { fingerprintPublicKey } = require("../utils/deviceBinding");
const {
  WORKSPACE_DOMAIN,
  normaliseEmail,
  isProvisionedTeacher,
  isTestStudent,
  isWorkspaceAccount,
  testStudentEmails,
} = require("../utils/signInPolicy");

const getGoogleClient = () => {
  if (!process.env.GOOGLE_CLIENT_ID) return null;
  return new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
};

const hasRosterAccess = async (email) => Enrollment.exists({ email, status: "active" });

exports.googleSignIn = catchAsyncError(async (req, res, next) => {
  const { credential } = req.body;
  const googleClient = getGoogleClient();

  if (!googleClient) {
    return next(new ErrorHandler("Google sign-in is not configured on the server", 503));
  }
  if (!credential) {
    return next(new ErrorHandler("Google ID token is required", 400));
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (error) {
    return next(new ErrorHandler("Google sign-in token could not be verified", 401));
  }

  const email = normaliseEmail(payload?.email);
  const workspaceAccount = Boolean(payload) && payload.hd === WORKSPACE_DOMAIN && isWorkspaceAccount(email);
  const testAccount = isTestStudent(email);
  if (!payload || !payload.email_verified || (!workspaceAccount && !testAccount)) {
    return next(new ErrorHandler("Sign in with your NIT Jamshedpur Google Workspace account", 403));
  }

  let user = await User.findOne({ email }).select("+password");
  // Test students (TEST_STUDENT_EMAILS) skip the roster gate: they exist to
  // exercise the app before the pilot and are never on a college roster.
  const rosterAccess = (await hasRosterAccess(email)) || testAccount;

  if (user?.googleSubject && user.googleSubject !== payload.sub) {
    return next(new ErrorHandler("This account is already linked to a different Google identity", 403));
  }

  const teacherAccess = user?.role === "teacher" || isProvisionedTeacher(email);
  if (user?.role === "student" && !rosterAccess) {
    return next(new ErrorHandler("Your account is not on an active class roster", 403));
  }
  if (!user && !rosterAccess && !teacherAccess) {
    return next(new ErrorHandler("Your college account is not on an active class roster", 403));
  }

  if (!user) {
    user = await User.create({
      name: payload.name || email.split("@")[0],
      email,
      role: teacherAccess ? "teacher" : "student",
      authProvider: "google",
      googleSubject: payload.sub,
    });
  } else {
    user.googleSubject = payload.sub;
    user.authProvider = "google";
    if (!user.name && payload.name) user.name = payload.name;
    await user.save();
  }

  sendToken(user, 200, res);
});

exports.claimDeviceBinding = catchAsyncError(async (req, res, next) => {
  if (req.user.role !== "student") {
    return next(new ErrorHandler("Only student devices need attendance binding", 400));
  }

  const fingerprint = fingerprintPublicKey(req.body.publicKeyJwk);
  if (!fingerprint) {
    return next(new ErrorHandler("A valid P-256 device public key is required", 400));
  }

  const now = new Date();
  if (!req.user.deviceBinding?.fingerprint) {
    req.user.deviceBinding = {
      fingerprint,
      publicKeyJwk: req.body.publicKeyJwk,
      approvedAt: now,
      lastSeenAt: now,
    };
    req.user.markModified("deviceBinding");
    await req.user.save();
    return res.status(201).json({ success: true, status: "approved", firstBinding: true });
  }

  if (req.user.deviceBinding.fingerprint === fingerprint) {
    req.user.deviceBinding.lastSeenAt = now;
    await req.user.save();
    return res.status(200).json({ success: true, status: "approved", firstBinding: false });
  }

  const request = await DeviceBindingRequest.findOneAndUpdate(
    { student: req.user._id, fingerprint },
    {
      $set: { publicKeyJwk: req.body.publicKeyJwk, status: "pending" },
      $setOnInsert: { student: req.user._id, fingerprint },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  res.status(202).json({ success: true, status: "review", requestId: request._id });
});

exports.getDeviceBindingStatus = catchAsyncError(async (req, res) => {
  const pendingRequest = await DeviceBindingRequest.findOne({ student: req.user._id, status: "pending" }).sort({ updatedAt: -1 });
  res.status(200).json({
    success: true,
    status: pendingRequest ? "review" : req.user.deviceBinding?.fingerprint ? "approved" : "unbound",
  });
});

const teacherCanReviewStudent = async (teacherId, studentId) => {
  const student = await User.findById(studentId).select("email");
  if (!student) return false;
  // Test accounts are not on any roster; any teacher may review them so the
  // device queue stays usable during testing.
  if (isTestStudent(student.email)) return true;
  const classes = await CourseClass.find({ teacher: teacherId }).select("_id");
  if (classes.length === 0) return false;
  return Enrollment.exists({ class: { $in: classes.map((courseClass) => courseClass._id) }, email: student.email, status: "active" });
};

exports.listDeviceReviews = catchAsyncError(async (req, res) => {
  const classes = await CourseClass.find({ teacher: req.user._id }).select("_id");
  const enrolledEmails = await Enrollment.distinct("email", { class: { $in: classes.map((courseClass) => courseClass._id) }, status: "active" });
  // Test accounts never appear on a roster; show their pending device changes too.
  const visibleEmails = [...new Set([...enrolledEmails.map(normaliseEmail), ...testStudentEmails()])];
  const students = await User.find({ email: { $in: visibleEmails }, role: "student" }).select("_id");
  const reviews = await DeviceBindingRequest.find({ student: { $in: students.map((student) => student._id) }, status: "pending" })
    .populate("student", "name email")
    .sort({ createdAt: 1 });

  res.status(200).json({ success: true, reviews });
});

exports.decideDeviceReview = catchAsyncError(async (req, res, next) => {
  const { decision } = req.body;
  if (!["approved", "rejected"].includes(decision)) {
    return next(new ErrorHandler("Decision must be approved or rejected", 400));
  }

  const review = await DeviceBindingRequest.findOne({ _id: req.params.reviewId, status: "pending" });
  if (!review || !(await teacherCanReviewStudent(req.user._id, review.student))) {
    return next(new ErrorHandler("Device review not found", 404));
  }

  if (decision === "approved") {
    const student = await User.findById(review.student);
    student.deviceBinding = {
      fingerprint: review.fingerprint,
      publicKeyJwk: review.publicKeyJwk,
      approvedAt: new Date(),
      lastSeenAt: new Date(),
    };
    student.markModified("deviceBinding");
    await student.save();
  }

  review.status = decision;
  review.reviewedBy = req.user._id;
  review.reviewedAt = new Date();
  await review.save();

  res.status(200).json({ success: true, status: decision });
});
