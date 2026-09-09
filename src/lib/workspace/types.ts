/**
 * Workspace system — shared types.
 *
 * A workspace is a container instantiated on exactly one canvas type
 * (phone | tablet | workstation | wall). A workspace has pages; each page is
 * "rails + a space" that widgets auto-dock into (except phone, which stacks
 * 1-3 widgets per page — see `PhoneSize`). This file has no runtime code: it
 * is the vocabulary every other module in `src/lib/workspace/` shares
 * (`canvasRules.ts`, `registry.ts`, `autoDock.ts`, `recipes.ts`).
 *
 * Pure data/types only — no React, no Zustand store imports. See
 * `docs/plans.local/WORKSPACE-CONCEPT.md` §§2-5 (private, gitignored plan of
 * record) and epic #652 / issue #655.
 *
 * Band visibility is deliberately NOT modelled here: it is a per-workspace
 * display setting (`visibleBands` on the workspace, default = all bands),
 * which belongs to `workspaceStore.ts` (a later PR), not this pure lib.
 */

/** The four fixed canvas types. A workspace declares one and never changes it. */
export type CanvasType = "phone" | "tablet" | "workstation" | "wall";

/**
 * How a widget is drawn on a canvas with rails. Orthogonal to canvas type.
 * Wall = read at 3 m, no pointer. Glance = a strip (ops console, Home).
 * Work = an interactive panel. Phone does not use this axis — see
 * `PhoneSize` — because a phone page stacks widgets rather than docking
 * them into rails.
 */
export type WidgetDensity = "wall" | "glance" | "work";

/**
 * Which phone page slot(s) a widget supports. `none` means the widget has no
 * phone form at all (e.g. a 3D globe) and never appears in a phone auto-dock
 * result. One widget declares exactly one size: its phone page footprint.
 */
export type PhoneSize = "full" | "half" | "third" | "none";

/** Which side of a page a rail occupies. Left/right are vertical; bottom is horizontal. */
export type RailSide = "left" | "right" | "bottom";

/** Orientation a rail side implies, used to match a widget's `aspect` preference. */
export type RailOrientation = "vertical" | "horizontal";

/** A rail's visible width step ("drawer" state), toggled by the operator. */
export type RailWidth = "narrow" | "normal" | "wide";

/** Shape affinity: which rail orientation a widget prefers. `any` fits either. */
export type WidgetAspect = "square" | "wide" | "tall" | "any";

/** Which shared operating-state scope a widget's content is filtered by (#633). */
export type WidgetScope = "global" | "band" | "target" | "session";

/** A widget not yet built. Recipes may still reference it so they stay complete. */
export type WidgetStatus = "planned";

/**
 * One entry in the widget registry. Data only — no component reference, so
 * the registry can be unit-tested without a DOM or a React import.
 */
export interface WidgetRegistryEntry {
  /** Stable id. Wall-backed entries reuse the wall tile's `TileId` string. */
  id: string;
  /** Human-readable name, shown in the widget picker. */
  title: string;
  /** Which of wall/glance/work this widget has a rail/hero form for. */
  densities: readonly WidgetDensity[];
  /** May this widget take the space (be the hero, or be promoted into it)? */
  canSpace: boolean;
  /** May this widget dock into a rail of either orientation (it re-flows)? */
  transposable: boolean;
  /** Rail-orientation affinity when `transposable` is false. */
  aspect: WidgetAspect;
  /** Rail budget this widget consumes on wall/workstation/tablet. Integer, >= 1. */
  weight: number;
  /** Which phone page slot this widget occupies. `"none"` = phone-unavailable. */
  phoneSize: PhoneSize;
  /**
   * Whether this widget accepts input on the wall canvas (rather than only
   * opening a report on click). Defaults to `false` when absent — the wall
   * is view-only today; no shipped widget sets this `true` yet.
   */
  wallInteractive?: boolean;
  /** Shared operating-state scope this widget's content is filtered by. */
  scope: WidgetScope;
  /** Shared operating-state fields (`operatingStateStore`, #633) this widget reads. */
  bindings: readonly string[];
  /** Present only when the widget does not exist in the UI yet. */
  status?: WidgetStatus;
}

