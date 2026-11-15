const test = require("node:test");
const assert = require("node:assert/strict");
const meetingmodel = require("../src/model/meeting.model");
const {
    applyHistory,
    attachWhiteboardEvents,
    createBoardState,
    endMeeting,
    isNormalizedPoint,
    isValidBoardObject,
    isValidStroke,
} = require("../src/socket/whiteboard");

test("board coordinates stay normalized and strokes are bounded", () => {
    assert.equal(isNormalizedPoint({ x: 0, y: 1 }), true);
    assert.equal(isNormalizedPoint({ x: -0.01, y: 0.5 }), false);
    assert.equal(isValidStroke({
        id: "stroke-1",
        phase: "start",
        tool: "pen",
        color: "#2f81ef",
        size: 4,
        points: [{ x: 0.2, y: 0.3 }],
    }), true);
    assert.equal(isValidStroke({
        id: "stroke-2",
        phase: "start",
        tool: "pen",
        color: "red",
        size: 4,
        points: [{ x: 0.2, y: 0.3 }],
    }), false);
});

test("whiteboard objects validate shape and text payloads", () => {
    assert.equal(isValidBoardObject({
        id: "shape-1",
        kind: "rectangle",
        color: "#202a26",
        size: 3,
        start: { x: 0.1, y: 0.2 },
        end: { x: 0.8, y: 0.9 },
    }), true);
    assert.equal(isValidBoardObject({
        id: "text-1",
        kind: "text",
        color: "#202a26",
        size: 16,
        point: { x: 0.5, y: 0.5 },
        text: "Planning",
    }), true);
    assert.equal(isValidBoardObject({
        id: "text-2",
        kind: "text",
        color: "#202a26",
        size: 16,
        point: { x: 1.1, y: 0.5 },
        text: "Out of bounds",
    }), false);
});

test("undo and redo affect only the requesting author's operations", () => {
    const board = createBoardState();
    board.operations.push(
        { id: "alice-1", ownerId: "alice", undone: false },
        { id: "bob-1", ownerId: "bob", undone: false },
        { id: "alice-2", ownerId: "alice", undone: false },
    );

    assert.equal(applyHistory(board, "alice", "undo"), "alice-2");
    assert.equal(board.operations[1].undone, false);
    assert.equal(applyHistory(board, "alice", "undo"), "alice-1");
    assert.equal(applyHistory(board, "alice", "redo"), "alice-1");
    assert.equal(board.operations[1].undone, false);
    assert.equal(applyHistory(board, "alice", "redo"), "alice-2");
    assert.equal(applyHistory(board, "bob", "undo"), "bob-1");
});

test("active strokes cannot be undone before completion", () => {
    const board = createBoardState();
    board.operations.push({ id: "active-1", ownerId: "alice", undone: false });
    board.activeStrokes.set("active-1", board.operations[0]);

    assert.equal(applyHistory(board, "alice", "undo"), null);
});

test("different meeting board states are independent", () => {
    const firstMeeting = createBoardState(["alice", "bob"]);
    const secondMeeting = createBoardState(["carol", "dave"]);
    firstMeeting.operations.push({ id: "first-op", ownerId: "alice", undone: false });

    assert.equal(firstMeeting.operations.length, 1);
    assert.equal(secondMeeting.operations.length, 0);
    assert.equal(secondMeeting.memberIds.has("alice"), false);
});

test("CONNECTO join requires two distinct connected meeting members", async (t) => {
      const meetingId = "aaaaaaaaaaaaaaaaaaaaaaaa";
      const hostId = "111111111111111111111111";
      const guestId = "222222222222222222222222";
      const outsiderId = "333333333333333333333333";
      const originalFindById = meetingmodel.findById;
      t.after(() => {
          meetingmodel.findById = originalFindById;
          endMeeting(io, meetingId);
      });
      meetingmodel.findById = async () => ({
          status: "Active",
          participants: [hostId, guestId],
      });

      const broadcasts = [];
      const liveSockets = [];
      const io = {
          in: () => ({ fetchSockets: async () => liveSockets }),
          to: (room) => ({
              emit: (event, payload) => broadcasts.push({ room, event, payload }),
          }),
      };
      const makeSocket = (id, userId) => {
          const handlers = new Map();
          const emitted = [];
          return {
              id,
              data: { userId },
              user: { name: userId },
              rooms: new Set([meetingId]),
              emitted,
              on: (event, handler) => handlers.set(event, handler),
              emit: (event, payload) => emitted.push({ event, payload }),
              trigger: (event, payload) => handlers.get(event)(payload),
          };
      };

      const host = makeSocket("host-socket", hostId);
      const duplicateHost = makeSocket("host-tab", hostId);
      const guest = makeSocket("guest-socket", guestId);
      const outsider = makeSocket("outsider-socket", outsiderId);
      liveSockets.push(host, duplicateHost);
      attachWhiteboardEvents(io, host);
      await host.trigger("connecto:join", { meetingId });
      assert.equal(host.emitted.some(({ event }) => event === "connecto:state"), false);

      liveSockets.push(guest);
      await host.trigger("connecto:join", { meetingId });
      assert.equal(host.emitted.some(({ event }) => event === "connecto:state"), true);

      attachWhiteboardEvents(io, outsider);
      await outsider.trigger("connecto:join", { meetingId });
      assert.equal(outsider.emitted.some(({ event }) => event === "connecto:state"), false);
      assert.equal(outsider.emitted.some(({ event }) => event === "connecto:error"), true);
});
