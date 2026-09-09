/**
 * Per-canvas-type layout rules (phone | tablet | workstation | wall).
 *
 * Sources and known tension (documented, not silently resolved):
 * - Wall rails (4 left / 5 right) and the wall scale range (0.70-1.40) come
 *   from `docs/designs/hamclock-wall-spec.md` §3 and match
 *   `docs/plans.local/WORKSPACE-CONCEPT.md` §2 exactly.
 * - Workstation rails (5 left / 6 right) reuse the wall spec's "desk" numbers
 *   (§3) per this task's brief; the bottom rail budget (6) has no owner
 *   number yet and is a proposed default, same as the rail counts already
 *   flagged as proposed in plan §2's footnote.
 * - Workstation and tablet `scaleRange` here use the *density* scale ranges
 *   from the workspace/heat-map mocks (`glance` 0.85-1.25, `work` 0.55-0.85)
 *   rather than the *canvas* ranges in plan §2's table (workstation
 *   0.70-1.40, tablet proposed 0.60-0.95 "not owner-stated"). Workstation
 *   rails/hero read the "work" density and tablet is grouped with "glance"
 *   in the mock, so those density ranges are used here. The plan's own
 *   tablet canvas proposal (0.60-0.95) is left as a documented follow-up for
 *   the tablet task (#661) to reconcile or override.
 * - Phone has no scale range: it is a fixed 390 pt reference width (plan §2,
 *   `mobile/*` under `MobileLayout`). Phone stacks 1-3 widgets per page
 *   instead of docking into rails (owner correction, 2026-09-08): a widget's
 *   phone footprint is `PhoneSize`, weighted full=3, half=1.5, third=1
 *   against a 3-unit page budget (`PHONE_SIZE_WEIGHT`, `CANVAS_RULES.phone`).
 */

import type { CanvasRules, CanvasType, PhoneSize, RailSide, RailState, RailWidth } from "./types";

/** Phone page weight per `PhoneSize`, against a 3-unit page budget. */
export const PHONE_SIZE_WEIGHT: Readonly<Record<PhoneSize, number>> = {
  full: 3,
  half: 1.5,
  third: 1,
  none: Infinity,
};

export const CANVAS_RULES: Readonly<Record<CanvasType, CanvasRules>> = {
  wall: {
    canvasType: "wall",
    // "none" is not offered: the map is a fixed full-bleed background, never
    // a widget the operator picks, so `heroAllowed` is false here. A wall
    // page may instead go `heroOnly`: one giant widget, rails off.
    rails: [
      { side: "left", weightBudget: 4 },
      { side: "right", weightBudget: 5 },
    ],
    heroAllowed: false,
    heroDensity: null,
    heroOnly: true,
    minDensity: "wall",
    railDensities: ["wall"],
    // The wall is view-only (read at 3 m, no pointer): rail width never
    // changes and nothing ever collapses.
    railWidthPolicy: "fixed",
    tapTargetPt: null,
    scaleRange: [0.7, 1.4],
  },
  workstation: {
    canvasType: "workstation",
    rails: [
      { side: "left", weightBudget: 5 },
      { side: "right", weightBudget: 6 },
      { side: "bottom", weightBudget: 6 },
    ],
    heroAllowed: true,
    heroDensity: "work",
    minDensity: "work",
    // "work; glance allowed for strips" (plan §2) — a shallow/bottom rail
    // may also hold a glance-density widget.
    railDensities: ["work", "glance"],
    // Going wide on one side rail collapses the opposite side rail so the
    // hero keeps room; the bottom rail is unaffected (owner, 2026-09-08).
    railWidthPolicy: "opposite-collapses",
    tapTargetPt: 44,
    scaleRange: [0.55, 0.85],
  },
  tablet: {
    canvasType: "tablet",
    // One rail — bottom in landscape, right in portrait (plan §2). Modelled
    // as a single generic rail; orientation switching is a UI-layer concern,
    // out of scope for this pure lib. No opposite rail exists to collapse.
    rails: [{ side: "right", weightBudget: 6 }],
    heroAllowed: true,
    heroDensity: "work",
    minDensity: "work",
    railDensities: ["work", "glance"],
    railWidthPolicy: "fixed",
    tapTargetPt: 48,
    scaleRange: [0.85, 1.25],
  },
  phone: {
    canvasType: "phone",
    // No rails and no hero: a phone page stacks 1-3 widgets top-down
    // (owner correction, 2026-09-08). `minDensity` is left as "work" only
    // to note that a widget's phone form derives from its work density;
    // sizing itself is driven entirely by `phoneSize` / `PHONE_SIZE_WEIGHT`.
    rails: [],
    heroAllowed: false,
    heroDensity: null,
    minDensity: "work",
    railDensities: [],
    railWidthPolicy: "fixed",
    tapTargetPt: 44,
    scaleRange: null,
    fixedWidthPt: 390,
    phone: { maxWidgetsPerPage: 3, weightBudget: 3 },
  },
};

export function canvasRulesFor(canvasType: CanvasType): CanvasRules {
  return CANVAS_RULES[canvasType];
}

/** Vertical rails (left/right) hold "tall" widgets; the bottom rail is horizontal. */
export function railOrientation(side: RailSide): "vertical" | "horizontal" {
  return side === "bottom" ? "horizontal" : "vertical";
}

/** A fresh, uncollapsed, normal-width state for every rail a canvas declares. */
export function defaultRailStates(rules: CanvasRules): RailState[] {
  return rules.rails.map((rail) => ({ side: rail.side, collapsed: false, width: "normal" }));
}

/**
 * Pure: set one rail's width and enforce the canvas's `railWidthPolicy`.
 * Wall (and any `"fixed"` canvas) never changes — it is a no-op, matching
 * "wall is view-only". On a `"opposite-collapses"` canvas (workstation),
 * setting a left/right rail to `"wide"` collapses its left/right opposite;
 * any other width un-collapses it. The bottom rail, if present, is never a
 * left/right opposite and is left untouched by this rule.
 */
export function applyRailWidth(
  rules: CanvasRules,
  rails: readonly RailState[],
  side: RailSide,
  width: RailWidth,
): RailState[] {
  if (rules.railWidthPolicy === "fixed") return rails.map((rail) => ({ ...rail }));

  const opposite: Partial<Record<RailSide, RailSide>> = { left: "right", right: "left" };
  const oppositeSide = opposite[side];

  return rails.map((rail) => {
    if (rail.side === side) return { ...rail, width };
    if (oppositeSide && rail.side === oppositeSide) return { ...rail, collapsed: width === "wide" };
    return { ...rail };
  });
}
