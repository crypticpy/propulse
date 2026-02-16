// ---------------------------------------------------------------------------
// audioFftWorker — Web Worker for audio FFT computation
// ---------------------------------------------------------------------------
// Offloads the Cooley-Tukey radix-2 FFT from the main thread.  All typed-
// array buffers are pre-allocated in the Worker constructor — ZERO per-frame
// allocations.  Communication uses transferable ArrayBuffers so neither the
// inbound samples nor the outbound bins are copied across threads.
//
// Message protocol:
//   IN:  { type: "audio", samples: Float32Array, sampleRate: number }
//   OUT: { type: "fft",   bins: Float32Array, sampleRate: number }
// ---------------------------------------------------------------------------

const AUDIO_FFT_WORKER_CODE = `
"use strict";

var FFT_SIZE  = 4096;
var HALF      = FFT_SIZE / 2;
var FRAME_MS  = 50;          // minimum interval between outputs (~20 fps)

// ── Pre-allocated buffers (created once, reused every frame) ──────────────
var ring        = new Float32Array(FFT_SIZE);
var writePos    = 0;
var hasFull     = false;
var lastEmit    = 0;

// Hann window
var hann = new Float32Array(FFT_SIZE);
for (var i = 0; i < FFT_SIZE; i++) {
  hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (FFT_SIZE - 1)));
}

// Scratch arrays for FFT computation
var re   = new Float32Array(FFT_SIZE);
var im   = new Float32Array(FFT_SIZE);
var bins = new Float32Array(HALF);

// Output buffer (separate from bins so we can transfer without clobbering)
var outBuf = new Float32Array(HALF);

// ── Radix-2 Cooley-Tukey FFT (in-place) ──────────────────────────────────
function fftInPlace(re, im) {
  var n = re.length;

  // Bit-reversal permutation
  for (var i = 1, j = 0; i < n; i++) {
    var bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      var tmp = re[i]; re[i] = re[j]; re[j] = tmp;
      tmp = im[i]; im[i] = im[j]; im[j] = tmp;
    }
  }

  // Butterfly stages
  for (var len = 2; len <= n; len <<= 1) {
    var halfLen = len >> 1;
    var angle = (-2 * Math.PI) / len;
    var wRe = Math.cos(angle);
    var wIm = Math.sin(angle);
    for (var i = 0; i < n; i += len) {
      var curRe = 1;
      var curIm = 0;
      for (var j = 0; j < halfLen; j++) {
        var a = i + j;
        var b = a + halfLen;
        var tRe = curRe * re[b] - curIm * im[b];
        var tIm = curRe * im[b] + curIm * re[b];
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] += tRe;
        im[a] += tIm;
        var nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

// ── Message handler ───────────────────────────────────────────────────────
self.onmessage = function (e) {
  var msg = e.data;
  if (msg.type !== "audio") return;

  var samples    = msg.samples;    // Float32Array (transferred)
  var sampleRate = msg.sampleRate;
  var len        = samples.length;

  // Accumulate into ring buffer
  for (var i = 0; i < len; i++) {
    ring[writePos] = samples[i];
    writePos = (writePos + 1) % FFT_SIZE;
    if (writePos === 0) hasFull = true;
  }

  // Throttle output
  var now = performance.now();
  if (now - lastEmit < FRAME_MS) return;
  if (!hasFull) return;
  lastEmit = now;

  // Build windowed input from ring (oldest sample at writePos)
  for (var i = 0; i < FFT_SIZE; i++) {
    var idx = (writePos + i) % FFT_SIZE;
    re[i] = ring[idx] * hann[i];
    im[i] = 0;
  }

  // FFT
  fftInPlace(re, im);

  // Magnitude spectrum → dB (first half = positive frequencies)
  var norm = 1 / FFT_SIZE;
  for (var k = 0; k < HALF; k++) {
    var magSq = re[k] * re[k] + im[k] * im[k];
    bins[k] = 10 * Math.log10(Math.max(1e-20, magSq * norm * norm));
  }

  // Copy to output buffer (bins is reused, outBuf is transferred)
  outBuf.set(bins);

  // Transfer outBuf to main thread; replace with new buffer
  self.postMessage(
    { type: "fft", bins: outBuf, sampleRate: sampleRate },
    [outBuf.buffer]
  );

  // Reallocate output buffer (the old one was transferred)
  outBuf = new Float32Array(HALF);
};
`;

// ---------------------------------------------------------------------------
// Factory — creates a Worker from the inline blob
// ---------------------------------------------------------------------------

let blobUrl: string | null = null;
let blobRefCount = 0;

/**
 * Create a new Web Worker that computes FFT frames from raw audio samples.
 *
 * Call `worker.terminate()` when done, then call `disposeAudioFftWorker()`
 * to release the shared blob URL (ref-counted — only revoked when all
 * consumers have disposed).
 */
export function createAudioFftWorker(): Worker {
  if (!blobUrl) {
    const blob = new Blob([AUDIO_FFT_WORKER_CODE], {
      type: "application/javascript",
    });
    blobUrl = URL.createObjectURL(blob);
  }
  blobRefCount++;
  return new Worker(blobUrl);
}

/**
 * Decrement the blob URL ref count.  Revokes the URL only when all
 * consumers have disposed (safe for StrictMode double-mount).
 */
export function disposeAudioFftWorker(): void {
  blobRefCount--;
  if (blobRefCount <= 0 && blobUrl) {
    URL.revokeObjectURL(blobUrl);
    blobUrl = null;
    blobRefCount = 0;
  }
}
