import type { BandChainPerformance } from "@/lib/station/stationChainEngine";
import type { LogEntry } from "@/lib/db/types";
import {
  formatStationLine,
  type ResolvedChainKit,
} from "@/lib/station/stationKit";

export {
  formatStationLine,
  isFieldActivationSig,
  pickChainForActivation,
  resolveChainKit,
  type ResolvedChainKit,
} from "@/lib/station/stationKit";

export interface QsoStationStamp {
  chainId?: string;
  radioId?: string;
  antennaId?: string;
  txPower?: number;
  myRig?: string;
  myAntenna?: string;
  myGrid?: string;
}

export interface PublicEquipmentSummary {
  chainId?: string;
  chainName?: string;
  radioName?: string;
  antennaName?: string;
  antennaType?: string;
  powerWatts?: number;
  erp20m?: number;
  erp40m?: number;
  stationLine: string;
  radioPhotoId?: string;
  antennaPhotoId?: string;
  radioId?: string;
  antennaId?: string;
  nodes?: Array<{ type: "radio" | "feedline" | "antenna"; label: string }>;
}

export function buildQsoStationStamp(
  kit: ResolvedChainKit | null,
  myGrid?: string,
  powerOverride?: number | null,
): QsoStationStamp {
  if (!kit) {
    return {
      txPower: powerOverride ?? undefined,
      myGrid: myGrid || undefined,
    };
  }
  return {
    chainId: kit.chainId,
    radioId: kit.radioId,
    antennaId: kit.antennaId,
    txPower: powerOverride ?? kit.powerWatts,
    myRig: kit.radioLabel,
    myAntenna: kit.antennaLabel,
    myGrid: myGrid || undefined,
  };
}

export function buildPublicEquipmentSummary(
  kit: ResolvedChainKit | null,
  bands: BandChainPerformance[],
): PublicEquipmentSummary {
  const erp20m = bands.find((band) => band.band === "20m")?.erpWatts;
  const erp40m = bands.find((band) => band.band === "40m")?.erpWatts;
  return {
    chainId: kit?.chainId,
    chainName: kit?.chainName,
    radioName: kit?.radioLabel,
    antennaName: kit?.antennaLabel,
    antennaType: kit?.antennaType,
    powerWatts: kit?.powerWatts,
    erp20m,
    erp40m,
    stationLine: kit
      ? formatStationLine({
          radioLabel: kit.radioLabel,
          antennaLabel: kit.antennaLabel,
          heightMeters: kit.antennaHeightMeters,
          powerWatts: kit.powerWatts,
        })
      : "",
    radioPhotoId: kit?.radioPhotoId,
    antennaPhotoId: kit?.antennaPhotoId,
    radioId: kit?.radioId,
    antennaId: kit?.antennaId,
    nodes: kit
      ? [
          { type: "radio" as const, label: kit.radioLabel },
          ...(kit.feedlineLabel
            ? [{ type: "feedline" as const, label: kit.feedlineLabel }]
            : []),
          { type: "antenna" as const, label: kit.antennaLabel },
        ]
      : [],
  };
}

export function parsePublicEquipmentSummary(
  raw: unknown,
): PublicEquipmentSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const stationLine =
    typeof value.stationLine === "string" ? value.stationLine : "";
  if (!stationLine && !value.radioName && !value.antennaName) return null;
  return {
    chainId: typeof value.chainId === "string" ? value.chainId : undefined,
    chainName: typeof value.chainName === "string" ? value.chainName : undefined,
    radioName: typeof value.radioName === "string" ? value.radioName : undefined,
    antennaName:
      typeof value.antennaName === "string" ? value.antennaName : undefined,
    antennaType:
      typeof value.antennaType === "string" ? value.antennaType : undefined,
    powerWatts:
      typeof value.powerWatts === "number" ? value.powerWatts : undefined,
    erp20m: typeof value.erp20m === "number" ? value.erp20m : undefined,
    erp40m: typeof value.erp40m === "number" ? value.erp40m : undefined,
    stationLine,
    radioPhotoId:
      typeof value.radioPhotoId === "string" ? value.radioPhotoId : undefined,
    antennaPhotoId:
      typeof value.antennaPhotoId === "string"
        ? value.antennaPhotoId
        : undefined,
    radioId: typeof value.radioId === "string" ? value.radioId : undefined,
    antennaId:
      typeof value.antennaId === "string" ? value.antennaId : undefined,
    nodes: Array.isArray(value.nodes)
      ? value.nodes.flatMap((node) => {
          if (!node || typeof node !== "object") return [];
          const item = node as Record<string, unknown>;
          if (
            (item.type === "radio" ||
              item.type === "feedline" ||
              item.type === "antenna") &&
            typeof item.label === "string"
          ) {
            return [
              {
                type: item.type,
                label: item.label,
              },
            ];
          }
          return [];
        })
      : undefined,
  };
}

export function countQsOsForEquipment(
  entries: Array<Pick<LogEntry, "radioId" | "antennaId" | "chainId">>,
  ids: { radioId?: string; antennaId?: string; chainId?: string },
): number {
  return entries.filter((entry) => {
    if (ids.radioId && entry.radioId === ids.radioId) return true;
    if (ids.antennaId && entry.antennaId === ids.antennaId) return true;
    if (ids.chainId && entry.chainId === ids.chainId) return true;
    return false;
  }).length;
}

export function chainsWithQsOs(
  entries: Array<Pick<LogEntry, "chainId">>,
  chainIds: string[],
): number {
  const used = new Set(
    entries.map((entry) => entry.chainId).filter((id): id is string => !!id),
  );
  return chainIds.filter((id) => used.has(id)).length;
}

export function dualEnvelopeCopy(
  ourErpWatts: number | undefined,
  theirs: PublicEquipmentSummary | null | undefined,
  band: string,
): string | null {
  if (ourErpWatts == null || !Number.isFinite(ourErpWatts)) return null;
  const theirErp = band === "40m" ? theirs?.erp40m : theirs?.erp20m;
  const ourLine = `your ${Math.round(ourErpWatts)} W ERP`;
  if (theirErp == null || !Number.isFinite(theirErp)) {
    return `${ourLine} on ${band}`;
  }
  const theirKit = theirs?.antennaName ?? "their station";
  return `${ourLine} vs their ${Math.round(theirErp)} W ${theirKit} — ${band} is the overlap`;
}

/**
 * Fold far-end public ERP into the combined path antennaGainDbi.
 * Assumption: erp20m/erp40m are equivalent isotropic radiated power at the
 * far end vs a 100 W / 0 dBi reference. 40m uses erp40m; every other band
 * scales from erp20m (same dB offset). Missing ERP adds 0 dB (our envelope only).
 */
export function farEndGainDbiFromPublicErp(
  theirs: PublicEquipmentSummary | null | undefined,
  band: string,
): number {
  const theirErp = band === "40m" ? theirs?.erp40m : theirs?.erp20m;
  if (theirErp == null || !Number.isFinite(theirErp) || theirErp <= 0) {
    return 0;
  }
  return 10 * Math.log10(theirErp / 100);
}
