export type ActivationProgram = "POTA" | "SOTA" | "WWFF" | "WWBOTA";

export type ActivationSourceStatus = "ok" | "unavailable" | "invalid";

export interface ActivationSpot {
  id: string;
  program: ActivationProgram;
  callsign: string;
  reference: string;
  referenceName: string;
  frequencyKHz: number;
  mode: string;
  comments: string;
  spotter: string;
  spottedAt: string;
  latitude?: number;
  longitude?: number;
  grid?: string;
}

export interface ActivationFeedSource {
  program: ActivationProgram;
  status: ActivationSourceStatus;
  source: string;
  sourceUrl: string;
  count: number;
  /** Per-provider request completion; missing on older cached envelopes. */
  checkedAt?: string;
  /** Successful retrieval only, never a new observation timestamp. */
  fetchedAt?: string | null;
}

export interface ActivationSpotsResponse {
  fetchedAt: string;
  spots: ActivationSpot[];
  sources: ActivationFeedSource[];
}

export const ACTIVATION_PROGRAMS: readonly ActivationProgram[] = [
  "POTA",
  "SOTA",
  "WWFF",
  "WWBOTA",
] as const;

export const ACTIVATION_PROGRAM_META: Record<
  ActivationProgram,
  { label: string; source: string; sourceUrl: string }
> = {
  POTA: {
    label: "POTA",
    source: "Parks on the Air",
    sourceUrl: "https://pota.app/",
  },
  SOTA: {
    label: "SOTA",
    source: "ParksnPeaks syndication",
    sourceUrl: "https://www.parksnpeaks.org/",
  },
  WWFF: {
    label: "WWFF",
    source: "WWFF Spotline",
    sourceUrl: "https://spots.wwff.co/",
  },
  WWBOTA: {
    label: "WWBOTA",
    source: "Worldwide Bunkers on the Air",
    sourceUrl: "https://wwbota.net/",
  },
};
