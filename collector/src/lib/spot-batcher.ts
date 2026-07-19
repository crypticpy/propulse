import type { SupabaseClient } from "@supabase/supabase-js";
import { reportHealth } from "../health.js";
import { log } from "../logger.js";
import type { NormalizedSpot } from "../types.js";
import { insertSpots, reportToDb } from "./db-helpers.js";

interface SpotBatcherOptions {
  db: SupabaseClient;
  source: NormalizedSpot["source"];
  flushIntervalMs?: number;
  receiptIntervalMs?: number;
  maxBufferedSpots?: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class SpotBatcher {
  private readonly db: SupabaseClient;
  private readonly source: NormalizedSpot["source"];
  private readonly flushIntervalMs: number;
  private readonly receiptIntervalMs: number;
  private readonly maxBufferedSpots: number;
  private buffer: NormalizedSpot[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private connected = false;
  private lastReceiptAt = 0;
  private droppedSpots = 0;

  constructor(options: SpotBatcherOptions) {
    this.db = options.db;
    this.source = options.source;
    this.flushIntervalMs = options.flushIntervalMs ?? 30_000;
    this.receiptIntervalMs = options.receiptIntervalMs ?? 5 * 60_000;
    this.maxBufferedSpots = options.maxBufferedSpots ?? 10_000;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), this.flushIntervalMs);
  }

  setConnected(connected: boolean): void {
    this.connected = connected;
    reportHealth(this.source, connected ? "ok" : "error", 0);
  }

  enqueue(spot: NormalizedSpot): void {
    if (this.buffer.length >= this.maxBufferedSpots) {
      this.buffer.shift();
      this.droppedSpots += 1;
    }
    this.buffer.push(spot);
  }

  async flush(): Promise<void> {
    if (this.flushing) return;

    const now = Date.now();
    if (
      this.buffer.length === 0 &&
      (!this.connected || now - this.lastReceiptAt < this.receiptIntervalMs)
    ) {
      return;
    }

    this.flushing = true;
    const started = Date.now();
    const batch = this.buffer.splice(0, this.buffer.length);
    const dropped = this.droppedSpots;
    this.droppedSpots = 0;

    try {
      const inserted = await insertSpots(this.db, batch, this.source);
      reportHealth(this.source, "ok", inserted);
      await reportToDb(
        this.db,
        this.source,
        "ok",
        inserted,
        Date.now() - started,
        dropped > 0 ? `Dropped ${dropped} buffered spots` : undefined,
      );
      this.lastReceiptAt = now;
      if (inserted > 0 || dropped > 0) {
        log("info", `${this.source}: stream batch stored`, {
          spots: inserted,
          dropped,
          buffered: this.buffer.length,
          durationMs: Date.now() - started,
        });
      }
    } catch (error) {
      const available = Math.max(0, this.maxBufferedSpots - this.buffer.length);
      const retained = available > 0 ? batch.slice(-available) : [];
      this.buffer = retained.concat(this.buffer);
      this.droppedSpots += Math.max(0, batch.length - available) + dropped;
      reportHealth(this.source, "error", 0);

      const message = errorMessage(error);
      try {
        await reportToDb(
          this.db,
          this.source,
          "error",
          0,
          Date.now() - started,
          message,
        );
      } catch (receiptError) {
        log("error", `${this.source}: failed to store error receipt`, {
          error: errorMessage(receiptError),
        });
      }
      log("error", `${this.source}: stream batch failed`, {
        error: message,
        buffered: this.buffer.length,
      });
    } finally {
      this.flushing = false;
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.flush();
  }
}
