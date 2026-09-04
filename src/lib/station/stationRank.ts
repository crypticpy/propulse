import type { StationQsoIndex } from "@/hooks/useStationQsoIndex";

export interface StationRankInventory {
  radioIds: string[];
  antennaIds: string[];
  feedlineIds: string[];
  accessoryIds: string[];
  inlineIds: string[];
  chainIds: string[];
}

/**
 * Rank credit for shack gear. Until any QSO is stamped with chain/radio/antenna
 * FKs, keep legacy inventory counts so existing logs do not cliff. After the
 * first stamp, credit only QSO-linked radios, antennas, and chains.
 */
export function stationRankCredit(
  inventory: StationRankInventory,
  index: Pick<StationQsoIndex, "qsoCountById" | "stampedQsoCount">,
): { equipmentCount: number; signalPathCount: number } {
  const inventoryEquipment =
    inventory.radioIds.length +
    inventory.antennaIds.length +
    inventory.feedlineIds.length +
    inventory.accessoryIds.length +
    inventory.inlineIds.length;
  const inventoryPaths = inventory.chainIds.length;

  if (index.stampedQsoCount === 0) {
    return {
      equipmentCount: inventoryEquipment,
      signalPathCount: inventoryPaths,
    };
  }

  const creditedRadios = inventory.radioIds.filter(
    (id) => (index.qsoCountById[id] ?? 0) > 0,
  ).length;
  const creditedAntennas = inventory.antennaIds.filter(
    (id) => (index.qsoCountById[id] ?? 0) > 0,
  ).length;
  const creditedChains = inventory.chainIds.filter(
    (id) => (index.qsoCountById[id] ?? 0) > 0,
  ).length;

  return {
    equipmentCount:
      creditedRadios +
      creditedAntennas +
      inventory.feedlineIds.length +
      inventory.accessoryIds.length +
      inventory.inlineIds.length,
    signalPathCount: creditedChains,
  };
}
