// ---------------------------------------------------------------------------
// expander — Wrapper for the ExpanderProcessor AudioWorklet
// ---------------------------------------------------------------------------
// Downward expander used for noise reduction and speech cleanup.
// ---------------------------------------------------------------------------

import { EXPANDER_PROCESSOR_CODE } from "./expanderProcessor";

let registered = false;
let registrationPromise: Promise<void> | null = null;

export interface ExpanderParams {
  /** Threshold in dBFS (default -45, range -80 to 0). */
  threshold: number;
  /** Expansion ratio (1 = off, 2-4 typical, up to 10). */
  ratio: number;
  /** Attack time in ms (default 5). */
  attack: number;
  /** Release time in ms (default 80). */
  release: number;
  /** Maximum attenuation below threshold (0-60 dB). */
  rangeDb: number;
}

const DEFAULT_PARAMS: ExpanderParams = {
  threshold: -45,
  ratio: 2,
  attack: 5,
  release: 80,
  rangeDb: 30,
};

async function ensureRegistered(ctx: AudioContext): Promise<void> {
  if (registered) return;

  if (!ctx.audioWorklet || typeof ctx.audioWorklet.addModule !== "function") {
    throw new Error(
      "AudioWorklet is not supported in this browser. " +
        "A modern browser is required for the expander.",
    );
  }

  if (registrationPromise) {
    await registrationPromise;
    return;
  }

  registrationPromise = (async () => {
    const blob = new Blob([EXPANDER_PROCESSOR_CODE], {
      type: "application/javascript",
    });
    const url = URL.createObjectURL(blob);
    try {
      await ctx.audioWorklet.addModule(url);
      registered = true;
    } finally {
      URL.revokeObjectURL(url);
      registrationPromise = null;
    }
  })();

  await registrationPromise;
}

export async function createExpanderNode(
  ctx: AudioContext,
  params?: Partial<ExpanderParams>,
): Promise<AudioWorkletNode> {
  await ensureRegistered(ctx);

  const node = new AudioWorkletNode(ctx, "expander");
  updateExpanderParams(node, { ...DEFAULT_PARAMS, ...params });
  return node;
}

export function updateExpanderParams(
  node: AudioWorkletNode,
  params: Partial<ExpanderParams>,
): void {
  if (params.threshold !== undefined) {
    node.parameters.get("threshold")!.value = params.threshold;
  }
  if (params.ratio !== undefined) {
    node.parameters.get("ratio")!.value = params.ratio;
  }
  if (params.attack !== undefined) {
    node.parameters.get("attack")!.value = params.attack;
  }
  if (params.release !== undefined) {
    node.parameters.get("release")!.value = params.release;
  }
  if (params.rangeDb !== undefined) {
    node.parameters.get("rangeDb")!.value = params.rangeDb;
  }
}

