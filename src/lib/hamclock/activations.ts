import { activationWindowMs } from "@/types/activationSpots";
import type { ActivationFeedSource, ActivationProgram, ActivationSpot } from "@/types/activationSpots";

export const ACTIVATION_WINDOW_MS = 2 * 60 * 60 * 1000;

/** Keep a cached response from retaining expired activations indefinitely. */
export function currentActivations(spots: readonly ActivationSpot[], now: number, program?: ActivationProgram): ActivationSpot[] {
  const latest = new Map<string, ActivationSpot>();
  for (const spot of spots) {
    const time = Date.parse(spot.spottedAt);
    if ((program && spot.program !== program) || !Number.isFinite(time) || time > now + 5 * 60_000 || now - time >= activationWindowMs(spot.program) || !Number.isFinite(spot.frequencyKHz) || spot.frequencyKHz <= 0) continue;
    if (spot.expiresAt && (!Number.isFinite(Date.parse(spot.expiresAt)) || Date.parse(spot.expiresAt) <= now)) continue;
    const key = `${spot.program}:${spot.callsign.toUpperCase()}:${spot.reference.toUpperCase()}`;
    const previous = latest.get(key);
    if (!previous || time > Date.parse(previous.spottedAt)) latest.set(key, spot);
  }
  return [...latest.values()].sort((a, b) => Date.parse(b.spottedAt) - Date.parse(a.spottedAt));
}

export function activationSourceTime(source: ActivationFeedSource | undefined, now: number): number | null {
  if (source?.status !== "ok" || !source.fetchedAt) return null;
  const time = Date.parse(source.fetchedAt);
  return Number.isFinite(time) && time <= now + 5 * 60_000 ? time : null;
}

export function activationSourceState(source: ActivationFeedSource | undefined, now: number): string {
  if (!source) return "WAITING";
  if (source.status !== "ok") return source.status.toUpperCase();
  const time = activationSourceTime(source, now);
  return time === null ? "TIME UNKNOWN" : now - time > 5 * 60_000 ? "STALE" : "CURRENT";
}

export function activationAge(value: string, now: number): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "—";
  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`;
}
