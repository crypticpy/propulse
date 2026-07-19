// ---------------------------------------------------------------------------
// ft8DecoderWorker.ts — Web Worker for FT8/FT4 WASM decoding
// ---------------------------------------------------------------------------
// Loaded via: new Worker(new URL('./ft8DecoderWorker.ts', import.meta.url), { type: 'module' })
//
// This worker:
//   1. Loads the Emscripten WASM module from /wasm/ft8.js
//   2. Accumulates resampled 12 kHz audio into a ring buffer
//   3. Tracks UTC cycle boundaries (15s for FT8, 7.5s for FT4)
//   4. Feeds accumulated audio to the WASM decoder at each cycle boundary
//   5. Posts decoded messages back to the main thread
// ---------------------------------------------------------------------------

import type {
  Ft8WorkerInbound,
  Ft8WorkerOutbound,
  Ft8RawDecode,
  Ft8DecodeDepthWorkerConfig,
} from "./types";
import { resampleTo12k } from "./resample";

// ---------------------------------------------------------------------------
// Emscripten Module type (subset of the ccall/HEAPF32 API we use)
// ---------------------------------------------------------------------------

interface EmscriptenModule {
  ccall(
    ident: string,
    returnType: string | null,
    argTypes: string[],
    args: unknown[],
  ): unknown;
  HEAPF32: Float32Array;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Target sample rate for the FT8 decoder */
const SAMPLE_RATE = 12_000;

/** FT8 cycle duration in seconds */
const FT8_CYCLE_SEC = 15;

/** FT4 cycle duration in seconds */
const FT4_CYCLE_SEC = 7.5;

/** Maximum candidates to pass to ft8_decode */
const MAX_CANDIDATES = 200;

/** Fallback LDPC iterations when no decode-depth config is supplied. */
const DEFAULT_LDPC_ITER = 20;

/** How often to post cycleProgress updates (ms) */
const PROGRESS_INTERVAL_MS = 250;

// ---------------------------------------------------------------------------
// Worker state
// ---------------------------------------------------------------------------

let wasmModule: EmscriptenModule | null = null;
let protocol: "FT8" | "FT4" = "FT8";
let blockSize = 0;
let initialized = false;

// LDPC iteration budget — driven by the sdrFt8DecodeDepth setting, read at
// init. Defaults to DEFAULT_LDPC_ITER until an init config overrides it.
let maxLdpcIter = DEFAULT_LDPC_ITER;

// Ring buffer for accumulating one cycle of 12 kHz audio
let cycleBuffer: Float32Array | null = null;
let cycleWritePos = 0;
let cycleSampleCount = 0; // total samples expected per cycle

// Timing
let cycleStartMs = 0;
let lastProgressPost = 0;

// WASM heap buffer for passing audio data
let wasmBufferPtr = 0;
let wasmBufferSize = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function post(msg: Ft8WorkerOutbound): void {
  self.postMessage(msg);
}

function postError(message: string): void {
  post({ type: "error", message });
}

function getCycleDurationSec(): number {
  return protocol === "FT8" ? FT8_CYCLE_SEC : FT4_CYCLE_SEC;
}

function getCycleDurationMs(): number {
  return getCycleDurationSec() * 1000;
}

/**
 * Compute the start timestamp (ms since epoch) of the current cycle
 * based on UTC wall-clock alignment.
 */
function computeCycleStartMs(): number {
  const now = Date.now();
  const cycleDurationMs = getCycleDurationMs();
  return now - (now % cycleDurationMs);
}

/**
 * Compute progress through the current cycle as a fraction [0, 1].
 */
function computeCycleProgress(): number {
  const cycleDurationMs = getCycleDurationMs();
  const elapsed = Date.now() - cycleStartMs;
  return Math.min(1, Math.max(0, elapsed / cycleDurationMs));
}

// ---------------------------------------------------------------------------
// WASM module loading
// ---------------------------------------------------------------------------

async function loadWasmModule(): Promise<EmscriptenModule> {
  // The Emscripten glue file (ft8.js) uses `var createFT8Module = ...` which is
  // a script-global, not an ES module. In a Vite module worker we cannot use
  // importScripts, so we fetch the script text and eval it into the worker scope.
  const resp = await fetch("/wasm/ft8.js");
  if (!resp.ok) {
    throw new Error(
      `Failed to fetch /wasm/ft8.js: ${resp.status} ${resp.statusText}`,
    );
  }

  const code = await resp.text();

  // Indirect eval to execute in global scope
  const evalInGlobal = new Function(code + "\nreturn createFT8Module;");
  const createFT8Module = evalInGlobal() as (
    opts: Record<string, unknown>,
  ) => Promise<EmscriptenModule>;

  const mod = await createFT8Module({
    locateFile: (path: string) => `/wasm/${path}`,
  });

  return mod;
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

async function handleInit(
  proto: "FT8" | "FT4",
  decodeDepth?: Ft8DecodeDepthWorkerConfig,
): Promise<void> {
  protocol = proto;
  maxLdpcIter = decodeDepth?.maxIterations ?? DEFAULT_LDPC_ITER;

  try {
    // Load WASM module if not already loaded
    if (!wasmModule) {
      wasmModule = await loadWasmModule();
    }

    const protocolNum = protocol === "FT8" ? 1 : 0;
    const initResult = wasmModule.ccall(
      "ft8_init",
      "number",
      ["number", "number"],
      [protocolNum, SAMPLE_RATE],
    ) as number;

    if (initResult !== 0) {
      throw new Error(`ft8_init returned error code ${initResult}`);
    }

    // Get the block size (samples per symbol block)
    blockSize = wasmModule.ccall(
      "ft8_get_block_size",
      "number",
      [],
      [],
    ) as number;

    // Allocate cycle buffer: one full cycle of audio at 12 kHz
    cycleSampleCount = Math.ceil(getCycleDurationSec() * SAMPLE_RATE);
    cycleBuffer = new Float32Array(cycleSampleCount);
    cycleWritePos = 0;

    // Allocate a WASM heap buffer large enough for one block
    ensureWasmBuffer(blockSize);

    // Synchronize to current UTC cycle boundary
    cycleStartMs = computeCycleStartMs();

    initialized = true;
    post({ type: "ready" });
  } catch (err) {
    initialized = false;
    const message = err instanceof Error ? err.message : String(err);
    postError(`FT8 init failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// WASM heap buffer management
// ---------------------------------------------------------------------------

function ensureWasmBuffer(numFloats: number): void {
  if (!wasmModule) return;

  if (wasmBufferPtr !== 0 && wasmBufferSize >= numFloats) {
    return; // Already large enough
  }

  // Free existing buffer
  if (wasmBufferPtr !== 0) {
    wasmModule.ccall("ft8_free_buffer", null, ["number"], [wasmBufferPtr]);
  }

  wasmBufferPtr = wasmModule.ccall(
    "ft8_alloc_float_buffer",
    "number",
    ["number"],
    [numFloats],
  ) as number;

  wasmBufferSize = numFloats;
}

// ---------------------------------------------------------------------------
// Audio ingestion
// ---------------------------------------------------------------------------

function handleAudio(samples: Float32Array, sampleRate: number): void {
  if (!initialized || !cycleBuffer) return;

  // Resample to 12 kHz
  const resampled = resampleTo12k(samples, sampleRate);

  // Check if we have crossed a cycle boundary since our last write
  const now = Date.now();
  const currentCycleStart = computeCycleStartMs();

  if (currentCycleStart !== cycleStartMs) {
    // Cycle boundary crossed — decode the accumulated buffer and start fresh
    runDecodeAndReset();
    cycleStartMs = currentCycleStart;
  }

  // Append resampled audio to the cycle buffer
  const remaining = cycleSampleCount - cycleWritePos;
  const toCopy = Math.min(resampled.length, remaining);

  if (toCopy > 0) {
    cycleBuffer.set(resampled.subarray(0, toCopy), cycleWritePos);
    cycleWritePos += toCopy;
  }

  // Post progress update at throttled intervals
  if (now - lastProgressPost >= PROGRESS_INTERVAL_MS) {
    lastProgressPost = now;
    post({ type: "cycleProgress", progress: computeCycleProgress() });
  }
}

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

function runDecodeAndReset(): void {
  if (!wasmModule || !cycleBuffer || !initialized) return;

  // Only attempt decode if we have at least one block worth of audio
  if (cycleWritePos < blockSize) {
    resetCycleBuffer();
    return;
  }

  const decodeCycleStart = cycleStartMs;

  try {
    // Reset the WASM decoder state for a fresh cycle
    wasmModule.ccall("ft8_reset", null, [], []);

    // Feed audio to WASM in block-sized chunks
    const numFullBlocks = Math.floor(cycleWritePos / blockSize);
    ensureWasmBuffer(blockSize);

    for (let b = 0; b < numFullBlocks; b++) {
      const offset = b * blockSize;
      const block = cycleBuffer.subarray(offset, offset + blockSize);

      // Copy block data to the WASM heap
      wasmModule.HEAPF32.set(block, wasmBufferPtr / 4);

      // Process this block
      wasmModule.ccall(
        "ft8_process",
        null,
        ["number", "number"],
        [wasmBufferPtr, blockSize],
      );
    }

    // Run the decoder
    const numDecodes = wasmModule.ccall(
      "ft8_decode",
      "number",
      ["number", "number"],
      [MAX_CANDIDATES, maxLdpcIter],
    ) as number;

    // Read results
    const results: Ft8RawDecode[] = [];

    for (let i = 0; i < numDecodes; i++) {
      const message = wasmModule.ccall(
        "ft8_get_decode_message",
        "string",
        ["number"],
        [i],
      ) as string;

      const freqHz = wasmModule.ccall(
        "ft8_get_decode_freq",
        "number",
        ["number"],
        [i],
      ) as number;

      const timeSec = wasmModule.ccall(
        "ft8_get_decode_time",
        "number",
        ["number"],
        [i],
      ) as number;

      const snr = wasmModule.ccall(
        "ft8_get_decode_snr",
        "number",
        ["number"],
        [i],
      ) as number;

      const ldpcErrors = wasmModule.ccall(
        "ft8_get_decode_ldpc_errors",
        "number",
        ["number"],
        [i],
      ) as number;

      const score = wasmModule.ccall(
        "ft8_get_decode_score",
        "number",
        ["number"],
        [i],
      ) as number;

      results.push({ freqHz, timeSec, snr, message, ldpcErrors, score });
    }

    // Post results back to the main thread
    post({
      type: "decodes",
      results,
      cycleStartMs: decodeCycleStart,
      protocol,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    postError(`Decode failed: ${message}`);
  }

  // Reset the buffer for the next cycle
  resetCycleBuffer();
}

function resetCycleBuffer(): void {
  if (cycleBuffer) {
    cycleBuffer.fill(0);
  }
  cycleWritePos = 0;
}

// ---------------------------------------------------------------------------
// Protocol switching
// ---------------------------------------------------------------------------

function handleSetProtocol(newProtocol: "FT8" | "FT4"): void {
  if (!wasmModule || !initialized) {
    postError("Cannot switch protocol: not initialized");
    return;
  }

  // If same protocol, nothing to do
  if (newProtocol === protocol) return;

  protocol = newProtocol;

  try {
    // Re-initialize WASM for the new protocol
    const protocolNum = protocol === "FT8" ? 1 : 0;
    wasmModule.ccall(
      "ft8_init",
      "number",
      ["number", "number"],
      [protocolNum, SAMPLE_RATE],
    );

    // Update block size (may differ between FT8 and FT4)
    blockSize = wasmModule.ccall(
      "ft8_get_block_size",
      "number",
      [],
      [],
    ) as number;

    // Reallocate cycle buffer for new duration
    cycleSampleCount = Math.ceil(getCycleDurationSec() * SAMPLE_RATE);
    cycleBuffer = new Float32Array(cycleSampleCount);
    cycleWritePos = 0;

    // Re-sync to UTC cycle boundary
    cycleStartMs = computeCycleStartMs();

    ensureWasmBuffer(blockSize);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    postError(`Protocol switch failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

function handleStop(): void {
  if (wasmModule && initialized) {
    try {
      // Free WASM heap buffer
      if (wasmBufferPtr !== 0) {
        wasmModule.ccall("ft8_free_buffer", null, ["number"], [wasmBufferPtr]);
        wasmBufferPtr = 0;
        wasmBufferSize = 0;
      }

      // Free WASM decoder resources
      wasmModule.ccall("ft8_free", null, [], []);
    } catch {
      // Best-effort cleanup — ignore errors during shutdown
    }
  }

  initialized = false;
  wasmModule = null;
  cycleBuffer = null;
  cycleWritePos = 0;
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.onmessage = (event: MessageEvent<Ft8WorkerInbound>) => {
  const msg = event.data;

  switch (msg.type) {
    case "init":
      handleInit(msg.protocol, msg.decodeDepth).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        postError(`Unhandled init error: ${message}`);
      });
      break;

    case "audio":
      handleAudio(msg.samples, msg.sampleRate);
      break;

    case "setProtocol":
      handleSetProtocol(msg.protocol);
      break;

    case "stop":
      handleStop();
      break;
  }
};
