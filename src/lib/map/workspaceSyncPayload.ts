import type { MapDataScope } from "@/lib/map/operationalScope";
import type { SelectedReportAttribution } from "@/stores/mapOperationalStore";
import type { DockTabIntent } from "@/stores/contestUIEphemeralStore";
import type { OpsDockTab } from "@/stores/contestUIStore";

/**
 * Validation for everything the operating-workspace BroadcastChannel accepts.
 *
 * During a deploy the two windows are routinely on different bundles: the
 * channel name has not changed since v2, so a window on the previous bundle
 * answers the startup request with a snapshot whose newer fields are simply
 * missing (#884 round 8, Codex). Storing `undefined` from such a payload puts a
 * shape no consumer expects into a store — the dock-tab reconciler read
 * `dockTabIntent.scope` off it and threw inside an effect. Every field is
 * therefore validated here before it is stored; anything that does not validate
 * is treated as absent and the local value is kept.
 */

const OPS_DOCK_TABS: ReadonlySet<string> = new Set<OpsDockTab>([
  "dx",
  "log",
  "contest",
]);

const MAP_DATA_SCOPES: ReadonlySet<string> = new Set<MapDataScope>([
  "observe",
  "log",
  "contest",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScope(value: unknown): value is MapDataScope {
  return typeof value === "string" && MAP_DATA_SCOPES.has(value);
}

function isDockTab(value: unknown): value is OpsDockTab {
  return typeof value === "string" && OPS_DOCK_TABS.has(value);
}

/**
 * A dock-tab intent from the wire, or `null` for anything else — including the
 * `undefined` a window on a bundle that predates the intent sends.
 */
export function normalizeDockTabIntent(value: unknown): DockTabIntent | null {
  if (!isRecord(value)) return null;
  if (!isDockTab(value.tab)) return null;
  if (value.scope === null) return { tab: value.tab, scope: null };
  if (!isScope(value.scope)) return null;
  return { tab: value.tab, scope: value.scope };
}

function isSelectedReport(value: unknown): value is SelectedReportAttribution {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.callsign === "string" &&
    typeof value.frequency === "number" &&
    typeof value.mode === "string" &&
    typeof value.source === "string" &&
    typeof value.provenance === "string" &&
    typeof value.selectedAt === "number"
  );
}

export interface OperationalWirePatch {
  manualScope?: MapDataScope | null;
  selectedReport?: SelectedReportAttribution | null;
}

/** The `operational` fields that validated; the rest keep their local value. */
export function normalizeOperationalState(
  state: unknown,
): OperationalWirePatch {
  if (!isRecord(state)) return {};
  const patch: OperationalWirePatch = {};
  if (state.manualScope === null || isScope(state.manualScope)) {
    patch.manualScope = state.manualScope;
  }
  // `workspaceOpen` is per-window UI state and is never taken from the wire
  // (#884 round 12), including from a peer on an older bundle that still sends
  // it: every window keeps its own flag.
  if (state.selectedReport === null || isSelectedReport(state.selectedReport)) {
    patch.selectedReport = state.selectedReport;
  }
  return patch;
}

/**
 * The explicit dock-tab scope marker travels with the tab it qualifies, so both
 * windows agree on which tab was chosen deliberately (#884 round 10).
 */
function normalizeExplicitDockTabScopes(
  value: unknown,
): Record<string, MapDataScope> | undefined {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value).filter(([, scope]) => isScope(scope)),
  ) as Record<string, MapDataScope>;
}

/** Per-session maps in `contestUi`, keyed by session id. */
const SESSION_MAP_FIELDS = [
  "bandBySessionId",
  "modeBySessionId",
  "draftBySessionId",
  "draftSelectionBySessionId",
  "draftUpdatedAtBySessionId",
  "publicAssistanceBySessionId",
] as const;

export type ContestUiWirePatch = Record<string, unknown>;

/** The `contestUi` fields that validated; the rest keep their local value. */
export function normalizeContestUiState(state: unknown): ContestUiWirePatch {
  if (!isRecord(state)) return {};
  const patch: ContestUiWirePatch = {};
  if (isRecord(state.dockTabBySessionId)) {
    const tabs = Object.entries(state.dockTabBySessionId).filter(([, tab]) =>
      isDockTab(tab),
    );
    patch.dockTabBySessionId = Object.fromEntries(tabs);
  }
  const explicitScopes = normalizeExplicitDockTabScopes(
    state.explicitDockTabScopeByDockKey,
  );
  if (explicitScopes !== undefined) {
    patch.explicitDockTabScopeByDockKey = explicitScopes;
  }
  for (const field of SESSION_MAP_FIELDS) {
    if (isRecord(state[field])) patch[field] = state[field];
  }
  return patch;
}
