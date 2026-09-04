import type { StationPreset } from "@/types/shack";
import type { ChainNode, FeedlineRun, StationChain } from "@/types/stationChain";

/** Lift a saved preset into the same shape Ham Shack chains already use. */
export function stationPresetToChain(preset: StationPreset): StationChain {
  const feedlineRuns: FeedlineRun[] = [];
  const nodes: ChainNode[] = [{ type: "radio", radioId: preset.radioId }];
  nodes.push(
    ...preset.accessoryIds.map(
      (accessoryId): ChainNode => ({ type: "accessory", accessoryId }),
    ),
  );
  if (preset.feedlineId) {
    const runId = `preset:${preset.id}:feedline`;
    feedlineRuns.push({
      id: runId,
      feedlineId: preset.feedlineId,
      inlineComponentIds: preset.inlineComponentIds ?? [],
    });
    nodes.push({ type: "feedline_run", feedlineRunId: runId });
  }
  nodes.push({ type: "antenna", antennaId: preset.antennaId });

  return {
    id: `preset:${preset.id}`,
    name: preset.name,
    nodes,
    feedlineRuns,
    operatingPowerWatts: preset.operatingPowerWatts,
    linkedLocationId: preset.linkedLocationId,
    shackAccessoryIds: [],
    notes: preset.notes,
    createdAt: preset.createdAt,
  };
}
