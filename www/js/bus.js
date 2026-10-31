// Minimal event bus shared by the app's parts.
const handlers = new Map();

export function on(type, fn) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type).add(fn);
  return () => handlers.get(type).delete(fn);
}

export function emit(type, data) {
  for (const fn of handlers.get(type) || []) {
    try {
      fn(data);
    } catch (e) {
      console.error(`[bus] ${type}`, e);
    }
  }
}
