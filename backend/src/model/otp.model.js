const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true,
        index: true,
    },
    purpose: {
        type: String,
        enum: ["registration", "login"],
        required: true,
    },
    otpHash: {
        type: String,
        required: true,
    },
    expiresAt: {
        type: Date,
        required: true,
    },
    attempts: {
        type: Number,
        default: 0,
    },
    resendAfter: {
        type: Date,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
}, {
    timestamps: true,
});

otpSchema.index({ user: 1, purpose: 1, createdAt: -1 });

const OtpModel = mongoose.model("otp", otpSchema);
module.exports = OtpModel;
