/**
 * Pure auto-dock: `(page widgets in user order, canvas rules) -> { placements, refusals }`.
 *
 * The operator picks widgets, not positions (plan §2). This function decides
 * where each one lands. Three shapes, depending on the canvas:
 *
 * - **Phone** has no rails and no hero (owner correction, 2026-09-08): a
 *   page stacks 1-3 widgets top-down in list order, each sized by
 *   `PhoneSize` against a 3-unit budget. A widget that does not fit is
 *   refused with "This phone page is full. Add a new page." — the operator
 *   is expected to start a new page, never spill or evict.
 * - **Wall in `heroOnly` mode** (`{ heroOnly: true }`, only when
 *   `CanvasRules.heroOnly` is set) places the first widget in the space —
 *   subject to the same eligibility a normal hero placement requires
 *   (declares the wall density, `canSpace`) — and refuses every other
 *   widget: a wall page can be one giant widget with rails off, or the
 *   normal paged-rail layout, never both.
 * - **Everything else** (wall's normal rail pages, workstation, tablet):
 *   1. If the canvas allows a hero and the widget list has a `canSpace`
 *      widget whose densities include the canvas's hero density, the first
 *      such widget (in list order) fills the space.
 *   2. Every other widget is eligible for every rail whose density it
 *      declares — a widget may only be refused for density, weight budget,
 *      or full rails, never for orientation (Codex finding, #655). Aspect
 *      vs. rail orientation is a *preference* used to order the candidate
 *      rails: rails whose orientation matches the widget's `aspect` (or any
 *      rail, if the widget is `transposable`, `any`, or `square`) are tried
 *      first, then the rest, in the canvas's declared rail order (left,
 *      then right, then bottom, then top). The first candidate with room
 *      takes it, so a full left rail already falls back to right, and vice
 *      versa, before anything is refused. A full top rail falls back to the
 *      other rails the same way.
 *   3. A widget that fits no eligible rail is refused with a sentence
 *      naming every eligible rail's fullness (owner decision, plan §10 Q3:
 *      refuse, never evict, never spill).
 */

import { PHONE_SIZE_WEIGHT, railOrientation } from "./canvasRules";
import { getRegistryEntry, WIDGET_REGISTRY } from "./registry";
import type {
  CanvasRules,
  DockResult,
  Placement,
  Refusal,
  RailSpec,
  WidgetRegistryEntry,
} from "./types";

export interface AutoDockOptions {
  /** Wall only, and only when `CanvasRules.heroOnly` is set: one giant widget, rails off. */
  heroOnly?: boolean;
}

function aspectFitsOrientation(entry: WidgetRegistryEntry, side: RailSpec["side"]): boolean {
  if (entry.transposable) return true;
  if (entry.aspect === "any" || entry.aspect === "square") return true;
  const orientation = railOrientation(side);
  return (entry.aspect === "tall" && orientation === "vertical") || (entry.aspect === "wide" && orientation === "horizontal");
}

function railLabel(side: RailSpec["side"]): string {
  return `${side.charAt(0).toUpperCase()}${side.slice(1)} rail`;
}

function eligibleRails(entry: WidgetRegistryEntry, rules: CanvasRules): RailSpec[] {
  if (entry.densities.length === 0) return [];
  const densityOk = entry.densities.some((d) => rules.railDensities.includes(d));
  if (!densityOk) return [];
  // Aspect vs. rail orientation is a preference used for ordering (and for
  // whether a widget transposes), never a hard rejection: a widget that
  // declares the canvas's density is eligible for every rail. Rails whose
  // orientation matches the widget's aspect are tried first; the rest are a
  // fallback, in the canvas's declared rail order (Codex finding, #655).
  const preferred = rules.rails.filter((rail) => aspectFitsOrientation(entry, rail.side));
  const fallback = rules.rails.filter((rail) => !aspectFitsOrientation(entry, rail.side));
  return [...preferred, ...fallback];
}

/** Human sentence naming every full rail a widget was eligible for. */
function fullRailsReason(candidates: RailSpec[], used: Map<RailSpec["side"], number>): string {
  if (candidates.length === 1) {
    const rail = candidates[0];
    return `${railLabel(rail.side)} is full (${used.get(rail.side) ?? 0} of ${rail.weightBudget} slots). Remove a widget to make room.`;
  }
  const parts = candidates.map((rail) => `${used.get(rail.side) ?? 0} of ${rail.weightBudget} ${rail.side}`);
  const label = candidates.length === 2 ? "Both rails" : "All rails";
  return `${label} are full (${parts.join(", ")}). Remove a widget first.`;
}

function resolveEntry(
  widgetId: string,
  registry: Readonly<Record<string, WidgetRegistryEntry>>,
): WidgetRegistryEntry | undefined {
  return registry[widgetId] ?? getRegistryEntry(widgetId);
}

