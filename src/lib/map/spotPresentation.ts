import type { DXSpot } from "@/types/dxcluster";
import { getBandFromFrequency } from "@/lib/api/dxcluster";
import {
  ACTIVATION_PROGRAM_META,
  type ActivationProgram,
  type ActivationSpot,
} from "@/types/activationSpots";
import {
  SPOT_SOURCE_COLORS,
  type LiveSpot,
  type SpotSource,
} from "@/types/livespot";

export interface ActivationSpotPresentation {
  program: ActivationProgram;
  reference: string;
  referenceName: string;
  source: string;
  sourceUrl: string;
}

export type PresentableSpot = DXSpot & {
  source?: SpotSource;
  snr?: number;
  wpm?: number;
  receiverCallsign?: string;
  receiverGrid?: string;
  /** Provider-specific activation context retained by the canonical surfaces. */
  activation?: ActivationSpotPresentation;
};

const ACTIVATION_SOURCE_COLORS: Record<
  ActivationProgram,
  { color: string; bgColor: string }
> = {
  POTA: { color: "#34d399", bgColor: "rgba(52, 211, 153, 0.16)" },
  SOTA: { color: "#fbbf24", bgColor: "rgba(251, 191, 36, 0.16)" },
  WWFF: { color: "#60a5fa", bgColor: "rgba(96, 165, 250, 0.16)" },
};

const ACTIVATION_REFERENCE =
  /\b(POTA|SOTA|WWFF|IOTA)\s*[:#-]?\s*([A-Z0-9]+(?:[-/][A-Z0-9]+)+)\b/i;

export function extractSpotReference(comment?: string): string | null {
  if (!comment) return null;
  const match = comment.match(ACTIVATION_REFERENCE);
  return match ? `${match[1].toUpperCase()} ${match[2].toUpperCase()}` : null;
}

export function formatSpotPresentationLabel(
  callsign: string,
  comment?: string,
): string {
  const reference = extractSpotReference(comment);
  return reference ? `${callsign} · ${reference}` : callsign;
}

export function normalizePresentableSpot(spot: PresentableSpot): LiveSpot {
  return {
    ...spot,
    source: spot.source ?? "Cluster",
  };
}

/** Convert a portable-activation report into the canonical map spot shape. */
export function presentActivationSpot(
  spot: ActivationSpot & { latitude: number; longitude: number },
): PresentableSpot {
  const meta = ACTIVATION_PROGRAM_META[spot.program];
  const activationLabel = `${spot.program} ${spot.reference}`;
  const comments = [activationLabel, spot.referenceName, spot.comments]
    .filter(Boolean)
    .join(" · ");
  return {
    id: spot.id,
    spotter: spot.spotter,
    dx: spot.callsign,
    dxGrid: spot.grid,
    dxLat: spot.latitude,
    dxLon: spot.longitude,
    frequency: spot.frequencyKHz,
    mode: spot.mode,
    comment: comments,
    time: new Date(spot.spottedAt),
    band: getBandFromFrequency(spot.frequencyKHz),
    // Keep the transport-compatible source while presenting the actual
    // activation provider through the explicit metadata below.
    source: "Cluster",
    activation: {
      program: spot.program,
      reference: spot.reference,
      referenceName: spot.referenceName,
      source: meta.source,
      sourceUrl: meta.sourceUrl,
    },
  };
}

export function getSpotPresentationSource(
  spot: PresentableSpot,
): { label: string; color: string; bgColor: string } {
  if (spot.activation) {
    return {
      label: spot.activation.program,
      ...ACTIVATION_SOURCE_COLORS[spot.activation.program],
    };
  }
  const source = spot.source ?? "Cluster";
  return { label: source, ...SPOT_SOURCE_COLORS[source] };
}

export function formatSpotCopyText(spot: PresentableSpot): string {
  const parts = [
    spot.dx,
    `${(spot.frequency / 1000).toFixed(3)} MHz`,
    spot.mode,
    spot.band,
    spot.dxGrid,
    spot.comment,
    spot.activation?.source,
    spot.spotter ? `spotted by ${spot.spotter}` : undefined,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function mapSpotModeToRigMode(
  mode: string | undefined,
  frequencyKHz: number,
): string {
  switch ((mode || "").toUpperCase()) {
    case "FT8":
    case "FT4":
    case "JT65":
    case "JT9":
    case "PSK31":
    case "RTTY":
      return "USB";
    case "CW":
      return "CW";
    case "SSB":
      return frequencyKHz < 10000 ? "LSB" : "USB";
    case "AM":
      return "AM";
    case "FM":
      return "FM";
    default:
      return "USB";
  }
}
