import { gridToLatLon } from "@/lib/utils/grid";
import type { WatchCriteria } from "@/stores/watchStore";

export type GridResearchAction = "watch" | "pin" | "setTarget" | "close";

export type GridResearchActionSubject =
  | { kind: "callsign"; callsign: string; grid?: string }
  | { kind: "grid"; grid: string };

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
  action: GridResearchAction,
  subject: GridResearchActionSubject,
): GridResearchActionIntent {
  if (action === "close") return { kind: "close" };
  if (action === "watch") {
    return {
      kind: "watch",
      criteria:
        subject.kind === "callsign"
          ? { callsign: subject.callsign, txOrRx: "either" }
          : {
              gridPrefix: subject.grid.slice(0, 4).toUpperCase(),
              txOrRx: "either",
            },
    };
  }

  const grid = subject.grid;
  if (!grid) return { kind: "invalid" };

  try {
    const location = { ...gridToLatLon(grid), grid };
    return action === "pin"
      ? { kind: "pin", location }
      : { kind: "setTarget", target: location };
  } catch {
    return { kind: "invalid" };
  }
}
