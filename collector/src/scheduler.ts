import { log } from "./logger.js";

interface ScheduledTask {
  name: string;
  intervalMs: number;
  fn: () => Promise<void>;
  timer?: ReturnType<typeof setInterval>;
  running: boolean;
}

const tasks: ScheduledTask[] = [];

export function register(
  name: string,
  intervalMs: number,
  fn: () => Promise<void>,
): void {
  tasks.push({ name, intervalMs, fn, running: false });
}

export function startAll(): void {
  for (const task of tasks) {
    runTask(task); // Run immediately on startup
    task.timer = setInterval(() => runTask(task), task.intervalMs);
    log("info", `Scheduled "${task.name}" every ${task.intervalMs / 1000}s`);
  }
}

async function runTask(task: ScheduledTask): Promise<void> {
  if (task.running) {
    log("warn", `Skipping "${task.name}" — previous run still active`);
    return;
  }
  task.running = true;
  const start = Date.now();
  try {
    await task.fn();
    log("debug", `Task "${task.name}" done`, {
      durationMs: Date.now() - start,
    });
  } catch (err) {
    log("error", `Task "${task.name}" failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    task.running = false;
  }
}

export function stopAll(): void {
  for (const task of tasks) {
    if (task.timer) clearInterval(task.timer);
  }
}
