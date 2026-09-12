import type { SpotSource } from "@/types/livespot";

/**
 * Color configuration for spot sources
 */
export const SPOT_SOURCE_COLORS: Record<
  SpotSource,
  { color: string; bgColor: string }
> = {
  PSKReporter: { color: "#54a0ff", bgColor: "rgba(84, 160, 255, 0.2)" },
  RBN: { color: "#1dd1a1", bgColor: "rgba(29, 209, 161, 0.2)" },
  Cluster: { color: "#ff9f43", bgColor: "rgba(255, 159, 67, 0.2)" },
  "WSJT-X": { color: "#22d3ee", bgColor: "rgba(34, 211, 238, 0.15)" },
};
