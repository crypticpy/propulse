import type { LadderState } from "@/lib/verdict/ladder";
import type { PathBandCondition } from "@/lib/utils/bands";

export type RealityCheckLabel =
  | "Confirmed"
  | "Likely"
  | "Surprise Open"
  | "Closed"
  | "Unknown";

export interface RealityCheck {
  label: RealityCheckLabel;
  detail: string;
  ladderState: LadderState | null;
  modelStatus: PathBandCondition["status"] | null;
}

/**
 * Fuse model band status with live ladder state into HelioClock-style framing.
 */
export function correlateBandReality(params: {
  modelStatus: PathBandCondition["status"] | null | undefined;
  ladderState: LadderState | null | undefined;
}): RealityCheck {
  const model = params.modelStatus ?? null;
  const ladder = params.ladderState ?? null;

  if (!model && !ladder) {
    return {
      label: "Unknown",
      detail: "Waiting for model and live activity.",
      ladderState: null,
      modelStatus: null,
    };
  }

  const modelOpen =
    model === "excellent" || model === "good" || model === "fair";
  const modelClosed = model === "closed" || model === "poor";
  const liveOpen =
    ladder === "verified" || ladder === "hot" || ladder === "stirring";
  const liveClosed = ladder === "closed";
  const liveForecast = ladder === "forecast";

  if (modelOpen && liveOpen) {
    return {
      label: "Confirmed",
      detail: `Model ${model}; live ladder ${ladder}.`,
      ladderState: ladder,
      modelStatus: model,
    };
  }

  if (modelClosed && liveOpen) {
    return {
      label: "Surprise Open",
      detail: `Model ${model ?? "closed"} but live activity is ${ladder}.`,
      ladderState: ladder,
      modelStatus: model,
    };
  }

  if (modelOpen && liveClosed) {
    return {
      label: "Likely",
      detail: `Model ${model}; live activity still quiet (${ladder}).`,
      ladderState: ladder,
      modelStatus: model,
    };
  }

  if (modelOpen && liveForecast) {
    return {
      label: "Likely",
      detail: `Model ${model}; live forecast ${ladder}.`,
      ladderState: ladder,
      modelStatus: model,
    };
  }

  if (modelClosed && (liveClosed || !ladder)) {
    return {
      label: "Closed",
      detail: `Model ${model ?? "closed"}${ladder ? `; live ${ladder}` : ""}.`,
      ladderState: ladder,
      modelStatus: model,
    };
  }

  return {
    label: "Likely",
    detail: `Model ${model ?? "n/a"}; live ${ladder ?? "n/a"}.`,
    ladderState: ladder,
    modelStatus: model,
  };
}
