const meetingmodel = require("../model/meeting.model")
const messagemodel = require("../model/message.model")
const whiteboard = require("./whiteboard")

function isDescription(value, type) {
    return value &&
        typeof value === "object" &&
        value.type === type &&
        typeof value.sdp === "string" &&
        value.sdp.length > 0 &&
        value.sdp.length <= 64000
}

function isIceCandidate(value) {
    return value &&
        typeof value === "object" &&
        typeof value.candidate === "string" &&
        value.candidate.length <= 4096 &&
        (value.sdpMid == null || typeof value.sdpMid === "string") &&
        (value.sdpMLineIndex == null ||
            (Number.isInteger(value.sdpMLineIndex) && value.sdpMLineIndex >= 0)) &&
        (value.usernameFragment == null || typeof value.usernameFragment === "string")
}

function meetingsocket(io, socket) {
    whiteboard.attachWhiteboardEvents(io, socket);

    socket.on("join-meeting", async ({ meetingId } = {}) => {
        try {
            if (!meetingId || !/^[0-9a-fA-F]{24}$/.test(meetingId)) {
                return socket.emit("error-message", {
                    message: "INVALID MEETING ID"
                });
            }

            const meeting = await meetingmodel.findById(meetingId);
            if (!meeting) {
                return socket.emit("error-message", {
                    message: "MEETING IS NOT FOUND."
                })
            }

            if (meeting.status !== "Active") {
                return socket.emit("error-message", {
                    message: "MEETING IS ALREADY ENDED."
                })
            }

            const isparticipate = meeting.participants.some(
                participant => participant.toString() === socket.user._id.toString()
            )
            if (!isparticipate) {
                return socket.emit("error-message", {
                    message: "ACCESS DENIED"
                })
            }
            const connectedSockets = await io.in(meetingId).fetchSockets();
            const peerConnected = connectedSockets.some(
                participantSocket => participantSocket.data.userId !== socket.user._id.toString()
            );
            socket.join(meetingId);
            socket.to(meetingId).emit("participant-presence", { connected: true });
            await whiteboard.participantJoined(io, meetingId);
            return socket.emit("joined-meeting", {
                message: "JOINED MEETING SUCESSFULLY.",
                peerConnected,
            })

        } catch (error) {
            return socket.emit("error-message", {
                message: "FAILED TO JOIN MEETING."
            })

        }



    })




 socket.on("send-message", async ({ meetingId, text } = {}) => {
    try {

        if (!meetingId || !/^[0-9a-fA-F]{24}$/.test(meetingId)) {
            return socket.emit("error-message", {
                message: "INVALID MEETING ID"
            });
        }
        if(typeof text !== "string" || !text.trim()){
            return socket.emit("error-message",{
                 message: "MESSAGE CANNOT BE EMPTY"
            })
        }
        if(text.trim().length > 2000){
            return socket.emit("error-message",{
                message:"MESSAGE IS TOO LONG"
            })
        }
        if(!socket.rooms.has(meetingId)){
            return socket.emit("error-message",{
                message :"PLEASE JOIN MEETING FIRST"
            })
        }
        const meeting = await meetingmodel.findById(meetingId);

        if(!meeting || meeting.status !== "Active"){
            return socket.emit("error-message",{
                message:"MEETING NOT FOUND OR ENDED"
            })
        }

        const isparticipate = meeting.participants.some(
            participant => participant.toString() === socket.user._id.toString()
        )

        if(!isparticipate){
            return socket.emit("error-message",{
                message:"ACCESS DENIED"

            })
        }

        const receiver = meeting.participants.find(
            participant => participant.toString() !== socket.user._id.toString() 
        )

        if(!receiver){
            return socket.emit("error-message",{
                message:"RECEIVER NOT FOUND."
            })
        }

        const message = await messagemodel.create({
            meeting:meetingId,
            sender:socket.user._id,
            receiver:receiver,
            sendername:socket.user.name,
            receivername:"Meeting participant",
            text :text.trim(),
        })

        io.to(meetingId).emit("receive-message",{
            _id:message._id,
            meetingId:message.meeting,
            sender:message.sender,
            receiver:message.receiver,
            sendername:message.sendername,
            receivername:message.receivername,
            text:message.text,
            createdAt:message.createdAt,
        })


    }catch(error){
        console.error("send message Error",error.message);
        socket.emit("error-message",{
            message:"FAILED TO SEND MESSAGE."
        })

    }

 })    

 const relaySignal = async (event, field, meetingId, signal, isValid) => {
    if (!meetingId || !/^[0-9a-fA-F]{24}$/.test(meetingId)) {
        return socket.emit("error-message", { message: "INVALID MEETING ID" });
    }
    if (!socket.rooms.has(meetingId)) {
        return socket.emit("error-message", { message: "PLEASE JOIN MEETING FIRST" });
    }
    if (!isValid(signal)) {
        return socket.emit("error-message", { message: "INVALID VIDEO CALL SIGNAL" });
    }

    try {
        const meeting = await meetingmodel.findById(meetingId);
        const isparticipant = meeting && meeting.participants.some(
            participant => participant.toString() === socket.user._id.toString()
        );
        if (!meeting || meeting.status !== "Active" || !isparticipant) {
            return socket.emit("error-message", { message: "MEETING NOT FOUND OR ENDED" });
        }

        if (event === "webrtc-offer") {
            const connectedSockets = await io.in(meetingId).fetchSockets();
            const peerConnected = connectedSockets.some(
                participantSocket => participantSocket.data.userId !== socket.user._id.toString()
            );
            if (!peerConnected) {
                return socket.emit("webrtc-error", {
                    message: "The other participant disconnected. Wait for them to reconnect before calling.",
                });
            }
        }

        socket.to(meetingId).emit(event, {
            meetingId,
            senderId: socket.user._id.toString(),
            [field]: signal,
        });
    } catch (error) {
        console.error(`${event} error`, error.message);
        socket.emit("error-message", { message: "FAILED TO RELAY VIDEO CALL SIGNAL." });
    }
 };

 socket.on("webrtc-offer", ({ meetingId, offer } = {}) => {
    relaySignal("webrtc-offer", "offer", meetingId, offer, value => isDescription(value, "offer"));
 });
 socket.on("webrtc-answer", ({ meetingId, answer } = {}) => {
    relaySignal("webrtc-answer", "answer", meetingId, answer, value => isDescription(value, "answer"));
 });
 socket.on("webrtc-ice-candidate", ({ meetingId, candidate } = {}) => {
    relaySignal("webrtc-ice-candidate", "candidate", meetingId, candidate, isIceCandidate);
 });
 socket.on("webrtc-hangup", ({ meetingId } = {}) => {
    if (!meetingId || !socket.rooms.has(meetingId)) return;
    socket.to(meetingId).emit("webrtc-hangup", {
        meetingId,
        senderId: socket.user._id.toString(),
    });
 });

 socket.on("leave-meeting",({meetingId}={})=>{
    if(!meetingId) return;
    socket.to(meetingId).emit("webrtc-hangup", {
        meetingId,
        senderId: socket.user._id.toString(),
    });
    socket.to(meetingId).emit("participant-presence", { connected: false });
    socket.leave(meetingId);
    void whiteboard.participantLeaving(io, meetingId, socket.id, true);
    socket.emit("left-meeting",{
        message:"LEFT MEETING SUCESSFULLY."
    })
 })

   socket.on("disconnecting", () => {
        for (const room of socket.rooms) {
            if (room === socket.id) continue;
            socket.to(room).emit("webrtc-hangup", {
                meetingId: room,
                senderId: socket.user._id.toString(),
            });
            socket.to(room).emit("participant-presence", { connected: false });
            void whiteboard.participantLeaving(io, room, socket.id, false);
        }
    });

  

}
module.exports = meetingsocket