/** Structured clones only. Never aliases recipe or view objects. */
export function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

export function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    if (Array.isArray(value)) {
      for (const item of value) freezeDeep(item);
    } else {
      for (const child of Object.values(value)) freezeDeep(child);
    }
  }
  return value;
}
