import type { HamClockUnits } from "@/stores/hamclockDisplayStore";

export type ResolvedUnits = "imperial" | "metric";

/**
 * Maidenhead fields covering the contiguous United States, Alaska and Hawaii —
 * the only places where an operator expects Fahrenheit and miles per hour by
 * default. Everything else resolves to metric. Fields are coarse (FN, EN and
 * DM spill into Canada and Mexico), which is why "auto" is a default and the
 * explicit Imperial / Metric choices exist beside it.
 */
const IMPERIAL_FIELDS = new Set([
  // Alaska
  "AO",
  "AP",
  "BO",
  "BP",
  // Hawaii
  "BK",
  "BL",
  // Contiguous United States
  "CM",
  "DM",
  "DN",
  "EL",
  "EM",
  "EN",
  "FM",
  "FN",
]);

export function resolveUnits(
  units: HamClockUnits,
  grid: string | null | undefined,
): ResolvedUnits {
  if (units !== "auto") return units;
  const field = (grid ?? "").slice(0, 2).toUpperCase();
  return IMPERIAL_FIELDS.has(field) ? "imperial" : "metric";
}

export function formatTemperature(
  celsius: number | null | undefined,
  units: ResolvedUnits,
): string {
  if (celsius == null || !Number.isFinite(celsius)) return "—";
  return units === "imperial"
    ? `${Math.round(celsius * 1.8 + 32)}°F`
    : `${Math.round(celsius)}°C`;
}

export function formatSpeed(
  kmh: number | null | undefined,
  units: ResolvedUnits,
): string {
  if (kmh == null || !Number.isFinite(kmh)) return "—";
  return units === "imperial"
    ? `${Math.round(kmh * 0.621371)} mph`
    : `${Math.round(kmh)} km/h`;
}
