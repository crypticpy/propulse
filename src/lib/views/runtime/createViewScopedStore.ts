import { createStore, type StoreApi } from "zustand/vanilla";
import type { ViewBinding, ViewConfiguration, ViewInteractionState } from "../contracts";
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

export interface ViewScopedStoreHandle {
  store: StoreApi<ViewScopedState>;
  setRadio: (radio: RadioObservation | null) => void;
  destroy: () => void;
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

/**
 * Per-runtime read model. Does not write legacy map/DX/HamClock singletons.
 * Radio observations stay derived; destroy() must run with the runtime.
 */
export function createViewScopedStore(
  runtime: ScopedViewRuntime,
  radio: RadioObservation | null = null,
): ViewScopedStoreHandle {
  let currentRadio = radio;
  const store = createStore<ViewScopedState>(() => readState(runtime, currentRadio));
  const unsubscribe = runtime.subscribe(() => {
    store.setState(readState(runtime, currentRadio));
  });
  return {
    store,
    setRadio(next) {
      currentRadio = next;
      store.setState(readState(runtime, currentRadio));
    },
    destroy: unsubscribe,
  };
}
