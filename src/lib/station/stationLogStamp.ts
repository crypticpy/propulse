import { getRadioById } from "@/lib/data/radios";
import { stationPresetToChain } from "@/lib/station/stationPresetToChain";
import { useProfileStore } from "@/stores/profileStore";
import { useShackStore } from "@/stores/shackStore";
import type { RadioEquipment, UserRadio } from "@/types/radio";
import type {
  InlineComponent,
  StationPreset,
  UserAccessory,
  UserAntenna,
  UserFeedline,
} from "@/types/shack";
import type { StationChain } from "@/types/stationChain";
import type { UserStation } from "@/types/user";

/**
 * Fields stamped onto a log entry from the active Ham Shack chain.
 * Ham Shack owns the inventory; PropSphere/logger only reads it.
 */
export interface StationLogStamp {
  stationCallsign?: string;
  myGrid?: string;
  myRig?: string;
  myAntenna?: string;
  txPower?: number;
  stationLine: string;
}

export interface StationStampSource {
  radios: UserRadio[];
  customRadios: RadioEquipment[];
  activeRadioId: string | null;
  antennas: UserAntenna[];
  feedlines: UserFeedline[];
  accessories: UserAccessory[];
  inlineComponents: InlineComponent[];
  stationPresets: StationPreset[];
  activePresetId: string | null;
  stationChains: StationChain[];
  activeChainId: string | null;
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

function resolveRadioEquipment(
  equipmentId: string,
  customRadios: RadioEquipment[],
): RadioEquipment | undefined {
  return customRadios.find((radio) => radio.id === equipmentId) ?? getRadioById(equipmentId);
}

function radioLabel(
  userRadio: UserRadio | undefined,
  equipment: RadioEquipment | undefined,
): string | undefined {
  if (!userRadio && !equipment) return undefined;
  return (
    userRadio?.nickname ||
    equipment?.displayName ||
    (equipment ? `${equipment.manufacturer} ${equipment.model}` : undefined)
  );
}

interface ResolvedInventory {
  radios: Array<{ userRadio: UserRadio; equipment: RadioEquipment | undefined }>;
  antennas: UserAntenna[];
}

function inventoryFromShack(shack: StationStampSource): ResolvedInventory {
  return {
    radios: shack.radios.map((userRadio) => ({
      userRadio,
      equipment: resolveRadioEquipment(userRadio.equipmentId, shack.customRadios),
    })),
    antennas: shack.antennas,
  };
}

export function resolveOperatingChain(
  shack: StationStampSource,
): StationChain | null {
  if (shack.activeChainId) {
    const chain = shack.stationChains.find((item) => item.id === shack.activeChainId);
    if (chain) return chain;
  }
  if (shack.activePresetId) {
    const preset = shack.stationPresets.find((item) => item.id === shack.activePresetId);
    if (preset) return stationPresetToChain(preset);
  }
  return null;
}

export function resolveStationLogStamp(
  shack: StationStampSource,
  station: UserStation | null | undefined,
  options: { powerOverride?: number | null } = {},
): StationLogStamp {
  const inventory = inventoryFromShack(shack);
  const chain = resolveOperatingChain(shack);

  const radioNode = chain?.nodes.find((node) => node.type === "radio");
  const antennaNode = chain?.nodes.find((node) => node.type === "antenna");
  const radioId = radioNode?.type === "radio" ? radioNode.radioId : shack.activeRadioId;
  const antennaId = antennaNode?.type === "antenna" ? antennaNode.antennaId : undefined;

  const resolvedRadio = radioId
    ? inventory.radios.find((entry) => entry.userRadio.id === radioId)
    : undefined;
  const antenna = antennaId
    ? inventory.antennas.find((item) => item.id === antennaId)
    : undefined;

  const myRig = radioLabel(resolvedRadio?.userRadio, resolvedRadio?.equipment);
  const myAntenna = antenna?.name;
  const txPower =
    options.powerOverride ??
    chain?.operatingPowerWatts ??
    resolvedRadio?.userRadio.customPowerLimit;
  const linkedGrid = chain?.linkedLocationId
    ? station?.savedLocations.find(
        (location) => location.id === chain.linkedLocationId,
      )?.grid
    : undefined;

  return {
    stationCallsign: station?.callsign?.trim().toUpperCase() || undefined,
    myGrid: linkedGrid?.trim() || station?.grid?.trim() || undefined,
    myRig,
    myAntenna,
    txPower: typeof txPower === "number" && Number.isFinite(txPower) ? txPower : undefined,
    stationLine: formatStationLine({
      radioLabel: myRig,
      antennaLabel: myAntenna,
      heightMeters: antenna?.heightMeters,
      powerWatts:
        typeof txPower === "number" && Number.isFinite(txPower) ? txPower : undefined,
    }),
  };
}

/** Read the live Ham Shack + profile stores. Safe from actions (not only hooks). */
export function currentStationLogStamp(options: {
  powerOverride?: number | null;
} = {}): StationLogStamp {
  return resolveStationLogStamp(
    useShackStore.getState(),
    useProfileStore.getState().station,
    options,
  );
}
