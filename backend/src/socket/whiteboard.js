const meetingmodel = require("../model/meeting.model");

const RECONNECT_GRACE_MS = 20000;
const MAX_OPERATIONS = 2000;
const MAX_POINTS_PER_BATCH = 64;
const MAX_POINTS_PER_STROKE = 10000;
const MAX_POINTS_PER_BOARD = 100000;
const MAX_TEXT_LENGTH = 500;
const CURSOR_INTERVAL_MS = 50;
const MEETING_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
const OPERATION_ID_PATTERN = /^[\w-]{1,80}$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const boardSessions = new Map();

function createBoardState(memberIds = []) {
    return {
        memberIds: new Set(memberIds),
        operations: [],
        operationIds: new Set(),
        activeStrokes: new Map(),
        redoByUser: new Map(),
        totalPoints: 0,
        available: false,
        cleanupTimer: null,
    };
}

function isNormalizedPoint(point) {
    return point &&
        typeof point === "object" &&
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        point.x >= 0 &&
        point.x <= 1 &&
        point.y >= 0 &&
        point.y <= 1;
}

function isValidPoints(points) {
    return Array.isArray(points) &&
        points.length > 0 &&
        points.length <= MAX_POINTS_PER_BATCH &&
        points.every(isNormalizedPoint);
}

function isValidStroke(payload) {
    if (!payload || !OPERATION_ID_PATTERN.test(payload.id || "")) return false;
    if (!["start", "points", "end"].includes(payload.phase)) return false;
    if (payload.phase === "start") {
        return ["pen", "eraser"].includes(payload.tool) &&
            COLOR_PATTERN.test(payload.color || "") &&
            Number.isFinite(payload.size) &&
            payload.size >= 1 &&
            payload.size <= 64 &&
            isValidPoints(payload.points) &&
            payload.points.length === 1;
    }
    if (payload.phase === "points") return isValidPoints(payload.points);
    return true;
}

function isValidBoardObject(payload) {
    if (!payload || !OPERATION_ID_PATTERN.test(payload.id || "")) return false;
    if (!COLOR_PATTERN.test(payload.color || "")) return false;
    if (!Number.isFinite(payload.size) || payload.size < 1 || payload.size > 64) return false;
    if (payload.kind === "text") {
        return isNormalizedPoint(payload.point) &&
            typeof payload.text === "string" &&
            payload.text.trim().length > 0 &&
            payload.text.length <= MAX_TEXT_LENGTH;
    }
    return ["rectangle", "circle", "line", "arrow"].includes(payload.kind) &&
        isNormalizedPoint(payload.start) &&
        isNormalizedPoint(payload.end);
}

function applyHistory(session, userId, action) {
    if (action === "undo") {
        const operation = [...session.operations].reverse().find(
            (item) => item.ownerId === userId &&
                !item.undone &&
                !session.activeStrokes.has(item.id),
        );
        if (!operation) return null;
        operation.undone = true;
        const redoStack = session.redoByUser.get(userId) || [];
        redoStack.push(operation.id);
        session.redoByUser.set(userId, redoStack);
        return operation.id;
    }

    if (action === "redo") {
        const redoStack = session.redoByUser.get(userId) || [];
        while (redoStack.length) {
            const operationId = redoStack.pop();
            const operation = session.operations.find((item) => item.id === operationId);
            if (!operation || !operation.undone) continue;
            operation.undone = false;
            session.redoByUser.set(userId, redoStack);
            return operation.id;
        }
        session.redoByUser.set(userId, redoStack);
    }
    return null;
}

function memberIdOf(value) {
    return String(value?._id || value?.id || value || "");
}

function connectedMemberIds(sockets, memberIds, excludedSocketId = "") {
    return new Set(
        sockets
            .filter((participantSocket) =>
                participantSocket.id !== excludedSocketId &&
                memberIds.has(String(participantSocket.data?.userId || "")),
            )
            .map((participantSocket) => String(participantSocket.data.userId)),
    );
}

