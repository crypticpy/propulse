import type { PskStationReport } from "@/lib/hamclock/pskStation";
import { bandFromFreq } from "@/lib/utils/bandFromFreq";
import { gridToLatLon } from "@/lib/utils/grid";
import type { LiveSpot } from "@/types/livespot";

/** Report locators only: never substitute a callsign-country centroid. */
function reportLocation(value: string | null) {
  if (!value || !/^[A-R]{2}\d{2}(?:[A-X]{2}(?:\d{2})?)?$/i.test(value)) return null;
  const grid = value.toUpperCase();
  const center = gridToLatLon(grid.slice(0, 6));
  if (grid.length !== 8) return { grid, ...center };
  // Move from the six-character cell center to its numbered subcell center.
  return {
    grid,
    lat: center.lat + (Number(grid[7]) - 4.5) / 240,
    lon: center.lon + (Number(grid[6]) - 4.5) / 120,
  };
}

/** Keep every located receiving path; report selection/expiry belongs to the shared PSK view. */
export function pskStationMapSpots(reports: readonly PskStationReport[]): LiveSpot[] {
  const spots: LiveSpot[] = [];
  const seen = new Set<string>();
  for (const report of reports) {
    const tx = reportLocation(report.senderLocator);
    const rx = reportLocation(report.receiverLocator);
    if (!tx || !rx || !Number.isFinite(report.observedAt) ||
      !Number.isSafeInteger(report.frequencyHz) || report.frequencyHz <= 0) continue;
    const time = new Date(report.observedAt);
    if (!Number.isFinite(time.getTime())) continue;
    const id = JSON.stringify([
      "psk-station", report.senderCallsign, report.receiverCallsign,
      tx.grid, rx.grid, report.frequencyHz, report.mode, report.observedAt,
    ]);
    if (seen.has(id)) continue;
    seen.add(id);
    const frequency = report.frequencyHz / 1000;
    spots.push({
      id, source: "PSKReporter", dx: report.senderCallsign,
      spotter: report.receiverCallsign, receiverCallsign: report.receiverCallsign,
      dxGrid: tx.grid, spotterGrid: rx.grid, receiverGrid: rx.grid,
      dxLat: tx.lat, dxLon: tx.lon, spotterLat: rx.lat, spotterLon: rx.lon,
      dxLocApprox: false, spotterLocApprox: false,
      frequency, band: bandFromFreq(frequency) ?? undefined, mode: report.mode,
      ...(report.snr !== null ? { snr: report.snr } : {}),
      comment: "PSK Reporter station reception", time,
    });
  }
  return spots.sort((a, b) => b.time.getTime() - a.time.getTime());
}
