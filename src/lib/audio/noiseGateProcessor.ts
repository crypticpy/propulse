// ---------------------------------------------------------------------------
// NoiseGateProcessor — AudioWorkletProcessor for SDR audio noise gate
// ---------------------------------------------------------------------------
// This file runs in the AudioWorklet scope.
// It CANNOT import from other modules — everything must be self-contained.
// The TypeScript types below are for development clarity; this file is
// ultimately inlined as a JavaScript string and loaded via Blob URL.
// ---------------------------------------------------------------------------

// Ambient declarations for the AudioWorklet global scope.
// These types exist at runtime inside the worklet thread but are not part
// of the standard DOM lib shipped with TypeScript.
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: typeof AudioWorkletProcessor,
): void;

declare const sampleRate: number;

interface AudioParamDescriptor {
  name: string;
  defaultValue?: number;
  minValue?: number;
  maxValue?: number;
  automationRate?: "a-rate" | "k-rate";
}

class NoiseGateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors(): AudioParamDescriptor[] {
    return [
      { name: "threshold", defaultValue: -40, minValue: -80, maxValue: 0 },
      { name: "attack", defaultValue: 1, minValue: 0.1, maxValue: 50 },
      { name: "hold", defaultValue: 50, minValue: 0, maxValue: 500 },
      { name: "release", defaultValue: 50, minValue: 1, maxValue: 500 },
    ];
  }

  /** Gate envelope level: 0 = fully closed, 1 = fully open */
  private envelope = 0;

  /** Samples remaining in the hold phase before release begins */
  private holdCounter = 0;

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    const input = inputs[0];
    const output = outputs[0];

    // No input connected — output silence and keep alive
    if (!input || input.length === 0) {
      for (let ch = 0; ch < output.length; ch++) {
        output[ch].fill(0);
      }
      return true;
    }

    const blockSize = input[0].length;

    // Read parameters — use first value (k-rate) since these change slowly
    const thresholdDb = parameters.threshold[0];
    const attackMs = parameters.attack[0];
    const holdMs = parameters.hold[0];
    const releaseMs = parameters.release[0];

    // Compute time constants as exponential coefficients
    const attackCoeff = 1 - Math.exp(-1 / (sampleRate * (attackMs / 1000)));
    const releaseCoeff = 1 - Math.exp(-1 / (sampleRate * (releaseMs / 1000)));

    // Hold duration in samples
    const holdSamples = Math.round(sampleRate * (holdMs / 1000));

    // ---------------------------------------------------------------------------
    // Compute RMS level (dBFS) across all channels for this block
    // ---------------------------------------------------------------------------
    let sumOfSquares = 0;
    let totalSamples = 0;

    for (let ch = 0; ch < input.length; ch++) {
      const channelData = input[ch];
      for (let i = 0; i < blockSize; i++) {
        const s = channelData[i];
        sumOfSquares += s * s;
      }
      totalSamples += blockSize;
    }

    const rms = Math.sqrt(sumOfSquares / (totalSamples || 1));
    // Add tiny epsilon to avoid -Infinity from log10(0)
    const levelDb = 20 * Math.log10(rms + 1e-10);

    // ---------------------------------------------------------------------------
    // Update gate state per-sample for smooth envelope
    // ---------------------------------------------------------------------------
    const signalAboveThreshold = levelDb >= thresholdDb;

    if (signalAboveThreshold) {
      // Signal is above threshold — reset hold counter and open gate
      this.holdCounter = holdSamples;
    }

    for (let i = 0; i < blockSize; i++) {
      if (this.holdCounter > 0) {
        // Gate should be open (signal above threshold, or in hold phase)
        this.envelope += attackCoeff * (1 - this.envelope);

        // Only decrement hold counter when signal is below threshold
        if (!signalAboveThreshold) {
          this.holdCounter--;
        }
      } else {
        // Gate closing — apply release envelope
        this.envelope += releaseCoeff * (0 - this.envelope);
      }

      // Clamp envelope to [0, 1] to guard against floating-point drift
      if (this.envelope < 1e-6) this.envelope = 0;
      if (this.envelope > 1) this.envelope = 1;

      // Apply envelope gain to all channels
      for (let ch = 0; ch < input.length; ch++) {
        output[ch][i] = input[ch][i] * this.envelope;
      }
    }

    // Keep processor alive
    return true;
  }
}

registerProcessor("noise-gate", NoiseGateProcessor);