/** One rail's capacity on a given canvas, measured in widget weight, not tile count. */
export interface RailSpec {
  side: RailSide;
  /** Total weight this rail may hold (the wall spec's "slot" count). */
  weightBudget: number;
}

/** A rail's live "drawer" state: collapsed or shown, and its width step. */
export interface RailState {
  side: RailSide;
  collapsed: boolean;
  width: RailWidth;
}

/** Phone page budget: how many widgets and how much combined weight fit on one page. */
export interface PhoneRules {
  maxWidgetsPerPage: number;
  weightBudget: number;
}

/**
 * Per-canvas-type layout rules: rails and sides, whether a hero is allowed,
 * which density the canvas's rails/hero read, tap target size and scale
 * range. Rail counts and the tablet scale range are proposed defaults, not
 * owner-stated (plan §2); they live here as a data change, not a code change.
 */
export interface CanvasRules {
  canvasType: CanvasType;
  /** Empty for phone (no rails; the space stacks widgets — see `phone`). */
  rails: readonly RailSpec[];
  /** Whether the space/hero slot exists and can be filled by a widget at all. */
  heroAllowed: boolean;
  /** The density a widget must have to take the space, when `heroAllowed`. */
  heroDensity: WidgetDensity | null;
  /**
   * Wall only: a page may be a single giant widget with rails off. When
   * true, `autoDock` accepts a `{ heroOnly: true }` option that places the
   * first widget in the space and refuses every other widget on the page.
   */
  heroOnly?: boolean;
  /** The density this canvas's rails and hero primarily read. */
  minDensity: WidgetDensity;
  /** Densities eligible to dock into ANY rail on this canvas. */
  railDensities: readonly WidgetDensity[];
  /**
   * How setting one rail's `width` affects the opposite (left/right) rail.
   * `"fixed"` = no adjustment happens (wall is view-only; tablet has one
   * rail with no opposite; phone has none). `"opposite-collapses"` = setting
   * a side to `"wide"` collapses the opposite side (workstation).
   */
  railWidthPolicy: "fixed" | "opposite-collapses";
  /** Minimum interactive tap target. `null` = read at a distance, no pointer (wall). */
  tapTargetPt: number | null;
  /** Continuous scale multiplier range (vh-token based, plan §2). `null` when fixed-width. */
  scaleRange: readonly [number, number] | null;
  /** Fixed reference width in points, used instead of `scaleRange` (phone). */
  fixedWidthPt?: number;
  /** Phone only: page budget (widget count + combined `PhoneSize` weight). */
  phone?: PhoneRules;
}

/** Where `autoDock` placed a widget. */
export type PlacementSlot =
  | { kind: "space" }
  | { kind: "rail"; side: RailSide }
  /** Phone: top-down stack position within the page, 0-based. */
  | { kind: "stack"; index: number };

export interface Placement {
  widgetId: string;
  slot: PlacementSlot;
}

/** A widget that could not be placed, with a sentence the operator can act on. */
export interface Refusal {
  widgetId: string;
  reason: string;
}

export interface DockResult {
  placements: readonly Placement[];
  refusals: readonly Refusal[];
}

/** One phone page: 1-3 widget ids, top to bottom, within the phone weight budget. */
export type PhonePage = readonly string[];

/**
 * A recipe is a starter page. Wall/workstation/tablet get one ordered widget
 * id list (auto-dock decides the exact rail/space); phone gets an ordered
 * list of pages, since a phone workflow flips through several (plan §6).
 */
export interface RecipeLayouts {
  wall: readonly string[];
  workstation: readonly string[];
  tablet: readonly string[];
  phone: readonly PhonePage[];
}

export interface Recipe {
  id: string;
  title: string;
  layouts: RecipeLayouts;
}
