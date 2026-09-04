import type { AntennaType } from "@/lib/data/antennas";
import type { StationInventory } from "@/lib/station/stationChainEngine";
import type { StationChain } from "@/types/stationChain";

export interface ResolvedChainKit {
  chainId: string;
  chainName: string;
  radioId?: string;
  antennaId?: string;
  feedlineId?: string;
  radioLabel: string;
  antennaLabel: string;
  feedlineLabel?: string;
  powerWatts: number;
  antennaType?: AntennaType;
  antennaHeightMeters?: number;
  radioPhotoId?: string;
  antennaPhotoId?: string;
}

export function formatStationLine(input: {
  radioLabel?: string;
  antennaLabel?: string;
  heightMeters?: number;
  powerWatts?: number;
}): string {
  const parts: string[] = [];
  if (input.radioLabel) parts.push(input.radioLabel);
  if (input.antennaLabel) {
    const height =
      input.heightMeters != null && Number.isFinite(input.heightMeters)
        ? ` @ ${Math.round(input.heightMeters)} m`
        : "";
    parts.push(`${input.antennaLabel}${height}`);
  }
  if (input.powerWatts != null && Number.isFinite(input.powerWatts)) {
    parts.push(`${Math.round(input.powerWatts)} W`);
  }
  return parts.join(" · ");
}

export function resolveChainKit(
  chain: StationChain | null | undefined,
  inventory: StationInventory,
): ResolvedChainKit | null {
  if (!chain) return null;

  const radioNode = chain.nodes.find((node) => node.type === "radio");
  const antennaNode = chain.nodes.find((node) => node.type === "antenna");
  const feedlineNode = chain.nodes.find((node) => node.type === "feedline_run");

  const radioId = radioNode?.type === "radio" ? radioNode.radioId : undefined;
  const antennaId =
    antennaNode?.type === "antenna" ? antennaNode.antennaId : undefined;
  const feedlineRunId =
    feedlineNode?.type === "feedline_run"
      ? feedlineNode.feedlineRunId
      : undefined;
  const feedlineId = feedlineRunId
    ? chain.feedlineRuns.find((run) => run.id === feedlineRunId)?.feedlineId
    : undefined;

  const radio = radioId
    ? inventory.radios.find((entry) => entry.userRadio.id === radioId)
    : undefined;
  const antenna = antennaId
    ? inventory.antennas.find((item) => item.id === antennaId)
    : undefined;
  const feedline = feedlineId
    ? inventory.feedlines.find((item) => item.id === feedlineId)
    : undefined;

  const radioLabel = radio
    ? (radio.userRadio.nickname ??
      radio.equipment?.displayName ??
      (radio.equipment
        ? `${radio.equipment.manufacturer} ${radio.equipment.model}`
        : "Radio"))
    : "Radio";

  return {
    chainId: chain.id,
    chainName: chain.name,
    radioId,
    antennaId,
    feedlineId,
    radioLabel,
    antennaLabel: antenna?.name ?? "Antenna",
    feedlineLabel: feedline?.name,
    powerWatts: chain.operatingPowerWatts,
    antennaType: antenna?.gainPatternType,
    antennaHeightMeters: antenna?.heightMeters,
    radioPhotoId: radio?.userRadio.imageId,
    antennaPhotoId: antenna?.imageId,
  };
}

export function isFieldActivationSig(mySig?: string | null): boolean {
  const sig = (mySig ?? "").toUpperCase();
  return sig === "POTA" || sig === "SOTA" || sig === "WWFF" || sig === "WWBOTA";
}

export function pickChainForActivation(
  chains: StationChain[],
  activeChainId: string | null,
  mySig?: string | null,
): string | null {
  if (!isFieldActivationSig(mySig)) {
    return activeChainId;
  }
  const fieldKit = chains.find((chain) =>
    /pota|sota|field|portable|pack/i.test(chain.name),
  );
  return fieldKit?.id ?? activeChainId;
}
