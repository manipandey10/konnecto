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
  if (event.action === "stroke-points") {
    return operations.map((operation) =>
      operation.id === event.operationId
        ? { ...operation, points: [...operation.points, ...event.points] }
        : operation,
    );
  }
  return operations;
}

export function applyHistoryEvent(operations, event) {
  return operations.map((operation) =>
    operation.id === event.operationId
      ? { ...operation, undone: event.action === "undo" }
      : operation,
  );
}
