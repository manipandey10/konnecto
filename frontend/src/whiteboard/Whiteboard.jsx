import { useEffect, useRef, useState } from "react";
import {
  applyHistoryEvent,
  applyOperationEvent,
  normalizedPoint,
} from "./boardModel.js";
import "./whiteboard.css";

const tools = [
  ["pen", "Pen"],
  ["eraser", "Eraser"],
  ["text", "Text"],
  ["rectangle", "Rectangle"],
  ["circle", "Circle"],
  ["line", "Line"],
  ["arrow", "Arrow"],
];

const cursorPalette = ["#2577d4", "#bf5a45", "#4d8c62", "#8859bd"];

function userIdOf(value) {
  return String(value?._id || value?.id || value || "");
}

function cursorColor(userId, participants = [], localUserId = "") {
  const participantIds = [...new Set([
    ...participants.map(userIdOf),
    localUserId,
  ].filter(Boolean))].sort();
  const participantIndex = participantIds.indexOf(userId);
  if (participantIds.length > 1 && participantIndex !== -1) {
    return cursorPalette[participantIndex % cursorPalette.length];
  }
  const hash = [...userId].reduce((value, character) => value + character.charCodeAt(0), 0);
  return cursorPalette[hash % cursorPalette.length];
}

function makeId(userId) {
  const randomPart = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${userId}-${Date.now()}-${randomPart}`;
}

function drawStrokeSegment(canvas, operation, from, to) {
  const context = canvas?.getContext("2d");
  if (!context) return;
  const { width, height } = canvas.getBoundingClientRect();
  context.save();
  context.globalCompositeOperation = operation.tool === "eraser" ? "destination-out" : "source-over";
  context.strokeStyle = operation.color;
  context.fillStyle = operation.color;
  context.lineWidth = operation.size;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  if (from.x === to.x && from.y === to.y) {
    context.arc(to.x * width, to.y * height, Math.max(operation.size / 2, 1), 0, Math.PI * 2);
    context.fill();
  } else {
    context.moveTo(from.x * width, from.y * height);
    context.lineTo(to.x * width, to.y * height);
    context.stroke();
  }
  context.restore();
}

function drawOperation(context, operation, width, height) {
  if (operation.undone) return;
  context.save();
  context.globalCompositeOperation = operation.tool === "eraser" ? "destination-out" : "source-over";
  context.strokeStyle = operation.color;
  context.fillStyle = operation.color;
  context.lineWidth = operation.size;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (operation.kind === "stroke") {
    const points = operation.points || [];
    if (points.length === 1) {
      context.beginPath();
      context.arc(points[0].x * width, points[0].y * height, Math.max(operation.size / 2, 1), 0, Math.PI * 2);
      context.fill();
    } else if (points.length > 1) {
      context.beginPath();
      context.moveTo(points[0].x * width, points[0].y * height);
      points.slice(1).forEach((point) => context.lineTo(point.x * width, point.y * height));
      context.stroke();
    }
  } else if (operation.kind === "text") {
    context.font = `${Math.max(14, operation.size * 3)}px "Segoe UI", sans-serif`;
    context.fillText(operation.text, operation.point.x * width, operation.point.y * height);
  } else {
    const startX = operation.start.x * width;
    const startY = operation.start.y * height;
    const endX = operation.end.x * width;
    const endY = operation.end.y * height;
    context.beginPath();
    if (operation.kind === "rectangle") {
      context.rect(startX, startY, endX - startX, endY - startY);
      context.stroke();
    } else if (operation.kind === "circle") {
      context.ellipse(
        (startX + endX) / 2,
        (startY + endY) / 2,
        Math.abs(endX - startX) / 2,
        Math.abs(endY - startY) / 2,
        0,
        0,
        Math.PI * 2,
      );
      context.stroke();
    } else {
      context.moveTo(startX, startY);
      context.lineTo(endX, endY);
      context.stroke();
      if (operation.kind === "arrow") {
        const angle = Math.atan2(endY - startY, endX - startX);
        const head = Math.max(10, operation.size * 3);
        context.beginPath();
        context.moveTo(endX, endY);
        context.lineTo(endX - head * Math.cos(angle - Math.PI / 6), endY - head * Math.sin(angle - Math.PI / 6));
        context.moveTo(endX, endY);
        context.lineTo(endX - head * Math.cos(angle + Math.PI / 6), endY - head * Math.sin(angle + Math.PI / 6));
        context.stroke();
      }
    }
  }
  context.restore();
}

function drawBoard(canvas, operations) {
  const context = canvas?.getContext("2d");
  if (!context) return;
  const rect = canvas.getBoundingClientRect();
  context.clearRect(0, 0, rect.width, rect.height);
  operations.forEach((operation) => drawOperation(context, operation, rect.width, rect.height));
}

function ToolIcon({ name }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  const paths = {
    pen: <><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" /><path d="m14 7 3 3" /></>,
    eraser: <><path d="m7 16 7-10a2 2 0 0 1 3-.3l2 1.5a2 2 0 0 1 .4 2.8L12 20H7l-4-3 4-5" /><path d="m9 20 5-7" /></>,
    text: <><path d="M4 6V4h16v2M12 4v16m-4 0h8" /></>,
    rectangle: <rect x="4" y="5" width="16" height="14" rx="1" />,
    circle: <circle cx="12" cy="12" r="7" />,
    line: <path d="M5 19 19 5" />,
    arrow: <><path d="M5 19 19 5" /><path d="M9 5h10v10" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function HistoryIcon({ redo = false }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  return redo ? (
    <svg {...common}><path d="m15 4 5 5-5 5" /><path d="M20 9h-8a7 7 0 1 0 6.2 3.8" /></svg>
  ) : (
    <svg {...common}><path d="m9 4-5 5 5 5" /><path d="M4 9h8a7 7 0 1 1-6.2 3.8" /></svg>
  );
}

export default function Whiteboard({ meetingId, socket, user, participants }) {
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#236ed0");
  const [size, setSize] = useState(4);
  const [operations, setOperations] = useState([]);
  const [canRedo, setCanRedo] = useState(false);
  const [syncStatus, setSyncStatus] = useState("syncing");
  const [error, setError] = useState("");
  const [textDraft, setTextDraft] = useState(null);
  const [cursors, setCursors] = useState([]);
  const canvasRef = useRef(null);
  const previewRef = useRef(null);
  const textInputRef = useRef(null);
  const operationsRef = useRef([]);
  const draftRef = useRef(null);
  const pendingPointsRef = useRef([]);
  const frameRef = useRef(0);
  const lastCursorSentRef = useRef(0);
  const cursorTimersRef = useRef(new Map());
  const stateRefreshRequestedRef = useRef(false);
  const userId = userIdOf(user);
  const participantKey = participants.map(userIdOf).join(":");

  function updateOperations(next) {
    operationsRef.current = next;
    setOperations(next);
  }

  function redrawPreview(draft) {
    const canvas = previewRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    context.clearRect(0, 0, rect.width, rect.height);
    if (draft?.operation) drawOperation(context, draft.operation, rect.width, rect.height);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      const context = canvas.getContext("2d");
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const preview = previewRef.current;
      if (preview) {
        preview.width = Math.round(rect.width * ratio);
        preview.height = Math.round(rect.height * ratio);
        preview.getContext("2d").setTransform(ratio, 0, 0, ratio, 0, 0);
      }
      drawBoard(canvas, operationsRef.current);
      redrawPreview(draftRef.current);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    drawBoard(canvasRef.current, operations);
  }, [operations]);

  useEffect(() => {
    if (!textDraft) return;
    textInputRef.current?.focus();
  }, [textDraft]);

  useEffect(() => {
    if (!socket) {
      setSyncStatus("offline");
      return undefined;
    }

    const onState = ({ meetingId: stateMeetingId, operations: next = [], redoAvailable = false } = {}) => {
      if (stateMeetingId !== meetingId) return;
      updateOperations(next);
      setCanRedo(redoAvailable);
      setSyncStatus("live");
      stateRefreshRequestedRef.current = false;
      setError("");
    };
    const onOperation = (event = {}) => {
      if (event.meetingId !== meetingId || event.senderId === userId) return;
      if (event.action === "stroke-points") {
        const current = operationsRef.current.find((operation) => operation.id === event.operationId);
        if (!current) return;
        const previous = current.points[current.points.length - 1];
        const next = applyOperationEvent(operationsRef.current, event);
        operationsRef.current = next;
        const updated = next.find((operation) => operation.id === event.operationId);
        let last = previous;
        event.points.forEach((point) => {
          drawStrokeSegment(canvasRef.current, updated, last, point);
          last = point;
        });
        return;
      }
      const next = applyOperationEvent(operationsRef.current, event);
      if (next !== operationsRef.current) updateOperations(next);
    };
    const onHistory = (event = {}) => {
      if (event.meetingId !== meetingId) return;
      updateOperations(applyHistoryEvent(operationsRef.current, event));
      if (event.senderId === userId) {
        setCanRedo(Boolean(event.redoAvailable));
      }
    };
    const onCleared = ({ meetingId: clearedMeetingId } = {}) => {
      if (clearedMeetingId !== meetingId) return;
      updateOperations([]);
      setCanRedo(false);
    };
    const onAvailability = ({ meetingId: availableMeetingId, available } = {}) => {
      if (availableMeetingId === meetingId) setSyncStatus(available ? "live" : "paused");
    };
    const onError = ({ meetingId: errorMeetingId, message } = {}) => {
      if (errorMeetingId !== meetingId) return;
      setError(message || "CONNECTO could not sync.");
      if (!stateRefreshRequestedRef.current) {
        stateRefreshRequestedRef.current = true;
        socket.emit("connecto:join", { meetingId });
      }
    };
    const onCursor = ({ meetingId: cursorMeetingId, userId: remoteId, name, point } = {}) => {
      if (cursorMeetingId !== meetingId || !point || remoteId === userId) return;
      const cursor = {
        userId: remoteId,
        name,
        point,
        color: cursorColor(remoteId, participantKey.split(":").filter(Boolean), userId),
      };
      setCursors((current) => [...current.filter((item) => item.userId !== remoteId), cursor]);
      clearTimeout(cursorTimersRef.current.get(remoteId));
      cursorTimersRef.current.set(remoteId, setTimeout(() => {
        setCursors((current) => current.filter((item) => item.userId !== remoteId));
        cursorTimersRef.current.delete(remoteId);
      }, 2500));
    };

    socket.on("connecto:state", onState);
    socket.on("connecto:operation", onOperation);
    socket.on("connecto:history", onHistory);
    socket.on("connecto:cleared", onCleared);
    socket.on("connecto:availability", onAvailability);
    socket.on("connecto:error", onError);
    socket.on("connecto:cursor", onCursor);
    socket.emit("connecto:join", { meetingId });

    return () => {
      socket.off("connecto:state", onState);
      socket.off("connecto:operation", onOperation);
      socket.off("connecto:history", onHistory);
      socket.off("connecto:cleared", onCleared);
      socket.off("connecto:availability", onAvailability);
      socket.off("connecto:error", onError);
      socket.off("connecto:cursor", onCursor);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      cursorTimersRef.current.forEach(clearTimeout);
      cursorTimersRef.current.clear();
    };
  }, [meetingId, socket, userId, participantKey]);

  const canUndo = operations.some((operation) =>
    operation.ownerId === userId &&
    !operation.undone &&
    draftRef.current?.operation?.id !== operation.id,
  );

  function clearPreview() {
    const canvas = previewRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    context.clearRect(0, 0, rect.width, rect.height);
  }

  function flushPoints(id, flushAll = false) {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    do {
      const points = pendingPointsRef.current.splice(0, 64);
      if (points.length) socket.emit("connecto:stroke", { meetingId, id, phase: "points", points });
    } while (flushAll && pendingPointsRef.current.length);
    if (pendingPointsRef.current.length) {
      frameRef.current = requestAnimationFrame(() => flushPoints(id));
    }
  }

  function onPointerDown(event) {
    if (syncStatus !== "live" || event.button !== 0) return;
    const point = normalizedPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
    if (!point) return;
    if (tool === "text") {
      setTextDraft({ point, left: `${point.x * 100}%`, top: `${point.y * 100}%` });
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const id = makeId(userId);
    if (tool === "pen" || tool === "eraser") {
      const operation = { id, ownerId: userId, kind: "stroke", tool, color, size, points: [point], undone: false };
      operationsRef.current = [...operationsRef.current, operation];
      draftRef.current = { kind: "stroke", operation, pointerId: event.pointerId };
      drawStrokeSegment(canvasRef.current, operation, point, point);
      pendingPointsRef.current = [];
      socket.emit("connecto:stroke", {
        meetingId,
        id,
        phase: "start",
        tool,
        color,
        size,
        points: [point],
      });
      return;
    }

    draftRef.current = {
      kind: "shape",
      operation: { id, ownerId: userId, kind: tool, color, size, start: point, end: point, undone: false },
      pointerId: event.pointerId,
    };
    redrawPreview(draftRef.current);
  }

  function onPointerMove(event) {
    const point = normalizedPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
    if (!point) return;
    const now = Date.now();
    if (now - lastCursorSentRef.current >= 50) {
      socket.emit("connecto:cursor", { meetingId, point });
      lastCursorSentRef.current = now;
    }

    const draft = draftRef.current;
    if (!draft || draft.pointerId !== event.pointerId) return;
    if (draft.kind === "stroke") {
      const previous = draft.operation.points[draft.operation.points.length - 1];
      draft.operation.points.push(point);
      drawStrokeSegment(canvasRef.current, draft.operation, previous, point);
      pendingPointsRef.current.push(point);
      if (!frameRef.current) {
        frameRef.current = requestAnimationFrame(() => flushPoints(draft.operation.id));
      }
      return;
    }
    draft.operation.end = point;
    redrawPreview(draft);
  }

  function onPointerUp(event) {
    const draft = draftRef.current;
    if (!draft || draft.pointerId !== event.pointerId) return;
    if (draft.kind === "stroke") {
      flushPoints(draft.operation.id, true);
      socket.emit("connecto:stroke", { meetingId, id: draft.operation.id, phase: "end" });
      updateOperations([...operationsRef.current]);
      setCanRedo(false);
    } else {
      const operation = draft.operation;
      const { start, end } = operation;
      if (Math.hypot(end.x - start.x, end.y - start.y) > 0.002) {
        operationsRef.current = [...operationsRef.current, operation];
        updateOperations(operationsRef.current);
        socket.emit("connecto:object", { meetingId, ...operation });
        setCanRedo(false);
      }
    }
    draftRef.current = null;
    clearPreview();
  }

  function onPointerCancel(event) {
    onPointerUp(event);
  }

  function submitText(event) {
    event.preventDefault();
    const text = event.currentTarget.elements.namedItem("board-text").value.trim();
    if (!text || !textDraft) {
      setTextDraft(null);
      return;
    }
    const operation = {
      id: makeId(userId),
      ownerId: userId,
      kind: "text",
      point: textDraft.point,
      text,
      color,
      size,
      undone: false,
    };
    operationsRef.current = [...operationsRef.current, operation];
    updateOperations(operationsRef.current);
    socket.emit("connecto:object", { meetingId, ...operation });
    setCanRedo(false);
    setTextDraft(null);
  }

  function undo() {
    socket.emit("connecto:history", { meetingId, action: "undo" });
  }

  function redo() {
    socket.emit("connecto:history", { meetingId, action: "redo" });
  }

  function clearBoard() {
    if (window.confirm("Clear the shared board for everyone?")) {
      socket.emit("connecto:clear", { meetingId });
    }
  }

  const visibleParticipants = participants.filter((participant) => userIdOf(participant));

  return (
    <section className="connecto-board" aria-label="CONNECTO collaborative whiteboard">
      <header className="connecto-header">
        <div>
          <p className="connecto-kicker">SHARED WHITEBOARD</p>
          <h2>CONNECTO</h2>
        </div>
        <div className={`connecto-sync connecto-sync-${syncStatus}`} role="status">
          <span />
          {syncStatus === "live" ? "Live" : syncStatus === "syncing" ? "Syncing" : syncStatus === "paused" ? "Waiting" : "Offline"}
        </div>
      </header>

      <div className="connecto-toolbar" role="toolbar" aria-label="Whiteboard tools">
        <div className="connecto-tool-group">
          {tools.map(([name, label]) => (
            <button
              key={name}
              className={`connecto-tool ${tool === name ? "connecto-tool-active" : ""}`}
              type="button"
              onClick={() => setTool(name)}
              aria-label={label}
              aria-pressed={tool === name}
              title={label}
            >
              <ToolIcon name={name} />
            </button>
          ))}
        </div>
        <label className="connecto-color" title="Drawing color">
          <span>Color</span>
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="Drawing color" />
        </label>
        <label className="connecto-size">
          <span>Size</span>
          <input type="range" min="1" max="24" value={size} onChange={(event) => setSize(Number(event.target.value))} aria-label="Brush size" />
        </label>
        <div className="connecto-history">
          <button type="button" className="connecto-action" onClick={undo} disabled={syncStatus !== "live" || !canUndo} aria-label="Undo" title="Undo"><HistoryIcon /></button>
          <button type="button" className="connecto-action" onClick={redo} disabled={syncStatus !== "live" || !canRedo} aria-label="Redo" title="Redo"><HistoryIcon redo /></button>
          <button type="button" className="connecto-clear" onClick={clearBoard} disabled={syncStatus !== "live"} aria-label="Clear board">Clear</button>
        </div>
      </div>

      <div className="connecto-participants">
        <span>{visibleParticipants.length} connected</span>
        <div className="connecto-avatar-list">
          {visibleParticipants.map((participant) => {
            const id = userIdOf(participant);
            return (
              <span
                key={id}
                className="connecto-participant"
                title={participant.name || "Participant"}
                style={{
                  "--cursor-color": cursorColor(
                    id,
                    [...participantKey.split(":").filter(Boolean), ...cursors.map((cursor) => cursor.userId)],
                    userId,
                  ),
                }}
              >
                {(participant.name || "?").slice(0, 1).toUpperCase()}
              </span>
            );
          })}
        </div>
        {visibleParticipants.map((participant) => (
          <span className="connecto-participant-name" key={`name-${userIdOf(participant)}`}>
            {userIdOf(participant) === userId ? "You" : participant.name || "Participant"}
          </span>
        ))}
      </div>

      <div className="connecto-canvas-wrap">
        <div className="connecto-canvas-area">
          <canvas
            ref={canvasRef}
            className="connecto-canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          />
          <canvas ref={previewRef} className="connecto-preview" aria-hidden="true" />
          {cursors.map((cursor) => (
            <div
              className="connecto-cursor"
              key={cursor.userId}
              style={{ left: `${cursor.point.x * 100}%`, top: `${cursor.point.y * 100}%`, "--cursor-color": cursor.color }}
            >
              <span />
              <strong>{cursor.name || "Participant"}</strong>
            </div>
          ))}
          {textDraft && (
            <form
              className="connecto-text-entry"
              style={{ left: textDraft.left, top: textDraft.top }}
              onSubmit={submitText}
            >
              <input ref={textInputRef} name="board-text" aria-label="Text to add to board" maxLength={500} placeholder="Type and press Enter" />
              <button type="submit" className="visually-hidden">Add text</button>
              <button type="button" onClick={() => setTextDraft(null)} aria-label="Cancel text">×</button>
            </form>
          )}
        </div>
      </div>
      {error && <p className="connecto-error" role="alert">{error}</p>}
    </section>
  );
}
