const express = require("express");
const router = express.Router();
const authcontroller = require("../controller/auth.controller")
const authmiddleware = require("../middleware/auth.middleware")


router.post("/create",authcontroller.userregister)
router.post("/login",authcontroller.userlogin)
router.get("/logout",authcontroller.userlogout)
router.get("/getme",authmiddleware.uservalid,authcontroller.usergetme)

module.exports = router