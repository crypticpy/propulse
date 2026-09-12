import type { RadioEquipment, UserRadio } from "@/types/radio";
import {
  ACCESSORY_CATEGORY_LABELS,
  ANTENNA_TYPE_LABELS,
  FEEDLINE_TYPE_LABELS,
  type InlineComponent,
  type UserAccessory,
  type UserAntenna,
  type UserFeedline,
} from "@/types/shack";
import type {
  ChainNode,
  FeedlineRun,
  StationChain,
} from "@/types/stationChain";

export interface StationChainNodeLabel {
  label: string;
  subLabel?: string;
}

/**
 * Equipment lookups the builder and schematic both already have on hand.
 * Structural so hook return values pass through without mapping.
 */
export interface StationChainLabelCatalogs {
  radios: Array<{
    userRadio: Pick<UserRadio, "id" | "nickname">;
    equipment?: Pick<RadioEquipment, "displayName" | "manufacturer" | "model">;
  }>;
  accessories: Array<Pick<UserAccessory, "id" | "name" | "category">>;
  antennas: Array<Pick<UserAntenna, "id" | "name" | "antennaType">>;
  feedlines: Array<
    Pick<UserFeedline, "id" | "name" | "feedlineType" | "lengthFeet">
  >;
}

export interface FeedlineRunInlineLabels {
  inlineLabels: Array<{ id: string; name: string; lossDb: number }>;
  totalLossDb: number;
}

export function deriveStationChainNodeLabel(
  node: ChainNode,
  chain: Pick<StationChain, "feedlineRuns" | "operatingPowerWatts">,
  catalogs: StationChainLabelCatalogs,
): StationChainNodeLabel {
  let label = "Unknown";
  let subLabel: string | undefined;

  switch (node.type) {
    case "radio": {
      const radioEntry = catalogs.radios.find(
        (r) => r.userRadio.id === node.radioId,
      );
      if (radioEntry?.equipment) {
        label =
          radioEntry.equipment.displayName ??
          `${radioEntry.equipment.manufacturer} ${radioEntry.equipment.model}`;
      }
      if (radioEntry?.userRadio.nickname) {
        label = radioEntry.userRadio.nickname;
      }
      subLabel = `${chain.operatingPowerWatts}W`;
      break;
    }
    case "accessory": {
      const acc = catalogs.accessories.find((a) => a.id === node.accessoryId);
      if (acc) {
        label = acc.name;
        subLabel = ACCESSORY_CATEGORY_LABELS[acc.category];
      }
      break;
    }
    case "feedline_run": {
      const run = chain.feedlineRuns.find((r) => r.id === node.feedlineRunId);
      if (run) {
        const fl = catalogs.feedlines.find((f) => f.id === run.feedlineId);
        if (fl) {
          label = fl.name;
          subLabel = `${FEEDLINE_TYPE_LABELS[fl.feedlineType]}, ${fl.lengthFeet} ft`;
        }
      }
      break;
    }
    case "antenna": {
      const ant = catalogs.antennas.find((a) => a.id === node.antennaId);
      if (ant) {
        label = ant.name;
        subLabel = ANTENNA_TYPE_LABELS[ant.antennaType];
      }
      break;
    }
  }

  return { label, subLabel };
}

export function deriveStationChainNodeLabels(
  chain: StationChain,
  catalogs: StationChainLabelCatalogs,
): StationChainNodeLabel[] {
  return chain.nodes.map((node) =>
    deriveStationChainNodeLabel(node, chain, catalogs),
  );
}

/** Inline-component names and summed loss for each feedline run on a chain. */
export function deriveFeedlineRunInlineLabels(
  feedlineRuns: FeedlineRun[],
  inlineComponents: Array<
    Pick<InlineComponent, "id" | "name" | "insertionLossDb">
  >,
): Map<string, FeedlineRunInlineLabels> {
  const map = new Map<string, FeedlineRunInlineLabels>();

  for (const run of feedlineRuns) {
    const runInlines = run.inlineComponentIds
      .map((cid) => inlineComponents.find((c) => c.id === cid))
      .filter(Boolean)
      .map((c) => ({
        id: c!.id,
        name: c!.name,
        lossDb: c!.insertionLossDb ?? 0,
      }));

    const totalLossDb = runInlines.reduce((sum, il) => sum + il.lossDb, 0);
    map.set(run.id, { inlineLabels: runInlines, totalLossDb });
  }

  return map;
}
