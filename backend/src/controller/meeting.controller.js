const meetingModel = require("../model/meeting.model");
const messageModel = require("../model/message.model");
const whiteboard = require("../socket/whiteboard");
const crypto = require("crypto");

const generateMeetingCode = () => {
    return crypto.randomBytes(5).toString("hex").toUpperCase();
};

async function createMeeting(req, res) {
    try {
        let code = generateMeetingCode();
        let existingMeeting = await meetingModel.findOne({ code });
        while (existingMeeting) {
            code = generateMeetingCode();
            existingMeeting = await meetingModel.findOne({ code });
        }

        const meeting = await meetingModel.create({
            code,
            host: req.user._id,
            participants: [req.user._id],
            status: "Active",
        });
        return res.status(201).json({
            message: "MEETING CREATED SUCESSFULLY.",
            meeting: {
                _id: meeting._id,
                code: meeting.code,
                host: meeting.host,
                status: meeting.status,
                participants: meeting.participants,
            },
        });
    } catch (error) {
        return res.status(500).json({
            message: "FAILED TO CREATE MEETING,SOMETHING WENT WRONG.",
            error: error.message,
        });
    }
}

async function joinMeeting(req, res) {
    try {
        const code = String(req.body.code || "").trim().toUpperCase();
        if (!code) {
            return res.status(400).json({
                message: "MEETINGCODE IS REQUIRED.",
            });
        }
        const meeting = await meetingModel.findOne({
            code,
            status: "Active",
        });
        if (!meeting) {
            return res.status(404).json({
                message: "MEETING CODE IS NOT FOUND AND ALREADY ENDED.",
            });
        }
        const userId = req.user._id.toString();
        const alreadyJoined = meeting.participants.some(
            (participant) => participant.toString() === userId,
        );
        if (!alreadyJoined && meeting.participants.length >= 2) {
            return res.status(409).json({
                message: "MEETING IS ALREADY FULL.",
            });
        }
        if (!alreadyJoined) {
            meeting.participants.push(req.user._id);
            await meeting.save();
        }
        return res.status(200).json({
            message: "JOIN MEETING SUCESSFULLY.",
            meetingId: meeting._id,
            host: meeting.host,
            participants: meeting.participants,
        });
    } catch (error) {
        return res.status(500).json({
            message: "FAILED TO JOIN MEETING.",
            error: error.message,
        });
    }
}

async function getMeetingDetails(req, res) {
    try {
        const { meetingId } = req.params;
        if (!/^[0-9a-fA-F]{24}$/.test(meetingId)) {
            return res.status(400).json({
                message: "INVALID MEETING ID.",
            });
        }
        const meeting = await meetingModel.findById(meetingId)
            .populate("host", "name email")
            .populate("participants", "name email");

        if (!meeting) {
            return res.status(401).json({
                message: "INVALID MEETINGID, NOT FOUND",
            });
        }
        const isParticipant = meeting.participants.some(
            (participant) => participant._id.toString() === req.user._id.toString(),
        );
        if (!isParticipant) {
            return res.status(403).json({
                message: "Acess denied",
            });
        }
        return res.status(200).json({
            message: "MEETING FETCHED SUCESSFULLY.",
            meeting,
        });
    } catch (error) {
        return res.status(500).json({
            message: "FAILED TO FETCH THE MEETING.",
            error: error.message,
        });
    }
}

async function getMeetingMessages(req, res) {
    try {
        const { meetingId } = req.params;
        if (!/^[0-9a-fA-F]{24}$/.test(meetingId)) {
            return res.status(400).json({
                message: "Invalid meeting ID",
            });
        }
        const meeting = await meetingModel.findById(meetingId);
        if (!meeting) {
            return res.status(404).json({
                message: "MEETING NOT FOUND.",
            });
        }
        const isParticipant = meeting.participants.some(
            (participant) => participant.toString() === req.user._id.toString(),
        );
        if (!isParticipant) {
            return res.status(403).json({
                message: "ACCESS DENIED",
            });
        }
        const messages = await messageModel.find({
            meeting: meetingId,
        })
            .sort({ createdAt: 1 })
            .limit(200)
            .lean();

        return res.status(200).json({
            message: "MESSAGE FETCHED SUCESSFULLY.",
            count: messages.length,
            message: messages,
        });
    } catch (error) {
        return res.status(500).json({
            message: "FAILDED TO FETCH THE MESSAGE.",
            error: error.message,
        });
    }
}

async function endMeeting(req, res) {
    try {
        const { meetingId } = req.params;

        if (!/^[0-9a-fA-F]{24}$/.test(meetingId)) {
            return res.status(400).json({
                message: "Invalid meeting ID",
            });
        }
        const meeting = await meetingModel.findById(meetingId);
        if (!meeting) {
            return res.status(404).json({
                message: "MEETING NOT FOUND.",
            });
        }

        if (meeting.host.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                message: "Only host can end this MEETING.",
            });
        }
        if (meeting.status === "Ended") {
            return res.status(400).json({
                message: "MEETING IS ALREADY ENDED.",
            });
        }
        const io = req.app.get("io");
        if (!io) {
            throw new Error("Socket.IO server is not configured.");
        }
        meeting.status = "Ended";
        await meeting.save();
        whiteboard.endMeeting(io, meetingId);

        return res.status(200).json({
            message: "MEETING ENDED SUCESSFULLY.",
        });
    } catch (error) {
        return res.status(500).json({
            message: "FAILED TO END MEETING.",
        });
    }
}

module.exports = {
    createMeeting,
    joinMeeting,
    getMeetingDetails,
    getMeetingMessages,
    endMeeting,
};