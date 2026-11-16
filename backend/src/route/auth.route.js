const express = require("express");
const router = express.Router();
const authController = require("../controller/auth.controller");
const authMiddleware = require("../middleware/auth.middleware");

router.post("/create", authController.registerUser);
router.post("/login", authController.loginUser);
router.post("/verify-otp", authController.verifyOtp);
router.post("/resend-otp", authController.resendOtp);
router.get("/logout", authController.logoutUser);
router.get("/getme", authMiddleware.requireUser, authController.getCurrentUser);

module.exports = router