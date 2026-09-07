import { createStore, type StoreApi } from "zustand/vanilla";
import type {
  PresetRecipe,
  ViewBinding,
  ViewConfiguration,
  ViewInteractionState,
  WorkingViewPatch,
} from "../contracts";
import type { SpotPresentationPreferences } from "../spotContracts";
import type { FollowStatus, RadioObservation } from "./follow";
import type { ScopedViewRuntime } from "./createViewRuntime";

export interface ViewScopedState {
  instanceId: string;
  binding: ViewBinding;
  config: ViewConfiguration;
  interaction: ViewInteractionState;
  workingRevision: number;
  effectiveSpots: SpotPresentationPreferences;
  followStatus: FollowStatus;
}

export interface ViewScopedCommands {
  updateWorkingView: (patch: WorkingViewPatch) => void;
  replaceWorkingView: (config: ViewConfiguration) => void;
  applyPreset: (preset: PresetRecipe) => void;
  selectSpot: (reportId: string, location: { lat: number; lon: number } | null) => void;
  clearSelection: () => void;
  selectPathPoint: (pointId: string | null) => void;
  setExpandedGroups: (groupIds: readonly string[]) => void;
}

export interface ViewScopedStoreHandle extends ViewScopedCommands {
  store: StoreApi<ViewScopedState>;
  setRadio: (radio: RadioObservation | null) => void;
  /** Re-attach after StrictMode simulated cleanup. Safe to call while already subscribed. */
  ensureSubscribed: () => void;
  destroy: () => void;
}

export function selectConfiguredSpots(state: ViewScopedState): SpotPresentationPreferences {
  return state.config.spots;
}

export function selectEffectiveSpots(state: ViewScopedState): SpotPresentationPreferences {
  return state.effectiveSpots;
}

export function selectPresentation(state: ViewScopedState): ViewConfiguration["presentation"] {
  return state.config.presentation;
}

export function selectInteraction(state: ViewScopedState): ViewInteractionState {
  return state.interaction;
}

export function selectFollowStatus(state: ViewScopedState): FollowStatus {
  return state.followStatus;
}

function readState(
  runtime: ScopedViewRuntime,
  radio: RadioObservation | null,
): ViewScopedState {
  const snapshot = runtime.getSnapshot();
  return {
    instanceId: runtime.instanceId,
    binding: runtime.binding,
    config: snapshot.config,
    interaction: snapshot.interaction,
    workingRevision: snapshot.workingRevision,
    effectiveSpots: runtime.effectiveSpots(radio),
    followStatus: runtime.followStatus(radio),
  };
}

function commandsFor(runtime: ScopedViewRuntime): ViewScopedCommands {
  return {
    updateWorkingView: (patch) => runtime.updateWorkingView(patch),
    replaceWorkingView: (config) => runtime.replaceWorkingView(config),
    applyPreset: (preset) => runtime.applyPreset(preset),
    selectSpot: (reportId, location) => runtime.selectSpot(reportId, location),
    clearSelection: () => runtime.clearSelection(),
    selectPathPoint: (pointId) => runtime.selectPathPoint(pointId),
    setExpandedGroups: (groupIds) => runtime.setExpandedGroups(groupIds),
  };
}

/**
 * Per-runtime read model and command proxy. Writes go only to the injected
 * runtime. There is no module-level active-view registry.
 *
 * Construction has no subscription side effects. React must attach only in
 * committed layout setup so discarded StrictMode/suspended renders cannot leak.
 * Non-React callers call `ensureSubscribed()` explicitly.
 */
export function createViewScopedStore(
  runtime: ScopedViewRuntime,
  radio: RadioObservation | null = null,
): ViewScopedStoreHandle {
  let currentRadio = radio;
  const store = createStore<ViewScopedState>(() => readState(runtime, currentRadio));
  let unsubscribe: () => void = () => undefined;

  const attach = () => {
    unsubscribe();
    store.setState(readState(runtime, currentRadio));
    unsubscribe = runtime.subscribe(() => {
      store.setState(readState(runtime, currentRadio));
    });
  };

  return {
    store,
    ...commandsFor(runtime),
    setRadio(next) {
      currentRadio = next;
      store.setState(readState(runtime, currentRadio));
    },
    ensureSubscribed: attach,
    destroy() {
      unsubscribe();
      unsubscribe = () => undefined;
    },
  };
}
