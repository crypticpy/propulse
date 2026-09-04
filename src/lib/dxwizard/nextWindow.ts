import {
  getForecastForPath,
  getBestWindows,
  type BestWindow,
} from "@/lib/utils/bands";
import type { WizardNextWindow, WizardStationInput, ResolvedTarget } from "./types";

export function computeNextWindow(params: {
  station: WizardStationInput;
  target: ResolvedTarget;
  currentKp: number;
  currentSfi: number;
  now?: Date;
}): WizardNextWindow | null {
  const now = params.now ?? new Date();
  const forecast = getForecastForPath(
    params.station.lat,
    params.station.lon,
    params.target.lat,
    params.target.lon,
    params.currentKp,
    params.currentSfi,
    now,
  );
  const windows = getBestWindows(forecast);
  if (windows.length === 0) return null;

  const currentHour = now.getUTCHours();
  const ranked = [...windows].sort((a, b) => {
    const statusRank = (s: BestWindow["peakStatus"]) =>
      ({ excellent: 4, good: 3, fair: 2, poor: 1, closed: 0 })[s];
    const statusDiff = statusRank(b.peakStatus) - statusRank(a.peakStatus);
    if (statusDiff !== 0) return statusDiff;
    return b.peakSnr - a.peakSnr;
  });

  const best = ranked[0];
  let hoursAway = (best.peakHour - currentHour + 24) % 24;
  // If peak is "now" (same hour) treat as 0
  if (best.peakHour === currentHour) hoursAway = 0;

  const label =
    hoursAway === 0
      ? `${best.band} peaking now (${best.peakStatus})`
      : `${best.band} peaks in ${hoursAway}h at ${String(best.peakHour).padStart(2, "0")}:00Z`;

  return { window: best, hoursAway, label };
}
