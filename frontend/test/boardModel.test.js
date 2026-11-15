import test from "node:test";
import assert from "node:assert/strict";
import {
  applyHistoryEvent,
  applyOperationEvent,
  normalizedPoint,
} from "../src/whiteboard/boardModel.js";

test("canvas coordinates normalize and clamp to the canvas", () => {
  assert.deepEqual(normalizedPoint(25, 50, { left: 0, top: 0, width: 100, height: 100 }), {
    x: 0.25,
    y: 0.5,
  });
  assert.deepEqual(normalizedPoint(-10, 120, { left: 0, top: 0, width: 100, height: 100 }), {
    x: 0,
    y: 1,
  });
  assert.equal(normalizedPoint(10, 10, { left: 0, top: 0, width: 0, height: 100 }), null);
});

test("operation events add strokes once and append remote point batches", () => {
  const operation = { id: "stroke-1", points: [{ x: 0.1, y: 0.2 }] };
  const started = applyOperationEvent([], { action: "stroke-start", operation });
  assert.equal(applyOperationEvent(started, { action: "stroke-start", operation }), started);
  const updated = applyOperationEvent(started, {
    action: "stroke-points",
    operationId: "stroke-1",
    points: [{ x: 0.3, y: 0.4 }],
  });
  assert.deepEqual(updated[0].points, [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }]);
});

test("history events toggle only the selected operation", () => {
  const operations = [
    { id: "one", undone: false },
    { id: "two", undone: false },
  ];
  const undone = applyHistoryEvent(operations, { action: "undo", operationId: "one" });
  assert.equal(undone[0].undone, true);
  assert.equal(undone[1].undone, false);
  const redone = applyHistoryEvent(undone, { action: "redo", operationId: "one" });
  assert.equal(redone[0].undone, false);
});
