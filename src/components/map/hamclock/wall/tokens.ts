import type { LadderState } from "@/lib/verdict/ladder";

/**
 * Wall vocabulary for the Band Health ladder. The desk layout uses the longer
 * `LADDER_LABEL` strings; a wall tile read from ten feet needs one short word.
 */
export const LADDER_WALL_LABEL: Record<LadderState, string> = {
  hot: "HOT",
  verified: "OPEN",
  stirring: "RISING",
  forecast: "MARGINAL",
  closed: "CLOSED",
};

/** Ladder state → wall text class (theme tokens, never Tailwind colours). */
export const LADDER_WALL_CLASS: Record<LadderState, string> = {
  hot: "hc-good",
  verified: "hc-good",
  stirring: "hc-warn",
  forecast: "hc-dim-text",
  closed: "hc-dim-text",
};

/** Ladder state → the tile's top state-bar colour. */
export const LADDER_WALL_STATE: Record<LadderState, string> = {
  hot: "var(--hc-good)",
  verified: "var(--hc-good)",
  stirring: "var(--hc-warn)",
  forecast: "var(--hc-dim2)",
  closed: "var(--hc-dim2)",
};
