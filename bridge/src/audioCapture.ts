/**
 * AudioCapture — Captures audio from a system audio device via ffmpeg.
 *
 * Spawns ffmpeg with platform-specific input format to capture mono 48kHz
 * PCM i16 from the specified audio input device. Emits chunked PCM buffers
 * at roughly 50 fps (960 samples per chunk at 48kHz).
 *
 * Platform support:
 *   - macOS:   `-f avfoundation -i ":N"`
 *   - Linux:   `-f pulse -i "default"` (fallback: `-f alsa -i "hw:N,0"`)
 *   - Windows: `-f dshow -i audio="N"`
 */

import { spawn, execFile, type ChildProcess } from "child_process";
import os from "os";

const SAMPLE_RATE = 48000;
const CHANNELS = 1;
const BYTES_PER_SAMPLE = 2; // i16
/** Samples per chunk — 960 samples = 20ms @ 48kHz → ~50 chunks/sec */
const CHUNK_SAMPLES = 960;
const CHUNK_BYTES = CHUNK_SAMPLES * BYTES_PER_SAMPLE;

// ─── Platform Detection ─────────────────────────────────────────────────────

export type AudioPlatform = "darwin" | "linux" | "win32";

function detectPlatform(): AudioPlatform {
  const p = os.platform();
  if (p === "darwin" || p === "linux" || p === "win32") return p;
  // Best-effort fallback for FreeBSD / other Unix → use ALSA/PulseAudio flags
  return "linux";
}

/**
 * Build the ffmpeg input arguments for the current platform and device.
 *
 * Returns `["-f", <format>, "-i", <deviceArg>]`.
 */
function platformInputArgs(platform: AudioPlatform, device: string): string[] {
  switch (platform) {
    case "darwin":
      // avfoundation: ":N" means audio device index N (no video)
      return ["-f", "avfoundation", "-i", `:${device}`];
    case "linux":
      // Prefer PulseAudio if device looks like a PA source name or "default";
      // otherwise assume ALSA hardware address (e.g. "hw:0,0")
      if (
        device === "default" ||
        device.includes(".") ||
        !device.startsWith("hw:")
      ) {
        return ["-f", "pulse", "-i", device];
      }
      return ["-f", "alsa", "-i", device];
    case "win32":
      // DirectShow: audio="Device Name"
      return ["-f", "dshow", "-i", `audio=${device}`];
  }
}

// ─── Device Enumeration ─────────────────────────────────────────────────────

export interface AudioDeviceInfo {
  /** Platform-specific device identifier (index, name, or path) */
  id: string;
  /** Human-readable device name */
  name: string;
  /** Platform that produced this listing */
  platform: string;
}

/**
 * Parse macOS avfoundation device listing from ffmpeg stderr.
 * Lines look like: `[AVFoundation ...] [0] USB Audio Device`
 * Audio devices appear after the "AVFoundation audio devices:" header.
 */
function parseDarwinDevices(stderr: string): AudioDeviceInfo[] {
  const devices: AudioDeviceInfo[] = [];
  let inAudio = false;
  for (const line of stderr.split("\n")) {
    if (line.includes("AVFoundation audio devices:")) {
      inAudio = true;
      continue;
    }
    if (line.includes("AVFoundation video devices:")) {
      inAudio = false;
      continue;
    }
    if (inAudio) {
      const match = line.match(/\[(\d+)]\s+(.+)/);
      if (match) {
        devices.push({
          id: match[1],
          name: match[2].trim(),
          platform: "darwin",
        });
      }
    }
  }
  return devices;
}

/**
 * Parse Linux PulseAudio source listing.
 * `pactl list short sources` outputs lines like:
 *   0   alsa_input.usb-...   PipeWire   s16le 2ch 48000Hz   IDLE
 */
function parseLinuxPulseDevices(stdout: string): AudioDeviceInfo[] {
  const devices: AudioDeviceInfo[] = [];
  for (const line of stdout.split("\n")) {
    const parts = line.trim().split(/\t+/);
    if (parts.length >= 2) {
      devices.push({
        id: parts[1],
        name: parts[1],
        platform: "linux",
      });
    }
  }
  return devices;
}

/**
 * Parse Windows DirectShow device listing from ffmpeg stderr.
 * Lines look like: `[dshow ...] "Microphone (USB Audio)" (audio)`
 */
function parseWindowsDevices(stderr: string): AudioDeviceInfo[] {
  const devices: AudioDeviceInfo[] = [];
  let inAudio = false;
  for (const line of stderr.split("\n")) {
    if (line.includes("DirectShow audio devices")) {
      inAudio = true;
      continue;
    }
    if (line.includes("DirectShow video devices")) {
      inAudio = false;
      continue;
    }
    if (inAudio) {
      const match = line.match(/"([^"]+)"/);
      if (match && !line.includes("Alternative name")) {
        devices.push({
          id: match[1],
          name: match[1],
          platform: "win32",
        });
      }
    }
  }
  return devices;
}

// ─── Options ────────────────────────────────────────────────────────────────

export interface AudioCaptureOptions {
  /**
   * Audio device identifier:
   * - macOS: avfoundation index (e.g. "2") or name ("USB Audio Device")
   * - Linux: PulseAudio source name ("default") or ALSA device ("hw:0,0")
   * - Windows: DirectShow device name ("Microphone (USB Audio)")
   */
  device: string;
  /** Sample rate (default 48000) */
  sampleRate?: number;
}

type PcmListener = (samples: Int16Array, sampleRate: number) => void;

// ─── AudioCapture Class ─────────────────────────────────────────────────────

export class AudioCapture {
  private proc: ChildProcess | null = null;
  private listeners: PcmListener[] = [];
  private remainder = Buffer.alloc(0);
  private readonly device: string;
  private readonly sampleRate: number;
  private readonly platform: AudioPlatform;
  private running = false;

  constructor(opts: AudioCaptureOptions) {
    this.device = opts.device;
    this.sampleRate = opts.sampleRate ?? SAMPLE_RATE;
    this.platform = detectPlatform();
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

    const inputArgs = platformInputArgs(this.platform, this.device);

    this.proc = spawn(
      "ffmpeg",
      [
        ...inputArgs,
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

  /**
   * Enumerate audio input devices available on the current platform.
   *
   * - macOS:   runs `ffmpeg -f avfoundation -list_devices true -i ""`
   * - Linux:   runs `pactl list short sources` (falls back to empty on error)
   * - Windows: runs `ffmpeg -f dshow -list_devices true -i dummy`
   */
  static async listAudioDevices(): Promise<AudioDeviceInfo[]> {
    const platform = detectPlatform();

    return new Promise((resolve) => {
      if (platform === "linux") {
        // On Linux, use pactl for PulseAudio source enumeration
        execFile("pactl", ["list", "short", "sources"], (err, stdout) => {
          if (err) {
            // PulseAudio not available — return empty list
            resolve([]);
            return;
          }
          resolve(parseLinuxPulseDevices(stdout));
        });
        return;
      }

      // macOS and Windows: use ffmpeg device listing
      const args =
        platform === "darwin"
          ? ["-f", "avfoundation", "-list_devices", "true", "-i", ""]
          : ["-f", "dshow", "-list_devices", "true", "-i", "dummy"];

      const proc = spawn("ffmpeg", args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stderr = "";
      proc.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString("utf8");
      });

      proc.on("close", () => {
        const devices =
          platform === "darwin"
            ? parseDarwinDevices(stderr)
            : parseWindowsDevices(stderr);
        resolve(devices);
      });

      proc.on("error", () => {
        // ffmpeg not found or failed to run
        resolve([]);
      });
    });
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
