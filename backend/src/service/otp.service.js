const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const otpModel = require("../model/otp.model");
const { sendOtpEmail } = require("./email.service");

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 4;

function generateOTP() {
    return crypto.randomInt(100000, 1000000).toString();
}

async function clearExistingOtps(userId, purpose) {
    await otpModel.deleteMany({ user: userId, purpose });
}

async function sendOtpForUser(user, purpose = "login") {
    const normalizedPurpose = purpose === "registration" ? "registration" : "login";

    await clearExistingOtps(user._id, normalizedPurpose);

    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, 10);
    const now = Date.now();

    const otpRecord = await otpModel.create({
        user: user._id,
        purpose: normalizedPurpose,
        otpHash,
        expiresAt: new Date(now + OTP_TTL_MS),
        attempts: 0,
        resendAfter: new Date(now + RESEND_COOLDOWN_MS),
    });

    try {
        await sendOtpEmail(user.email, otp, normalizedPurpose, 5);
    } catch (error) {
        console.error(`OTP email failed for ${normalizedPurpose}:`, error?.message || error);
    }

    return {
        otpRecord,
        expiresAt: otpRecord.expiresAt,
        resendAfter: otpRecord.resendAfter,
    };
}

async function resendOtpForUser(user, purpose = "login") {
    const normalizedPurpose = purpose === "registration" ? "registration" : "login";
    const latestOtp = await otpModel.findOne({
        user: user._id,
        purpose: normalizedPurpose,
    }).sort({ createdAt: -1 });

    if (latestOtp && latestOtp.resendAfter && latestOtp.resendAfter > new Date()) {
        const remainingSeconds = Math.ceil((latestOtp.resendAfter.getTime() - Date.now()) / 1000);
        throw {
            status: 429,
            message: `Please wait ${remainingSeconds} seconds before requesting another OTP.`,
        };
    }

    return sendOtpForUser(user, normalizedPurpose);
}

async function verifyOtp(user, submittedOtp, purpose = "login") {
    const normalizedPurpose = purpose === "registration" ? "registration" : "login";
    const otpRecord = await otpModel.findOne({
        user: user._id,
        purpose: normalizedPurpose,
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
        return {
            valid: false,
            status: 400,
            message: "No active OTP found. Please request a new one.",
        };
    }

    if (otpRecord.expiresAt <= new Date()) {
        await otpModel.deleteOne({ _id: otpRecord._id });
        return {
            valid: false,
            status: 401,
            message: "OTP has expired. Please request a new one.",
        };
    }

    if (otpRecord.attempts >= MAX_ATTEMPTS) {
        await otpModel.deleteOne({ _id: otpRecord._id });
        return {
            valid: false,
            status: 429,
            message: "Too many failed attempts. Please request a new OTP.",
        };
    }

    const isMatch = await bcrypt.compare(String(submittedOtp || "").trim(), otpRecord.otpHash);

    if (!isMatch) {
        otpRecord.attempts += 1;
        await otpRecord.save();

        const remainingAttempts = MAX_ATTEMPTS - otpRecord.attempts;
        return {
            valid: false,
            status: 401,
            message: remainingAttempts > 0
                ? `Incorrect OTP. ${remainingAttempts} attempt(s) remaining.`
                : "Too many failed attempts. Please request a new OTP.",
        };
    }

    await otpModel.deleteOne({ _id: otpRecord._id });

    return {
        valid: true,
        message: "OTP verified successfully.",
    };
}

module.exports = {
    generateOTP,
    sendOtpForUser,
    resendOtpForUser,
    verifyOtp,
    OTP_TTL_MS,
    RESEND_COOLDOWN_MS,
    MAX_ATTEMPTS,
};
