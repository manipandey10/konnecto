const userModel = require("../model/user.model");
const emailService = require("../service/email.service");
const otpService = require("../service/otp.service");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const blacklistModel = require("../model/blacklist.model");
const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
};
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getUserPayload(user) {
    return {
        id: user._id,
        name: user.name,
        email: user.email,
        isVerified: Boolean(user.isVerified),
    };
}

async function sendNotification(sendEmail, user, notificationName) {
    try {
        await sendEmail(user.email, user.name);
    } catch (error) {
        const errorCode = error?.code || error?.name || "UNKNOWN";
        console.error(`${notificationName} email failed (${errorCode}).`);
    }
}

async function registerUser(req, res) {
    const body = req.body || {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!name || !email || !password) {
        return res.status(400).json({
            message: "Name, email, and password are required.",
        });
    }
    if (!EMAIL_PATTERN.test(email)) {
        return res.status(400).json({
            message: "Please provide a valid email address.",
        });
    }

    try {
        const existingUser = await userModel.findOne({
            $or: [
                { email: new RegExp(`^${escapeRegex(email)}$`, "i") },
                { name },
            ],
        });
        if (existingUser) {
            return res.status(409).json({
                message: "An account with that name or email already exists.",
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await userModel.create({
            name,
            email,
            password: hashedPassword,
            isVerified: false,
        });

        await otpService.sendOtpForUser(user, "registration");
        await sendNotification(
            emailService.sendRegistrationEmail,
            user,
            "Registration welcome",
        );

        return res.status(201).json({
            message: "Account created. Please verify your email with the OTP sent to your inbox.",
            requiresOtp: true,
            user: getUserPayload(user),
        });
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(409).json({
                message: "An account with that name or email already exists.",
            });
        }
        console.error("Registration failed:", error?.name || "UnknownError");
        return res.status(500).json({
            message: "Unable to create your account right now.",
        });
    }
}

async function loginUser(req, res) {
    const body = req.body || {};
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if ((!email && !name) || !password) {
        return res.status(400).json({
            message: "Email or name and password are required.",
        });
    }
    if (email && !EMAIL_PATTERN.test(email)) {
        return res.status(400).json({
            message: "Please provide a valid email address.",
        });
    }

    try {
        const user = await userModel.findOne(email
            ? { email: new RegExp(`^${escapeRegex(email)}$`, "i") }
            : { name });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({
                message: "Invalid email/name or password.",
            });
        }

        await otpService.sendOtpForUser(user, "login");
        await sendNotification(emailService.sendLoginEmail, user, "Login notification");

        return res.status(200).json({
            message: "OTP sent to your email. Please verify to continue.",
            requiresOtp: true,
            user: getUserPayload(user),
        });
    } catch (error) {
        console.error("Login failed:", error?.name || "UnknownError");
        return res.status(500).json({
            message: "Unable to sign in right now.",
        });
    }
}

async function verifyOtp(req, res) {
    const body = req.body || {};
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const otp = typeof body.otp === "string" ? body.otp.trim() : "";
    const purpose = body.purpose === "registration" ? "registration" : "login";

    if (!email || !otp) {
        return res.status(400).json({
            message: "Email and OTP are required.",
        });
    }

    try {
        const user = await userModel.findOne({ email: new RegExp(`^${escapeRegex(email)}$`, "i") });
        if (!user) {
            return res.status(404).json({
                message: "User not found.",
            });
        }

        const otpVerification = await otpService.verifyOtp(user, otp, purpose);
        if (!otpVerification.valid) {
            return res.status(otpVerification.status || 400).json({
                message: otpVerification.message,
            });
        }

        user.isVerified = true;
        await user.save();

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET_KEY);
        res.cookie("token", token, cookieOptions);

        return res.status(200).json({
            message: "OTP verified successfully.",
            token,
            user: getUserPayload(user),
        });
    } catch (error) {
        console.error("OTP verification failed:", error?.name || "UnknownError");
        return res.status(500).json({
            message: "Unable to verify the OTP right now.",
        });
    }
}

async function resendOtp(req, res) {
    const body = req.body || {};
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const purpose = body.purpose === "registration" ? "registration" : "login";

    if (!email) {
        return res.status(400).json({
            message: "Email is required.",
        });
    }

    try {
        const user = await userModel.findOne({ email: new RegExp(`^${escapeRegex(email)}$`, "i") });
        if (!user) {
            return res.status(404).json({
                message: "User not found.",
            });
        }

        await otpService.resendOtpForUser(user, purpose);
        return res.status(200).json({
            message: "A new OTP has been sent to your email.",
            requiresOtp: true,
            user: getUserPayload(user),
        });
    } catch (error) {
        if (error?.status === 429) {
            return res.status(429).json({
                message: error.message,
            });
        }
        console.error("OTP resend failed:", error?.name || "UnknownError");
        return res.status(500).json({
            message: "Unable to resend the OTP right now.",
        });
    }
}

async function logoutUser(req, res) {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
    const token = bearerToken || req.cookies?.token;
    if (token) {
        await blacklistModel.create({ token });
    }

    res.clearCookie("token", cookieOptions);
    return res.status(200).json({
        message: "USER LOGOUT SUCESSFULLY.",
    });
}

async function getCurrentUser(req, res) {
    return res.status(200).json({
        message: "THE ACTIVE USER IS FETCHED",
        user: {
            id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            isVerified: Boolean(req.user.isVerified),
        },
    });
}

module.exports = {
    registerUser,
    loginUser,
    verifyOtp,
    resendOtp,
    logoutUser,
    getCurrentUser,
};