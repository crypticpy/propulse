import type { SpotPresentationPreferences } from "../spotContracts";
import { spotPresentationPreferencesSchema } from "../spotContracts";

export interface RadioObservation {
  band: string;
  mode: string;
}

export type FollowStatus = "off" | "active" | "paused-missing-radio";

export function resolveFollowStatus(followRadio: boolean, radio: RadioObservation | null): FollowStatus {
  if (!followRadio) return "off";
  return radio ? "active" : "paused-missing-radio";
}

const MODE = /^[A-Z0-9-]{1,24}$/;
const BAND = /^[a-zA-Z0-9.]{1,16}$/;

/** Effective filters for Follow radio. Does not tune a rig or mutate shared operating state. */
export function followSpotsFromRadio(
  spots: SpotPresentationPreferences,
  radio: RadioObservation,
): SpotPresentationPreferences | null {
  const band = radio.band.trim();
  const mode = radio.mode.trim().toUpperCase();
  if (!BAND.test(band) || !MODE.test(mode)) return null;
  const next = spotPresentationPreferencesSchema.safeParse({
    ...spots,
    filters: {
      ...spots.filters,
      bands: [band],
      modes: {
        all: false,
        categories: [],
        modes: [mode],
        includeUnknown: spots.filters.modes.includeUnknown,
        includeInferred: spots.filters.modes.includeInferred,
      },
    },
  });
  return next.success ? next.data : null;
}

export function bandModeFiltersEqual(
  left: SpotPresentationPreferences,
  right: SpotPresentationPreferences,
): boolean {
  return JSON.stringify(left.filters.bands) === JSON.stringify(right.filters.bands)
    && JSON.stringify(left.filters.modes) === JSON.stringify(right.filters.modes);
}
