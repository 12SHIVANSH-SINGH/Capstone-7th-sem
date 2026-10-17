const catchAsyncError = require("../middleware/catchasyncerror");
const userModels = require("../models/userModels");
const ErrorHandler = require("../utils/errorhandler");
const sendToken = require("../utils/jwttoken");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieOptions = require("../utils/cookieOptions");

const {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} = require("@simplewebauthn/server");

const CLIENT_URL = process.env.CLIENT_URL || "https://attendance-frontend-sage.vercel.app";
const RP_ID = process.env.RP_ID || "attendance-frontend-sage.vercel.app";

// 📌 Traditional Registration (Email + Password)
exports.registerUser = catchAsyncError(async (req, res, next) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return next(new ErrorHandler("Please enter all details", 400));
    }

    let user = await userModels.findOne({ email });

    if (user) {
        return next(new ErrorHandler("User already exists", 400));
    }

    user = await userModels.create({
        name,
        email,
        password,
        // Public registration can never create a teacher account. Teacher access
        // is provisioned through verified Google Workspace sign-in instead.
        role: "student",
    });

    sendToken(user, 201, res);
});

// 📌 Traditional Login (Email + Password)
exports.loginUser = catchAsyncError(async (req, res, next) => {
    const { email, password } = req.body;
    // console.log(email,password);

    if (!email || !password) {
        return next(new ErrorHandler("Please enter all details", 400));
    }

    const user = await userModels.findOne({ email }).select("+password");
    // console.log(user)

    if (!user) {
        return next(new ErrorHandler("Invalid email or password", 401));
    }

    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
        return next(new ErrorHandler("Invalid email or password", 401));
    }

    sendToken(user, 200, res);
});

// 📌 Logout User
exports.logout = catchAsyncError(async (req, res, next) => {
    res.cookie("token", null, cookieOptions(new Date(Date.now())));

    res.status(200).json({
        success: true,
        message: "Logged out successfully",
    });
});