function emitAvailability(io, meetingId, available, reason) {
    io.to(meetingId).emit("connecto:availability", {
        meetingId,
        available,
        reason,
    });
}

function clearTimer(session) {
    if (!session.cleanupTimer) return;
    clearTimeout(session.cleanupTimer);
    session.cleanupTimer = null;
}

function clearBoardSession(meetingId) {
    const session = boardSessions.get(meetingId);
    if (session) clearTimer(session);
    boardSessions.delete(meetingId);
}

function emitBoardError(socket, meetingId, message) {
    socket.emit("connecto:error", { meetingId, message });
}

async function loadAuthorizedMeeting(io, socket, meetingId) {
    if (!MEETING_ID_PATTERN.test(meetingId || "")) {
        emitBoardError(socket, meetingId, "Invalid meeting.");
        return null;
    }
    if (!socket.rooms.has(meetingId)) {
        emitBoardError(socket, meetingId, "Join the meeting before opening CONNECTO.");
        return null;
    }

    const meeting = await meetingmodel.findById(meetingId);
    if (!meeting || meeting.status !== "Active") {
        emitAvailability(io, meetingId, false, "meeting-ended");
        emitBoardError(socket, meetingId, "CONNECTO is unavailable because this meeting has ended.");
        return null;
    }

    const memberIds = new Set(meeting.participants.map(memberIdOf));
    const userId = String(socket.data?.userId || socket.user?._id || "");
    if (!memberIds.has(userId)) {
        emitBoardError(socket, meetingId, "You are not a participant in this meeting.");
        return null;
    }

    const sockets = await io.in(meetingId).fetchSockets();
    const liveUserIds = connectedMemberIds(sockets, memberIds);
    if (liveUserIds.size < 2) {
        emitAvailability(io, meetingId, false, "waiting-for-participant");
        return null;
    }

    return { meeting, memberIds, userId, liveUserIds };
}

function activeSessionFor(socket, meetingId) {
    const session = boardSessions.get(meetingId);
    const userId = String(socket.data?.userId || socket.user?._id || "");
    if (!MEETING_ID_PATTERN.test(meetingId || "") ||
        !socket.rooms.has(meetingId) ||
        !session ||
        !session.available ||
        !session.memberIds.has(userId)) {
        return null;
    }
    return { session, userId };
}

function emitOperation(io, meetingId, action, payload, senderId) {
    io.to(meetingId).emit("connecto:operation", {
        meetingId,
        action,
        ...payload,
        senderId,
    });
}

