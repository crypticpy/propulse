/**
 * In-runtime expansion only. Not serialized. Camera/projection are not inputs.
 * Callers pass liveGroupIds from grouping so filters/expiry cannot leave stale IDs.
 */
export interface ExpansionState {
  expandedIds: readonly string[];
}

export type ExpansionAction =
  | { type: "expand"; groupId: string }
  | { type: "regroup"; groupId: string }
  | { type: "regroupAll" }
  | { type: "reset" }
  | { type: "sync"; liveGroupIds: readonly string[] };

export function createExpansionState(): ExpansionState {
  return { expandedIds: [] };
}

export function reduceExpansion(
  state: ExpansionState,
  action: ExpansionAction,
): ExpansionState {
  switch (action.type) {
    case "expand":
      if (state.expandedIds.includes(action.groupId)) return state;
      return { expandedIds: [...state.expandedIds, action.groupId] };
    case "regroup":
      if (!state.expandedIds.includes(action.groupId)) return state;
      return { expandedIds: state.expandedIds.filter((id) => id !== action.groupId) };
    case "regroupAll":
    case "reset":
      return state.expandedIds.length === 0 ? state : { expandedIds: [] };
    case "sync": {
      const live = new Set(action.liveGroupIds);
      const next = state.expandedIds.filter((id) => live.has(id));
      if (next.length === state.expandedIds.length && next.every((id, i) => id === state.expandedIds[i])) {
        return state;
      }
      return { expandedIds: next };
    }
  }
}
