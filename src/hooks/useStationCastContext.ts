import { useCallback, useMemo } from "react";
import { useActiveLocation, useSavedLocations } from "@/hooks/useActiveLocation";
import {
  deriveStationFeatureEnvelope,
  stationPresetToChain,
  type StationCalculationOptions,
  type StationFeatureEnvelope,
  type StationInventory,
} from "@/lib/station/stationChainEngine";
import {
  useActiveChain,
  useActivePreset,
  useInlineComponents,
  useUserAccessories,
  useUserAntennas,
  useUserFeedlines,
  useUserRadios,
} from "@/stores/shackStore";
import type { StationPreset } from "@/types/shack";
import type { StationChain } from "@/types/stationChain";
import type { OperatingLocation } from "@/types/user";

export type StationLocationSource = "chain_link" | "preset_link" | "active_location";

export function resolveStationCastLocation(
  activeLocation: OperatingLocation | null,
  savedLocations: OperatingLocation[],
  activeChain: StationChain | null,
  activePreset: StationPreset | null,
): { location: OperatingLocation | null; source: StationLocationSource } {
  const linkedLocationId = activeChain?.linkedLocationId ?? activePreset?.linkedLocationId;
  if (linkedLocationId) {
    const linked = savedLocations.find((location) => location.id === linkedLocationId);
    if (linked) {
      return {
        location: linked,
        source: activeChain?.linkedLocationId ? "chain_link" : "preset_link",
      };
    }
  }
  return { location: activeLocation, source: "active_location" };
}

export interface StationCastContext {
  location: OperatingLocation | null;
  locationSource: StationLocationSource;
  chain: StationChain | null;
  hasConfiguredChain: boolean;
  deriveEnvelope: (
    band: string,
    options?: StationCalculationOptions,
  ) => StationFeatureEnvelope | null;
}

export function useStationCastContext(): StationCastContext {
  const activeLocation = useActiveLocation();
  const savedLocations = useSavedLocations();
  const activeChain = useActiveChain();
  const activePreset = useActivePreset();
  const radios = useUserRadios();
  const antennas = useUserAntennas();
  const feedlines = useUserFeedlines();
  const accessories = useUserAccessories();
  const inlineComponents = useInlineComponents();

  const chain = useMemo(
    () => activeChain ?? (activePreset ? stationPresetToChain(activePreset) : null),
    [activeChain, activePreset],
  );
  const inventory = useMemo<StationInventory>(
    () => ({ radios, antennas, feedlines, accessories, inlineComponents }),
    [radios, antennas, feedlines, accessories, inlineComponents],
  );
  const resolvedLocation = useMemo(
    () => resolveStationCastLocation(
      activeLocation,
      savedLocations,
      activeChain,
      activePreset,
    ),
    [activeLocation, savedLocations, activeChain, activePreset],
  );
  const deriveEnvelope = useCallback(
    (band: string, options: StationCalculationOptions = {}) =>
      chain ? deriveStationFeatureEnvelope(chain, inventory, band, options) : null,
    [chain, inventory],
  );

  return {
    location: resolvedLocation.location,
    locationSource: resolvedLocation.source,
    chain,
    hasConfiguredChain: chain !== null,
    deriveEnvelope,
  };
}
