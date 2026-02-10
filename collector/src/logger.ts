import type { LogLevel } from "./types.js";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};
let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function log(
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (LEVELS[level] < LEVELS[currentLevel]) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(data || {}),
  };
  const out = level === "error" ? process.stderr : process.stdout;
  out.write(JSON.stringify(entry) + "\n");
}
