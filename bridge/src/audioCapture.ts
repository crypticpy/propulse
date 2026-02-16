/**
 * AudioCapture — Captures audio from a system audio device via ffmpeg.
 *
 * Spawns ffmpeg with avfoundation (macOS) to capture mono 48kHz PCM i16
 * from the specified audio input device. Emits chunked PCM buffers at
 * roughly 20 fps (960 samples per chunk at 48kHz).
 */

import { spawn, type ChildProcess } from "child_process";

const SAMPLE_RATE = 48000;
const CHANNELS = 1;
const BYTES_PER_SAMPLE = 2; // i16
/** Samples per chunk — 960 samples = 20ms @ 48kHz → ~50 chunks/sec */
const CHUNK_SAMPLES = 960;
const CHUNK_BYTES = CHUNK_SAMPLES * BYTES_PER_SAMPLE;

export interface AudioCaptureOptions {
  /** avfoundation audio device index or name (e.g. "2" or "USB Audio Device") */
  device: string;
  /** Sample rate (default 48000) */
  sampleRate?: number;
}

type PcmListener = (samples: Int16Array, sampleRate: number) => void;

export class AudioCapture {
  private proc: ChildProcess | null = null;
  private listeners: PcmListener[] = [];
  private remainder = Buffer.alloc(0);
  private readonly device: string;
  private readonly sampleRate: number;
  private running = false;

  constructor(opts: AudioCaptureOptions) {
    this.device = opts.device;
    this.sampleRate = opts.sampleRate ?? SAMPLE_RATE;
  }

  /** Register a PCM data listener. Returns an unsubscribe function. */
  onPcm(listener: PcmListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /** Start capturing audio. */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Use avfoundation on macOS: ":N" means audio device index N (no video)
    const deviceArg = `:${this.device}`;

    this.proc = spawn(
      "ffmpeg",
      [
        "-f",
        "avfoundation",
        "-i",
        deviceArg,
        "-ac",
        String(CHANNELS),
        "-ar",
        String(this.sampleRate),
        "-f",
        "s16le", // raw signed 16-bit little-endian PCM
        "-acodec",
        "pcm_s16le",
        "pipe:1", // output to stdout
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    this.proc.stdout?.on("data", (chunk: Buffer) => {
      this.handlePcmData(chunk);
    });

    this.proc.stderr?.on("data", (data: Buffer) => {
      // ffmpeg sends info/progress to stderr — only log errors
      const msg = data.toString("utf8");
      if (msg.includes("Error") || msg.includes("error")) {
        console.error("[AudioCapture] ffmpeg error:", msg.trim());
      }
    });

    this.proc.on("close", (code) => {
      if (this.running) {
        console.error(`[AudioCapture] ffmpeg exited with code ${code}`);
      }
      this.proc = null;
      this.running = false;
    });

    this.proc.on("error", (err) => {
      console.error("[AudioCapture] ffmpeg spawn error:", err.message);
      this.proc = null;
      this.running = false;
    });
  }

  /** Stop capturing audio. */
  stop(): void {
    this.running = false;
    if (this.proc) {
      this.proc.kill("SIGTERM");
      this.proc = null;
    }
    this.remainder = Buffer.alloc(0);
  }

  /** Whether capture is currently running. */
  isRunning(): boolean {
    return this.running && this.proc !== null;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private handlePcmData(chunk: Buffer): void {
    // Prepend any leftover bytes from last call
    let buf: Buffer;
    if (this.remainder.length > 0) {
      buf = Buffer.concat([this.remainder, chunk]);
      this.remainder = Buffer.alloc(0);
    } else {
      buf = chunk;
    }

    let offset = 0;
    while (offset + CHUNK_BYTES <= buf.length) {
      // Extract a chunk of PCM samples
      const samples = new Int16Array(CHUNK_SAMPLES);
      for (let i = 0; i < CHUNK_SAMPLES; i++) {
        samples[i] = buf.readInt16LE(offset + i * BYTES_PER_SAMPLE);
      }

      for (const listener of this.listeners) {
        listener(samples, this.sampleRate);
      }

      offset += CHUNK_BYTES;
    }

    // Save leftover bytes for next call
    if (offset < buf.length) {
      this.remainder = buf.subarray(offset);
    }
  }
}
