import type { DXSpot } from "@/types/dxcluster";
import type { LiveSpot, SpotSource } from "@/types/livespot";

export type PresentableSpot = DXSpot & {
  source?: SpotSource;
  snr?: number;
  wpm?: number;
  receiverCallsign?: string;
  receiverGrid?: string;
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

export function formatSpotCopyText(spot: PresentableSpot): string {
  const parts = [
    spot.dx,
    `${(spot.frequency / 1000).toFixed(3)} MHz`,
    spot.mode,
    spot.band,
    spot.dxGrid,
    spot.comment,
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
