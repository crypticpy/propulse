// ---------------------------------------------------------------------------
// spectralNr — Wrapper for the SpectralNrProcessor AudioWorklet
// ---------------------------------------------------------------------------
// Creates and manages AudioWorkletNodes that perform spectral subtraction
// noise reduction.  The processor code is loaded from the inlined string
// constant in spectralNrProcessor.ts and registered via a Blob URL.
// ---------------------------------------------------------------------------

import { SPECTRAL_NR_PROCESSOR_CODE } from "./spectralNrProcessor";

let registered = false;
let registrationPromise: Promise<void> | null = null;

export interface SpectralNrParams {
  /** Noise reduction aggressiveness (0 = off, 1-3 mild, 4-6 moderate, 7-10 aggressive) */
  nrLevel: number;
  /** Noise floor adaptation speed (lower = more stable, higher = faster tracking) */
  adaptRate: number;
}

const DEFAULT_PARAMS: SpectralNrParams = {
  nrLevel: 3,
  adaptRate: 0.01,
};

/**
 * Create an AudioWorkletNode running the spectral subtraction NR processor.
 *
 * On first call the processor module is registered with the AudioContext via
 * a Blob URL (the code is fully inlined — no external file needed).
 *
 * @param ctx       The AudioContext to use.
 * @param params    Optional initial parameter overrides.
 * @returns         A connected AudioWorkletNode.
 */
export async function createSpectralNrNode(
  ctx: AudioContext,
  params?: Partial<SpectralNrParams>,
): Promise<AudioWorkletNode> {
  if (!registered) {
    if (registrationPromise) {
      await registrationPromise;
    } else {
      registrationPromise = (async () => {
        const blob = new Blob([SPECTRAL_NR_PROCESSOR_CODE], {
          type: "application/javascript",
        });
        const url = URL.createObjectURL(blob);
        try {
          await ctx.audioWorklet.addModule(url);
        } finally {
          URL.revokeObjectURL(url);
        }
        registered = true;
      })();
      await registrationPromise;
    }
  }

  const node = new AudioWorkletNode(ctx, "spectral-nr");

  // Apply initial parameters
  const merged = { ...DEFAULT_PARAMS, ...params };
  updateSpectralNrParams(node, merged);

  return node;
}

/**
 * Update parameters on a live spectral NR node.
 *
 * @param node    The AudioWorkletNode returned by createSpectralNrNode.
 * @param params  Partial set of parameters to update.
 */
export function updateSpectralNrParams(
  node: AudioWorkletNode,
  params: Partial<SpectralNrParams>,
): void {
  if (params.nrLevel !== undefined) {
    const nrParam = node.parameters.get("nrLevel");
    if (nrParam) {
      nrParam.setValueAtTime(Math.max(0, Math.min(10, params.nrLevel)), 0);
    }
  }

  if (params.adaptRate !== undefined) {
    const adaptParam = node.parameters.get("adaptRate");
    if (adaptParam) {
      adaptParam.setValueAtTime(
        Math.max(0.001, Math.min(0.1, params.adaptRate)),
        0,
      );
    }
  }
}
