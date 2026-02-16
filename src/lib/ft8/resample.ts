// ---------------------------------------------------------------------------
// resample.ts — 4:1 polyphase decimation filter for FT8 decoder
// ---------------------------------------------------------------------------
// Downsamples audio to 12 kHz for the FT8/FT4 WASM decoder.
// For the common 48 kHz case, uses a 16-tap Hann-windowed sinc FIR anti-aliasing
// filter followed by integer 4:1 decimation.
// For other sample rates, falls back to linear interpolation.
// ---------------------------------------------------------------------------

/** Target sample rate required by the FT8 WASM decoder */
const TARGET_RATE = 12_000;

/** Decimation factor for 48 kHz -> 12 kHz */
const DECIMATE_FACTOR = 4;

/** Number of FIR taps for the anti-aliasing filter */
const NUM_TAPS = 16;

/**
 * Pre-computed 16-tap Hann-windowed sinc low-pass FIR kernel.
 * Cutoff: 6000 Hz (Nyquist of 12 kHz target) at 48 kHz sample rate.
 * Normalized so that the sum of coefficients equals 1.0.
 */
const FIR_KERNEL = buildFirKernel();

function buildFirKernel(): Float32Array {
  const kernel = new Float32Array(NUM_TAPS);
  const fc = 6_000 / 48_000; // Normalized cutoff frequency
  const center = (NUM_TAPS - 1) / 2;
  let sum = 0;

  for (let n = 0; n < NUM_TAPS; n++) {
    // Hann window
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (NUM_TAPS - 1)));

    // Sinc function (handle center tap where sinc(0) = 1)
    const x = n - center;
    const sinc =
      Math.abs(x) < 1e-10
        ? 1.0
        : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x);

    kernel[n] = w * sinc;
    sum += kernel[n];
  }

  // Normalize to unity gain
  if (sum !== 0) {
    for (let n = 0; n < NUM_TAPS; n++) {
      kernel[n] /= sum;
    }
  }

  return kernel;
}

/**
 * Apply FIR filter and decimate by factor of 4 (48 kHz -> 12 kHz).
 * Uses direct-form FIR convolution evaluated only at output sample positions,
 * which avoids computing filtered values that would be discarded by decimation.
 */
function firDecimate4(samples: Float32Array): Float32Array {
  const inputLen = samples.length;
  const outputLen = Math.floor(inputLen / DECIMATE_FACTOR);
  const output = new Float32Array(outputLen);

  for (let i = 0; i < outputLen; i++) {
    const inputIdx = i * DECIMATE_FACTOR;
    let acc = 0;

    for (let t = 0; t < NUM_TAPS; t++) {
      const sampleIdx = inputIdx - t + (NUM_TAPS >> 1);
      if (sampleIdx >= 0 && sampleIdx < inputLen) {
        acc += samples[sampleIdx] * FIR_KERNEL[t];
      }
      // Out-of-bounds samples treated as zero (implicit zero-padding)
    }

    output[i] = acc;
  }

  return output;
}

/**
 * Resample using linear interpolation for arbitrary rate conversion.
 * Used as a fallback for sample rates other than 48 kHz.
 */
function linearResample(samples: Float32Array, srcRate: number): Float32Array {
  const ratio = srcRate / TARGET_RATE;
  const outputLen = Math.floor(samples.length / ratio);
  const output = new Float32Array(outputLen);

  for (let i = 0; i < outputLen; i++) {
    const srcPos = i * ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;

    const s0 = samples[idx] ?? 0;
    const s1 = samples[Math.min(idx + 1, samples.length - 1)] ?? 0;
    output[i] = s0 + frac * (s1 - s0);
  }

  return output;
}

/**
 * Downsample audio from srcRate to 12000 Hz.
 * For 48 kHz input, uses integer 4:1 decimation with a low-pass FIR anti-aliasing filter.
 * For other rates, uses linear interpolation.
 * @returns Float32Array of resampled audio at 12000 Hz
 */
export function resampleTo12k(
  samples: Float32Array,
  srcRate: number,
): Float32Array {
  // Already at target rate — return a copy to avoid aliasing
  if (srcRate === TARGET_RATE) {
    return new Float32Array(samples);
  }

  // Exact 4:1 decimation for 48 kHz — most common browser audio rate
  if (srcRate === 48_000) {
    return firDecimate4(samples);
  }

  // Fallback: linear interpolation for other rates (44100, 96000, etc.)
  return linearResample(samples, srcRate);
}
