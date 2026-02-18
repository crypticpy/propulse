// ---------------------------------------------------------------------------
// psychoacousticLeveler — Wrapper for the PsychoacousticLevelerProcessor AudioWorklet
// ---------------------------------------------------------------------------
// Maintains consistent perceived loudness using A-weighted measurement and
// gentle automatic gain control with a hard limiter.
// ---------------------------------------------------------------------------

import { PSYCHOACOUSTIC_LEVELER_PROCESSOR_CODE } from "./psychoacousticLevelerProcessor";

let registeredCtx: AudioContext | null = null;
let registrationPromise: Promise<void> | null = null;

export interface PsychoacousticLevelerParams {
  /** Target perceived loudness in dBFS (-40 to -6, default -20) */
  targetLevel: number;
  /** Gain adjustment speed (0.005-0.2, default 0.03) */
  speed: number;
  /** Maximum gain change in dB (0-24, default 12) */
  maxGainDb: number;
}

const DEFAULT_PARAMS: PsychoacousticLevelerParams = {
  targetLevel: -20,
  speed: 0.03,
  maxGainDb: 12,
};

async function ensureRegistered(ctx: AudioContext): Promise<void> {
  if (registeredCtx === ctx) return;

  if (!ctx.audioWorklet || typeof ctx.audioWorklet.addModule !== "function") {
    throw new Error(
      "AudioWorklet is not supported in this browser. " +
        "A modern browser is required for the psychoacoustic leveler.",
    );
  }

  if (registrationPromise) {
    await registrationPromise;
    return;
  }

  registrationPromise = (async () => {
    const blob = new Blob([PSYCHOACOUSTIC_LEVELER_PROCESSOR_CODE], {
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

export async function createPsychoacousticLevelerNode(
  ctx: AudioContext,
  params?: Partial<PsychoacousticLevelerParams>,
): Promise<AudioWorkletNode> {
  await ensureRegistered(ctx);

  const node = new AudioWorkletNode(ctx, "psychoacoustic-leveler");
  updatePsychoacousticLevelerParams(node, { ...DEFAULT_PARAMS, ...params });
  return node;
}

export function updatePsychoacousticLevelerParams(
  node: AudioWorkletNode,
  params: Partial<PsychoacousticLevelerParams>,
): void {
  if (params.targetLevel !== undefined) {
    node.parameters.get("targetLevel")!.value = params.targetLevel;
  }
  if (params.speed !== undefined) {
    node.parameters.get("speed")!.value = params.speed;
  }
  if (params.maxGainDb !== undefined) {
    node.parameters.get("maxGainDb")!.value = params.maxGainDb;
  }
}
