const { OAuth2Client } = require("google-auth-library");
const catchAsyncError = require("../middleware/catchasyncerror");
const ErrorHandler = require("../utils/errorhandler");
const sendToken = require("../utils/jwttoken");
const User = require("../models/userModels");
const Enrollment = require("../models/enrollmentModels");
const DeviceBindingRequest = require("../models/deviceBindingRequestModels");
const CourseClass = require("../models/classModels");
const { fingerprintPublicKey } = require("../utils/deviceBinding");
const { isDevAuthEnabled, isDevEmail } = require("../utils/devAuth");
const {
  normaliseEmail,
  isAllowedGoogleSignIn,
  resolveSignInRole,
  isTestAccount,
  isTestStudent,
  isWorkspaceAccount,
  testStudentEmails,
} = require("../utils/signInPolicy");

const getGoogleClient = () => {
  if (!process.env.GOOGLE_CLIENT_ID) return null;
  return new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
};

const hasRosterAccess = async (email) => Enrollment.exists({ email, status: "active" });

// MongoDB reports which unique index lost the race. Only an email collision is
// a retryable first-sign-in race; a googleSubject collision means a different
// local account already claims this Google identity.
const duplicateKeyField = (error) => {
  if (error?.keyPattern) return Object.keys(error.keyPattern)[0] || null;
  if (error?.keyValue) return Object.keys(error.keyValue)[0] || null;
  return null;
};

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
  if (isDevEmail(email)) {
    return next(new ErrorHandler("Dev test identities cannot sign in with Google", 403));
  }
  if (
    !payload ||
    typeof payload.sub !== "string" ||
    !payload.sub ||
    !isAllowedGoogleSignIn({
      email,
      emailVerified: payload.email_verified === true,
      hostedDomain: payload.hd,
    })
  ) {
    return next(new ErrorHandler("Sign in with your NIT Jamshedpur Google Workspace account", 403));
  }

  let user = await User.findOne({ email });

  if (user?.googleSubject && user.googleSubject !== payload.sub) {
    return next(new ErrorHandler("This account is already linked to a different Google identity", 403));
  }

  // Test accounts (TEST_STUDENT_EMAILS / TEST_TEACHER_EMAILS) skip the roster
  // gate: they exist to exercise the app before the pilot and are never on a
  // college roster.
  const roleDecision = resolveSignInRole({
    email,
    existingRole: user?.role || null,
    hasRosterAccess: await hasRosterAccess(email),
  });
  if (!roleDecision.allowed) {
    return next(new ErrorHandler("Your college account is not on an active class roster", 403));
  }

  let created = false;
  let promoted = false;
  let demoted = false;

  if (!user) {
    try {
      user = await User.create({
        name: payload.name || email.split("@")[0],
        email,
        role: roleDecision.role,
        authProvider: "google",
        googleSubject: payload.sub,
      });
      created = true;
    } catch (error) {
      // Two tabs can race the first sign-in. The unique email index picks one
      // winner; the loser re-reads and continues instead of returning a
      // confusing duplicate-key 400. A duplicated Google subject is not a
      // race with the same account: refuse it instead of retrying by email.
      if (error?.code !== 11000) throw error;
      const field = duplicateKeyField(error);
      if (field === "googleSubject") {
        return next(
          new ErrorHandler("This Google identity is already linked to another account", 403)
        );
      }
      if (field !== "email") throw error;
      user = await User.findOne({ email });
      if (!user) {
        return next(
          new ErrorHandler("This account is already linked to a different Google identity", 403)
        );
      }
      if (user.googleSubject && user.googleSubject !== payload.sub) {
        return next(
          new ErrorHandler("This account is already linked to a different Google identity", 403)
        );
      }
    }
  }

  if (!created) {
    user.googleSubject = payload.sub;
    user.authProvider = "google";
    if (roleDecision.role === "teacher" && user.role !== "teacher") {
      user.role = "teacher";
      promoted = true;
    }
    // A Gmail account that has been moved out of TEST_TEACHER_EMAILS and into
    // TEST_STUDENT_EMAILS should lose the old teacher role. Never demote a
    // college teacher; TEACHER_EMAILS removal is not meant to remove a person.
    if (roleDecision.role === "student" && user.role === "teacher" && !isWorkspaceAccount(email)) {
      user.role = "student";
      demoted = true;
    }
    if (!user.name && payload.name) user.name = payload.name;
    try {
      await user.save();
    } catch (error) {
      if (error?.code === 11000 && duplicateKeyField(error) === "googleSubject") {
        return next(
          new ErrorHandler("This Google identity is already linked to another account", 403)
        );
      }
      throw error;
    }
  }

  // Audit only after persistence: a failed create/save must not leave a line
  // claiming a sign-in that never happened.
  if (isTestAccount(email)) {
    const details = [
      created ? "new" : null,
      promoted ? "promoted" : null,
      demoted ? "demoted" : null,
    ]
      .filter(Boolean)
      .join(", ");
    console.info(
      `[auth] test ${roleDecision.role} sign-in: ${email} user=${user._id}${details ? ` (${details})` : ""}`
    );
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
  // Dev personas are for fast two-phone testing; every browser they use is
  // approved without a review. This branch only exists when dev auth is on and
  // the account was created by the dev login route.
  if (req.user.authProvider === "dev" && isDevAuthEnabled()) {
    req.user.deviceBinding = {
      fingerprint,
      publicKeyJwk: req.body.publicKeyJwk,
      approvedAt: now,
      lastSeenAt: now,
    };
    req.user.markModified("deviceBinding");
    await req.user.save();
    return res.status(201).json({ success: true, status: "approved", devAutoApproved: true });
  }

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
