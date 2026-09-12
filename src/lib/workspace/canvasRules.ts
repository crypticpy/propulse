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
 * - Workstation `scaleRange` uses the *density* scale range from the
 *   workspace/heat-map mocks (`work` 0.55-0.85) rather than the *canvas*
 *   range in plan §2's table (workstation 0.70-1.40): workstation rails/hero
 *   read the "work" density, so that density range is used here.
 * - Tablet `scaleRange` is 0.60-0.95 (#661 resolution): the issue's 1024x768
 *   reference canvas states this range explicitly, overriding the
 *   `glance` 0.85-1.25 density range this file previously borrowed here
 *   (that borrowing was flagged as an open tension for #661 to reconcile;
 *   this is that reconciliation, a data-only change with no consumer yet
 *   per `types.ts`'s `scaleRange` doc comment).
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
      // Horizontal strip; weight is a proposed default (same spirit as
      // workstation's bottom rail) until the wall-bars sheet (#915) names one.
      { side: "top", weightBudget: 6 },
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
    // TODO(#919): top rail is not yet rendered by WorkspaceCanvas and
    // persisted v3 workspaces have no top RailState, so it is intentionally
    // left out of `rails` here. Re-add once #919 lands the render path and a
    // schema migration.
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
    // Going wide on one rail collapses its pair so the hero keeps room:
    // left↔right (owner, 2026-09-08: bottom is not a left/right opposite).
    // A vertical rail never collapses a horizontal one.
    railWidthPolicy: "opposite-collapses",
    tapTargetPt: 44,
    scaleRange: [0.55, 0.85],
  },
  tablet: {
    canvasType: "tablet",
    // Right rail is the existing side strip (plan §2 modelled one generic
    // rail; portrait/landscape switching is still UI).
    // TODO(#919): top rail is not yet rendered by WorkspaceCanvas and
    // persisted v3 workspaces have no top RailState, so it is intentionally
    // left out of `rails` here. Re-add once #919 lands the render path and a
    // schema migration.
    rails: [{ side: "right", weightBudget: 6 }],
    heroAllowed: true,
    heroDensity: "work",
    minDensity: "work",
    railDensities: ["work", "glance"],
    railWidthPolicy: "fixed",
    tapTargetPt: 48,
    scaleRange: [0.6, 0.95],
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

/** Vertical rails (left/right) hold "tall" widgets; top and bottom are horizontal. */
export function railOrientation(side: RailSide): "vertical" | "horizontal" {
  return side === "bottom" || side === "top" ? "horizontal" : "vertical";
}

/** A fresh, uncollapsed, normal-width state for every rail a canvas declares. */
export function defaultRailStates(rules: CanvasRules): RailState[] {
  return rules.rails.map((rail) => ({ side: rail.side, collapsed: false, width: "normal" }));
}

/**
 * Pure: set one rail's width and enforce the canvas's `railWidthPolicy`.
 * Wall (and any `"fixed"` canvas) never changes — it is a no-op, matching
 * "wall is view-only". On a `"opposite-collapses"` canvas (workstation),
 * setting a rail to `"wide"` collapses its pair: left↔right, top↔bottom.
 * Any other width un-collapses the pair. A vertical rail never collapses a
 * horizontal one, and vice versa.
 */
export function applyRailWidth(
  rules: CanvasRules,
  rails: readonly RailState[],
  side: RailSide,
  width: RailWidth,
): RailState[] {
  if (rules.railWidthPolicy === "fixed") return rails.map((rail) => ({ ...rail }));

  const opposite: Partial<Record<RailSide, RailSide>> = {
    left: "right",
    right: "left",
    top: "bottom",
    bottom: "top",
  };
  const oppositeSide = opposite[side];

  return rails.map((rail) => {
    if (rail.side === side) return { ...rail, width };
    if (oppositeSide && rail.side === oppositeSide) return { ...rail, collapsed: width === "wide" };
    return { ...rail };
  });
}