function autoDockPhone(
  widgetIds: readonly string[],
  rules: CanvasRules,
  registry: Readonly<Record<string, WidgetRegistryEntry>>,
): DockResult {
  const placements: Placement[] = [];
  const refusals: Refusal[] = [];
  const budget = rules.phone?.weightBudget ?? 3;
  const maxWidgets = rules.phone?.maxWidgetsPerPage ?? 3;
  let used = 0;
  let index = 0;

  for (const widgetId of widgetIds) {
    const entry = resolveEntry(widgetId, registry);
    if (!entry) {
      refusals.push({ widgetId, reason: `"${widgetId}" is not in the widget registry.` });
      continue;
    }
    if (entry.phoneSize === "none") {
      refusals.push({ widgetId, reason: `"${entry.title}" is not available on the phone canvas.` });
      continue;
    }
    const weight = PHONE_SIZE_WEIGHT[entry.phoneSize];
    if (index + 1 > maxWidgets || used + weight > budget) {
      refusals.push({ widgetId, reason: "This phone page is full. Add a new page." });
      continue;
    }
    placements.push({ widgetId, slot: { kind: "stack", index } });
    used += weight;
    index += 1;
  }

  return { placements, refusals };
}

function autoDockHeroOnly(
  widgetIds: readonly string[],
  registry: Readonly<Record<string, WidgetRegistryEntry>>,
): DockResult {
  const placements: Placement[] = [];
  const refusals: Refusal[] = [];

  widgetIds.forEach((widgetId, i) => {
    const entry = resolveEntry(widgetId, registry);
    if (!entry) {
      refusals.push({ widgetId, reason: `"${widgetId}" is not in the widget registry.` });
      return;
    }
    if (i === 0) {
      // Same eligibility a normal hero placement requires: the widget must
      // declare the wall density and be able to take the space (Codex
      // finding, #655) — heroOnly relaxes the *page layout*, not the
      // widget's own placement rules.
      if (!entry.densities.includes("wall")) {
        refusals.push({ widgetId, reason: `"${entry.title}" has no wall form.` });
        return;
      }
      if (!entry.canSpace) {
        refusals.push({ widgetId, reason: `"${entry.title}" cannot fill the space.` });
        return;
      }
      placements.push({ widgetId, slot: { kind: "space" } });
      return;
    }
    refusals.push({
      widgetId,
      reason: `This wall page is hero-only: only one widget is allowed. Remove "${entry.title}" or turn off hero-only.`,
    });
  });

  return { placements, refusals };
}

export function autoDock(
  widgetIds: readonly string[],
  rules: CanvasRules,
  registry: Readonly<Record<string, WidgetRegistryEntry>> = WIDGET_REGISTRY,
  options?: AutoDockOptions,
): DockResult {
  if (rules.canvasType === "phone") return autoDockPhone(widgetIds, rules, registry);
  if (rules.canvasType === "wall" && rules.heroOnly && options?.heroOnly) {
    return autoDockHeroOnly(widgetIds, registry);
  }

  const placements: Placement[] = [];
  const refusals: Refusal[] = [];
  const used = new Map<RailSpec["side"], number>();
  for (const rail of rules.rails) used.set(rail.side, 0);

  let spaceTaken = false;
  const remaining: string[] = [];

  for (const widgetId of widgetIds) {
    const entry = resolveEntry(widgetId, registry);
    if (!entry) {
      refusals.push({ widgetId, reason: `"${widgetId}" is not in the widget registry.` });
      continue;
    }
    if (
      !spaceTaken &&
      rules.heroAllowed &&
      rules.heroDensity &&
      entry.canSpace &&
      entry.densities.includes(rules.heroDensity)
    ) {
      placements.push({ widgetId, slot: { kind: "space" } });
      spaceTaken = true;
      continue;
    }
    remaining.push(widgetId);
  }

  for (const widgetId of remaining) {
    const entry = resolveEntry(widgetId, registry);
    if (!entry) continue; // already refused above

    if (rules.rails.length === 0) {
      refusals.push({
        widgetId,
        reason: `"${entry.title}" has no place on the ${rules.canvasType} canvas: it has no rails, and the space is already in use.`,
      });
      continue;
    }

    const candidates = eligibleRails(entry, rules);
    if (candidates.length === 0) {
      refusals.push({
        widgetId,
        reason: `"${entry.title}" has no ${rules.canvasType} rail form.`,
      });
      continue;
    }

    // Try every eligible rail (left -> right -> bottom -> top, the array
    // order in `CanvasRules.rails`) before refusing: a full left rail falls
    // back to right, a full top rail falls back to the remaining rails, and
    // so on.
    const fit = candidates.find((rail) => (used.get(rail.side) ?? 0) + entry.weight <= rail.weightBudget);
    if (fit) {
      used.set(fit.side, (used.get(fit.side) ?? 0) + entry.weight);
      placements.push({ widgetId, slot: { kind: "rail", side: fit.side } });
      continue;
    }

    refusals.push({ widgetId, reason: fullRailsReason(candidates, used) });
  }

  return { placements, refusals };
}
