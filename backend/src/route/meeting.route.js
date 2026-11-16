const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const meetingController = require("../controller/meeting.controller");

router.post("/create", authMiddleware.requireUser, meetingController.createMeeting);
router.post("/join", authMiddleware.requireUser, meetingController.joinMeeting);
router.get(
    "/getdetailsofmeeting/:meetingId",
    authMiddleware.requireUser,
    meetingController.getMeetingDetails,
);
router.get(
    "/message/:meetingId",
    authMiddleware.requireUser,
    meetingController.getMeetingMessages,
);
router.patch("/end/:meetingId", authMiddleware.requireUser, meetingController.endMeeting);

module.exports = router;