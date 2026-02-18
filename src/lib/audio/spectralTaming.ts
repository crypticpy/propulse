// ---------------------------------------------------------------------------
// spectralTaming — Wrapper for the SpectralTamingProcessor AudioWorklet
// ---------------------------------------------------------------------------
// Gullfoss/DSEEQ-inspired intelligent dynamic EQ that automatically tames
// spectral resonances and boosts deficient frequencies for ham radio audio.
// ---------------------------------------------------------------------------

import { SPECTRAL_TAMING_PROCESSOR_CODE } from "./spectralTamingProcessor";

let registeredCtx: AudioContext | null = null;
let registrationPromise: Promise<void> | null = null;

export interface SpectralTamingParams {
  /** How aggressively to tame resonances (0-1, default 0.5) */
  tameAmount: number;
  /** How aggressively to boost deficient frequencies (0-1, default 0.3) */
  recoverAmount: number;
  /** Envelope tracking speed (0.005-0.2, default 0.03) */
  speed: number;
}

const DEFAULT_PARAMS: SpectralTamingParams = {
  tameAmount: 0.5,
  recoverAmount: 0.3,
  speed: 0.03,
};

async function ensureRegistered(ctx: AudioContext): Promise<void> {
  if (registeredCtx === ctx) return;

  if (!ctx.audioWorklet || typeof ctx.audioWorklet.addModule !== "function") {
    throw new Error(
      "AudioWorklet is not supported in this browser. " +
        "A modern browser is required for spectral taming.",
    );
  }

  if (registrationPromise) {
    await registrationPromise;
    return;
  }

  registrationPromise = (async () => {
    const blob = new Blob([SPECTRAL_TAMING_PROCESSOR_CODE], {
      type: "application/javascript",
    });
    const url = URL.createObjectURL(blob);
    try {
      await ctx.audioWorklet.addModule(url);
      registeredCtx = ctx;
    } finally {
      URL.revokeObjectURL(url);
      registrationPromise = null;
    }
  })();

  await registrationPromise;
}

export async function createSpectralTamingNode(
  ctx: AudioContext,
  params?: Partial<SpectralTamingParams>,
): Promise<AudioWorkletNode> {
  await ensureRegistered(ctx);

  const node = new AudioWorkletNode(ctx, "spectral-taming");
  updateSpectralTamingParams(node, { ...DEFAULT_PARAMS, ...params });
  return node;
}

export function updateSpectralTamingParams(
  node: AudioWorkletNode,
  params: Partial<SpectralTamingParams>,
): void {
  if (params.tameAmount !== undefined) {
    node.parameters.get("tameAmount")!.value = params.tameAmount;
  }
  if (params.recoverAmount !== undefined) {
    node.parameters.get("recoverAmount")!.value = params.recoverAmount;
  }
  if (params.speed !== undefined) {
    node.parameters.get("speed")!.value = params.speed;
  }
}
