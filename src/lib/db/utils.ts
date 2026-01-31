/**
 * Shared database utilities
 */

/**
 * Generate a unique ID using crypto.randomUUID with fallback
 * @returns UUID string
 */
export function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get current timestamp in ISO format
 * @returns ISO timestamp string
 */
export function now(): string {
  return new Date().toISOString();
}