// 📌 Check if User is Logged In
exports.isAuth = catchAsyncError(async (req, res, next) => {
    const { token } = req.cookies;
    // console.log(req.cookies);

    if (!token) {
        return next(new ErrorHandler("Please login to access this resource", 401));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await userModels.findById(decoded.id);

    res.status(200).json({
        success: true,
        user: req.user,
    });
});

// 📌 WebAuthn - Initiate Registration
exports.initRegister = catchAsyncError(async (req, res) => {
    const { email } = req.query;

    if (!email) {
        return res.status(400).json({ error: "Email is required" });
    }

    let user = await userModels.findOne({ email });

    if (user) {
        return res.status(400).json({ error: "User already exists" });
    }

    // ✅ Convert user ID to Uint8Array to comply with latest WebAuthn changes
    const userIdBuffer = new TextEncoder().encode(email); // Convert email to Uint8Array

    const options = await generateRegistrationOptions({
        rpID: RP_ID,
        rpName: "Your App Name",
        userID: userIdBuffer,
        userName: email,
        authenticatorSelection: {
            authenticatorAttachment: "platform", // Force local device authenticator
            requireResidentKey: true, // Device-bound key
            userVerification: "required", // Enforce PIN/biometric
            residentKey: "required"
        },
        excludeCredentials: [] 
    });

    res.cookie(
        "regInfo",
        JSON.stringify({
            userId: Array.from(userIdBuffer), // ✅ Store as array since Uint8Array is not JSON serializable
            email,
            challenge: options.challenge,
        }),
        { ...cookieOptions(), maxAge: 60000 }
    );

    res.json(options);
});


// 📌 WebAuthn - Verify Registration
exports.verifyRegister = catchAsyncError(async (req, res) => {
    try {
        // console.log("Received Cookies:", req.cookies);

        // Validate the presence of registration info in cookies
        if (!req.cookies.regInfo) {
            return res.status(400).json({ error: "Registration info not found" });
        }

        let regInfo;
        try {
            regInfo = JSON.parse(req.cookies.regInfo);
        } catch (err) {
            return res.status(400).json({ error: "Invalid registration data in cookie" });
        }

        if (!regInfo || !regInfo.challenge || !regInfo.email) {
            return res.status(400).json({ error: "Missing challenge or email in registration info" });
        }

        // console.log("Processing Registration for:", regInfo.email);

        // Verify the WebAuthn response
        const verification = await verifyRegistrationResponse({
            response: req.body,
            expectedChallenge: regInfo.challenge,
            expectedOrigin: CLIENT_URL,
            expectedRPID: RP_ID,
        });


        if (!verification.verified) {
            return res.status(400).json({ verified: false, error: "Verification failed" });
        }

        // Extract relevant fields from the response
        const { id, publicKey, counter, transports } = verification.registrationInfo.credential;
        const { credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
        // const transports = req.body.transports || []; // Use provided transports or default to empty array
        // console.log(verification.registrationInfo);
        // Store user in the database
        const { email, password, role,name } = req.query;
        

        const user = await userModels.create({
            name,
            password,
            email: regInfo.email,
            role,
            passKey: {
                id,  // Credential ID
                publicKey,  // Public Key
                counter,  // Counter for preventing replay attacks
                deviceType: credentialDeviceType,  // Device type
                backedUp: credentialBackedUp,  // Whether it's backed up
                transport: transports,  // Transport methods
            },
        });

        // console.log("User registered successfully:", user);

        // Clear the registration cookie
        res.clearCookie("regInfo");

        // Send authentication token
        sendToken(user, 201, res);
    } catch (error) {
        // console.error("WebAuthn Verification Error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});


// 📌 WebAuthn - Initiate Authentication
exports.initAuth = catchAsyncError(async (req, res) => {
    const { email } = req.query;

    if (!email) {
        return res.status(400).json({ error: "Email is required" });
    }

    const user = await userModels.findOne({ email });

    if (!user || !user.passKey) {
        return res.status(400).json({ error: "No user found" });
    }

    const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        userVerification: "required", // Force PIN/biometric check
        allowCredentials: [
            {
                id: user.passKey.id,
                type: "public-key",
                transports: ["internal"] // Force internal authenticator
            },
        ],
    });

    res.cookie(
        "authInfo",
        JSON.stringify({
            userId: user._id,
            challenge: options.challenge,
        }),
        { ...cookieOptions(), maxAge: 60000 }
    );

    res.json(options);
});

// 📌 WebAuthn - Verify Authentication
exports.verifyAuth = catchAsyncError(async (req, res) => {
    try {
        // Get client IP (ensure Express trust proxy is configured correctly)
        if (!req.cookies.authInfo) {
            return res.status(400).json({ error: "Authentication info not found in cookies." });
        }

        const authInfo = JSON.parse(req.cookies.authInfo);
        // console.log("🔹 AuthInfo:", authInfo);
        // console.log("🔹 Request Body:", JSON.stringify(req.body, null, 2));

        const user = await userModels.findById(authInfo.userId);
        if (!user || !user.passKey) {
            return res.status(400).json({ error: "Invalid user or missing passKey." });
        }

        if (!user.passKey.publicKey) {
            return res.status(400).json({ error: "User's passKey is incomplete." });
        }

        // console.log("🔹 Expected Challenge:", authInfo.challenge);
        // console.log("🔹 Type of Challenge:", typeof authInfo.challenge);

        // Convert the credential ID and public key to Buffer
        const credentialId = Buffer.from(user.passKey.id, "base64");

        let publicKey;
        if (typeof user.passKey.publicKey === "string" && user.passKey.publicKey.includes(",")) {
            // Convert comma-separated numbers to Buffer
            publicKey = Buffer.from(user.passKey.publicKey.split(",").map(Number));
        } else {
            // Assume it's Base64-encoded
            publicKey = Buffer.from(user.passKey.publicKey, "base64");
        }

        // Perform WebAuthn authentication verification
        const verification = await verifyAuthenticationResponse({
            response: req.body,
            expectedChallenge: String(authInfo.challenge || ""), // Ensure challenge is a string
            expectedOrigin: CLIENT_URL,
            expectedRPID: RP_ID,
            credential: {
                id: credentialId,
                publicKey: publicKey,
                counter: user.passKey.counter || 0,
                transports: user.passKey.transport || [],
            },
        });
        // console.log(verification)

        if (!verification.verified) {
            return res.status(400).json({ verified: false, error: "Authentication verification failed." });
        }

        // After successful verification
        user.passKey.counter = verification.authenticationInfo.newCounter;
        await user.save();

        res.clearCookie("authInfo");
        
        // Include location in response (optional)
        res.status(200).json({
            success: true
        });

    } catch (error) {
        console.error("❌ Error in verifyAuth:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});