function attachWhiteboardEvents(io, socket) {
    socket.on("connecto:join", async ({ meetingId } = {}) => {
        try {
            const access = await loadAuthorizedMeeting(io, socket, meetingId);
            if (!access) return;

            const currentMeeting = await meetingmodel.findById(meetingId);
            if (!currentMeeting || currentMeeting.status !== "Active") {
                emitAvailability(io, meetingId, false, "meeting-ended");
                return;
            }

            let session = boardSessions.get(meetingId);
            if (!session) {
                session = createBoardState(access.memberIds);
                boardSessions.set(meetingId, session);
            } else {
                session.memberIds = access.memberIds;
            }
            clearTimer(session);
            session.available = access.liveUserIds.size >= 2;
            if (!session.available) {
                emitAvailability(io, meetingId, false, "waiting-for-participant");
                return;
            }

            socket.emit("connecto:state", {
                meetingId,
                operations: session.operations,
                redoAvailable: (session.redoByUser.get(access.userId) || []).length > 0,
            });
            emitAvailability(io, meetingId, true);
        } catch (error) {
            console.error("CONNECTO join failed:", error.message);
            emitBoardError(socket, meetingId, "Could not open CONNECTO.");
        }
    });

    socket.on("connecto:stroke", (payload = {}) => {
        const meetingId = payload.meetingId;
        const active = activeSessionFor(socket, meetingId);
        if (!active) {
            emitBoardError(socket, meetingId, "CONNECTO is not active for this meeting.");
            return;
        }
        if (!isValidStroke(payload)) {
            emitBoardError(socket, meetingId, "Invalid drawing data.");
            return;
        }

        const { session, userId } = active;
        if (payload.phase === "start") {
            if (session.operationIds.has(payload.id)) return;
            if (session.operations.length >= MAX_OPERATIONS ||
                session.totalPoints + 1 > MAX_POINTS_PER_BOARD) {
                emitBoardError(socket, meetingId, "The board is full. Clear it to continue drawing.");
                return;
            }
            const operation = {
                id: payload.id,
                ownerId: userId,
                kind: "stroke",
                tool: payload.tool,
                color: payload.color,
                size: payload.size,
                points: payload.points,
                undone: false,
            };
            session.operations.push(operation);
            session.operationIds.add(operation.id);
            session.activeStrokes.set(operation.id, operation);
            session.totalPoints += operation.points.length;
            session.redoByUser.delete(userId);
            emitOperation(io, meetingId, "stroke-start", { operation }, userId);
            return;
        }

        const operation = session.activeStrokes.get(payload.id);
        if (!operation || operation.ownerId !== userId) return;
        if (payload.phase === "points") {
            if (operation.points.length + payload.points.length > MAX_POINTS_PER_STROKE ||
                session.totalPoints + payload.points.length > MAX_POINTS_PER_BOARD) {
                session.activeStrokes.delete(operation.id);
                emitBoardError(socket, meetingId, "This stroke reached its size limit.");
                emitOperation(io, meetingId, "stroke-end", { operationId: operation.id }, userId);
                return;
            }
            operation.points.push(...payload.points);
            session.totalPoints += payload.points.length;
            emitOperation(io, meetingId, "stroke-points", {
                operationId: operation.id,
                points: payload.points,
            }, userId);
            return;
        }

        session.activeStrokes.delete(operation.id);
        emitOperation(io, meetingId, "stroke-end", { operationId: operation.id }, userId);
    });

    socket.on("connecto:object", (payload = {}) => {
        const meetingId = payload.meetingId;
        const active = activeSessionFor(socket, meetingId);
        if (!active) {
            emitBoardError(socket, meetingId, "CONNECTO is not active for this meeting.");
            return;
        }
        if (!isValidBoardObject(payload)) {
            emitBoardError(socket, meetingId, "Invalid whiteboard object.");
            return;
        }

        const { session, userId } = active;
        if (session.operationIds.has(payload.id)) return;
        if (session.operations.length >= MAX_OPERATIONS ||
            session.totalPoints + 2 > MAX_POINTS_PER_BOARD) {
            emitBoardError(socket, meetingId, "The board is full. Clear it to continue.");
            return;
        }
        const operation = {
            ...payload,
            ownerId: userId,
            undone: false,
        };
        delete operation.meetingId;
        session.operations.push(operation);
        session.operationIds.add(operation.id);
        session.totalPoints += operation.kind === "text" ? 1 : 2;
        session.redoByUser.delete(userId);
        emitOperation(io, meetingId, "object-add", { operation }, userId);
    });

    socket.on("connecto:history", ({ meetingId, action } = {}) => {
        const active = activeSessionFor(socket, meetingId);
        if (!active) {
            emitBoardError(socket, meetingId, "CONNECTO is not active for this meeting.");
            return;
        }
        if (!["undo", "redo"].includes(action)) {
            emitBoardError(socket, meetingId, "Invalid undo/redo action.");
            return;
        }
        const operationId = applyHistory(active.session, active.userId, action);
        if (!operationId) return;
        io.to(meetingId).emit("connecto:history", {
            meetingId,
            action,
            operationId,
            senderId: active.userId,
            redoAvailable: (active.session.redoByUser.get(active.userId) || []).length > 0,
        });
    });

    socket.on("connecto:clear", ({ meetingId } = {}) => {
        const active = activeSessionFor(socket, meetingId);
        if (!active) {
            emitBoardError(socket, meetingId, "CONNECTO is not active for this meeting.");
            return;
        }
        const { session, userId } = active;
        session.operations = [];
        session.operationIds.clear();
        session.activeStrokes.clear();
        session.redoByUser.clear();
        session.totalPoints = 0;
        io.to(meetingId).emit("connecto:cleared", {
            meetingId,
            senderId: userId,
        });
    });

    socket.on("connecto:cursor", ({ meetingId, point } = {}) => {
        const active = activeSessionFor(socket, meetingId);
        if (!active || !isNormalizedPoint(point)) return;
        const now = Date.now();
        if (now - (socket.data.connectoLastCursorAt || 0) < CURSOR_INTERVAL_MS) return;
        socket.data.connectoLastCursorAt = now;
        socket.to(meetingId).emit("connecto:cursor", {
            meetingId,
            userId: active.userId,
            name: socket.user.name,
            point,
        });
    });
}

