const mongoose = require("mongoose");
const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "name is required for create a account"],
        trim: true,
    },
    email: {
        type: String,
        required: [true, "email is required for create a new account"],
        unique: true,
        lowercase: true,
        match: [
            /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
            "Please provide a valid email address.",
        ],
        trim: true,
    },
    password: {
        type: String,
        required: [true, "password is required"],
        unique: true,
        trim: true,
    },
    isVerified: {
        type: Boolean,
        default: false,
    },
}, {
    timestamps: true,
});

const userModel = mongoose.model("user", userSchema);
module.exports = userModel;