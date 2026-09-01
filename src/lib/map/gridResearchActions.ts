import { gridToLatLon } from "@/lib/utils/grid";
import type { WatchCriteria } from "@/stores/watchStore";

export type GridResearchActionIntent =
  | { kind: "close" }
  | { kind: "invalid" }
  | { kind: "pin"; location: { lat: number; lon: number; grid: string } }
  | { kind: "setTarget"; target: { lat: number; lon: number; grid: string } }
  | { kind: "watch"; criteria: WatchCriteria };

/**
 * Turn the GridResearchPanel callback into an explicit, testable map action.
 * Parent views retain control of dialogs and stores, while the meaning of the
 * visible Set Target, Watch, and Pin controls cannot silently diverge.
 */
export function resolveGridResearchActionIntent(
  action: "watch" | "pin" | "setTarget" | "close",
  grid: string,
  researchCallsign?: string | null,
): GridResearchActionIntent {
  if (action === "close") return { kind: "close" };
  if (action === "watch") {
    return {
      kind: "watch",
      criteria: researchCallsign
        ? { callsign: researchCallsign, txOrRx: "either" }
        : { gridPrefix: grid.slice(0, 4).toUpperCase(), txOrRx: "either" },
    };
  }

  try {
    const location = { ...gridToLatLon(grid), grid };
    return action === "pin"
      ? { kind: "pin", location }
      : { kind: "setTarget", target: location };
  } catch {
    return { kind: "invalid" };
  }
}
