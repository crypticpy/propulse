// ---------------------------------------------------------------------------
// noiseGate — Wrapper for the noise-gate AudioWorkletProcessor
// ---------------------------------------------------------------------------
// Registers the worklet from an inlined Blob URL (avoids Vite module issues)
// and provides helpers to create / update noise gate AudioWorkletNodes.
// ---------------------------------------------------------------------------

let registered = false;
let registrationPromise: Promise<void> | null = null;

export interface NoiseGateParams {
  /** Gate threshold in dBFS (default -40, range -80 to 0) */
  threshold: number;
  /** Attack time in ms — how fast the gate opens (default 1, range 0.1 to 50) */
  attack: number;
  /** Hold time in ms — how long gate stays open after signal drops (default 50, range 0 to 500) */
  hold: number;
  /** Release time in ms — how fast the gate closes (default 50, range 1 to 500) */
  release: number;
}

// ---------------------------------------------------------------------------
// Inlined AudioWorkletProcessor source
// ---------------------------------------------------------------------------
// This string is the JavaScript equivalent of noiseGateProcessor.ts.
// It must be kept in sync with the processor file. We inline it to avoid
// Vite/Rollup module resolution issues with AudioWorklet addModule().
// ---------------------------------------------------------------------------

const PROCESSOR_SOURCE = /* js */ `
class NoiseGateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "threshold", defaultValue: -40, minValue: -80, maxValue: 0 },
      { name: "attack", defaultValue: 1, minValue: 0.1, maxValue: 50 },
      { name: "hold", defaultValue: 50, minValue: 0, maxValue: 500 },
      { name: "release", defaultValue: 50, minValue: 1, maxValue: 500 },
    ];
  }

  constructor() {
    super();
    this.envelope = 0;
    this.holdCounter = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || input.length === 0) {
      for (let ch = 0; ch < output.length; ch++) {
        output[ch].fill(0);
      }
      return true;
    }

    const blockSize = input[0].length;
    const thresholdDb = parameters.threshold[0];
    const attackMs = parameters.attack[0];
    const holdMs = parameters.hold[0];
    const releaseMs = parameters.release[0];

    const attackCoeff = 1 - Math.exp(-1 / (sampleRate * (attackMs / 1000)));
    const releaseCoeff = 1 - Math.exp(-1 / (sampleRate * (releaseMs / 1000)));
    const holdSamples = Math.round(sampleRate * (holdMs / 1000));

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
    const levelDb = 20 * Math.log10(rms + 1e-10);
    const signalAboveThreshold = levelDb >= thresholdDb;

    if (signalAboveThreshold) {
      this.holdCounter = holdSamples;
    }

    for (let i = 0; i < blockSize; i++) {
      if (this.holdCounter > 0) {
        this.envelope += attackCoeff * (1 - this.envelope);
        if (!signalAboveThreshold) {
          this.holdCounter--;
        }
      } else {
        this.envelope += releaseCoeff * (0 - this.envelope);
      }

      if (this.envelope < 1e-6) this.envelope = 0;
      if (this.envelope > 1) this.envelope = 1;

      for (let ch = 0; ch < input.length; ch++) {
        output[ch][i] = input[ch][i] * this.envelope;
      }
    }

    return true;
  }
}

registerProcessor("noise-gate", NoiseGateProcessor);
`;

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

async function ensureRegistered(ctx: AudioContext): Promise<void> {
  if (registered) return;

  // Guard: AudioWorklet must be available
  if (!ctx.audioWorklet || typeof ctx.audioWorklet.addModule !== "function") {
    throw new Error(
      "AudioWorklet is not supported in this browser. " +
        "A modern browser (Chrome 66+, Firefox 76+, Safari 14.1+) is required for the noise gate.",
    );
  }

  // Prevent duplicate registration if called concurrently
  if (registrationPromise) {
    await registrationPromise;
    return;
  }

  const blob = new Blob([PROCESSOR_SOURCE], {
    type: "application/javascript",
  });
  const blobUrl = URL.createObjectURL(blob);

  registrationPromise = ctx.audioWorklet
    .addModule(blobUrl)
    .then(() => {
      registered = true;
    })
    .finally(() => {
      URL.revokeObjectURL(blobUrl);
      registrationPromise = null;
    });

  await registrationPromise;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a noise-gate AudioWorkletNode.
 *
 * Registers the worklet processor on first call (idempotent).
 * The returned node can be connected into any Web Audio graph.
 */
export async function createNoiseGateNode(
  ctx: AudioContext,
  params?: Partial<NoiseGateParams>,
): Promise<AudioWorkletNode> {
  await ensureRegistered(ctx);

  const node = new AudioWorkletNode(ctx, "noise-gate");

  // Apply initial parameter overrides
  if (params?.threshold !== undefined) {
    node.parameters.get("threshold")!.value = params.threshold;
  }
  if (params?.attack !== undefined) {
    node.parameters.get("attack")!.value = params.attack;
  }
  if (params?.hold !== undefined) {
    node.parameters.get("hold")!.value = params.hold;
  }
  if (params?.release !== undefined) {
    node.parameters.get("release")!.value = params.release;
  }

  return node;
}

/**
 * Update one or more parameters on an existing noise-gate AudioWorkletNode.
 * Changes take effect immediately (k-rate).
 */
export function updateNoiseGateParams(
  node: AudioWorkletNode,
  params: Partial<NoiseGateParams>,
): void {
  if (params.threshold !== undefined) {
    node.parameters.get("threshold")!.value = params.threshold;
  }
  if (params.attack !== undefined) {
    node.parameters.get("attack")!.value = params.attack;
  }
  if (params.hold !== undefined) {
    node.parameters.get("hold")!.value = params.hold;
  }
  if (params.release !== undefined) {
    node.parameters.get("release")!.value = params.release;
  }
}
