const express = require("express");
const router = express.Router();
const authmiddleware = require("../middleware/auth.middleware")
const meetingcontroller = require("../controller/meeting.controller")

router.post("/create",authmiddleware.uservalid,meetingcontroller.Createmeeting)

router.post("/join",authmiddleware.uservalid,meetingcontroller.joinmeeting)

router.get("/getdetailsofmeeting/:meetingId",authmiddleware.uservalid,meetingcontroller.getdetailofmeeting)

router.get("/message/:meetingId",authmiddleware.uservalid,meetingcontroller.getmessage)

router.patch("/end/:meetingId",authmiddleware.uservalid,meetingcontroller.endmeeting)








module.exports = router;