async function participantJoined(io, meetingId) {
    const session = boardSessions.get(meetingId);
    if (!session) return;
    try {
        const sockets = await io.in(meetingId).fetchSockets();
        if (boardSessions.get(meetingId) !== session) return;
        const liveUsers = connectedMemberIds(sockets, session.memberIds);
        clearTimer(session);
        session.available = liveUsers.size >= 2;
        emitAvailability(io, meetingId, session.available, session.available ? undefined : "waiting-for-participant");
    } catch (error) {
        console.error("CONNECTO participant join update failed:", error.message);
        session.available = false;
        emitAvailability(io, meetingId, false, "presence-unavailable");
    }
}

async function participantLeaving(io, meetingId, socketId, explicitLeave = false) {
    const session = boardSessions.get(meetingId);
    if (!session) return;
    session.available = false;
    clearTimer(session);
    emitAvailability(io, meetingId, false, "participant-left");
    for (const [operationId] of session.activeStrokes) {
        session.activeStrokes.delete(operationId);
        emitOperation(io, meetingId, "stroke-end", { operationId }, "");
    }

    try {
        const sockets = await io.in(meetingId).fetchSockets();
        if (boardSessions.get(meetingId) !== session) return;
        const remainingUsers = connectedMemberIds(sockets, session.memberIds, socketId);
        if (remainingUsers.size === 0) {
            if (explicitLeave) {
                clearBoardSession(meetingId);
                return;
            }
            session.cleanupTimer = setTimeout(async () => {
                if (boardSessions.get(meetingId) !== session) return;
                try {
                    const reconnected = await io.in(meetingId).fetchSockets();
                    if (connectedMemberIds(reconnected, session.memberIds).size === 0) {
                        clearBoardSession(meetingId);
                    }
                } catch (error) {
                    console.error("CONNECTO reconnect check failed:", error.message);
                    clearBoardSession(meetingId);
                }
            }, RECONNECT_GRACE_MS);
            session.cleanupTimer.unref?.();
            return;
        }
        session.available = remainingUsers.size >= 2;
        emitAvailability(io, meetingId, session.available, session.available ? undefined : "participant-left");
    } catch (error) {
        console.error("CONNECTO participant leave update failed:", error.message);
        clearBoardSession(meetingId);
    }
}

function endMeeting(io, meetingId) {
    clearBoardSession(meetingId);
    emitAvailability(io, meetingId, false, "meeting-ended");
    io.to(meetingId).emit("connecto:cleared", {
        meetingId,
        reason: "meeting-ended",
    });
}

module.exports = {
    attachWhiteboardEvents,
    participantJoined,
    participantLeaving,
    endMeeting,
    createBoardState,
    applyHistory,
    isNormalizedPoint,
    isValidStroke,
    isValidBoardObject,
};
