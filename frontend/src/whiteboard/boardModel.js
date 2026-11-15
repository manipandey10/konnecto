export function normalizedPoint(clientX, clientY, rect) {
  if (!rect.width || !rect.height) return null;
  return {
    x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
  };
}

export function applyOperationEvent(operations, event) {
  if (event.action === "stroke-start" || event.action === "object-add") {
    if (operations.some((operation) => operation.id === event.operation?.id)) return operations;
    return [...operations, event.operation];
  }
  return operations;
}

export function appendOperationPoints(operations, operationId, points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  const operation = operations.find((item) => item.id === operationId);
  if (!operation || !Array.isArray(operation.points)) return null;

  const previous = operation.points[operation.points.length - 1];
  operation.points.push(...points);
  return { operation, previous };
}

export function applyHistoryEvent(operations, event) {
  return operations.map((operation) =>
    operation.id === event.operationId
      ? { ...operation, undone: event.action === "undo" }
      : operation,
  );
}
