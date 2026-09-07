import {
  viewConfigurationSchema,
  type PresetRecipe,
  type ViewBinding,
  type ViewConfiguration,
  type ViewInteractionState,
  type ViewRuntime,
  type WorkingViewPatch,
} from "../contracts";
import { spotPresentationPreferencesSchema, type SpotPresentationPreferences } from "../spotContracts";
import { createViewConfiguration } from "../defaults";
import { applyPresetRecipe } from "../presets/apply";
import { createInstanceId } from "./ids";
import {
  bandModeFiltersEqual,
  followSpotsFromRadio,
  resolveFollowStatus,
  type FollowStatus,
  type RadioObservation,
} from "./follow";
import { familyFromSlot, persistsWorkingSlot } from "./slots";
import { deepFreeze } from "./freeze";
import {
  createMemoryWorkingStorage,
  createSessionWorkingStorage,
  defaultSessionStorage,
  type WorkingSlotRecord,
  type WorkingSlotStorage,
} from "./workingStorage";

const EMPTY_INTERACTION: ViewInteractionState = {
  selectedReportId: null,
  selectedPathPointId: null,
  target: null,
  expandedGroupIds: [],
};

export interface CreateViewRuntimeOptions {
  binding: ViewBinding;
  seed?: ViewConfiguration;
  storage?: WorkingSlotStorage;
  /** Auth-isolated working-slot partition; defaults to binding.ownerId. */
  storageNamespace?: string;
  persistWorking?: boolean;
  createInstanceId?: () => string;
}

export interface ScopedViewRuntime extends ViewRuntime {
  isDisposed(): boolean;
  /**
   * Follow-radio applicability. Does not persist, bump revision, or overwrite
   * configured filters. Effective filters come from `effectiveSpots`.
   */
  applyFollowFilters(radio: RadioObservation): boolean;
  followStatus(radio: RadioObservation | null): FollowStatus;
  effectiveSpots(radio: RadioObservation | null): SpotPresentationPreferences;
  persistWorkingSlot(): void;
}

function cloneConfig(config: ViewConfiguration): ViewConfiguration {
  return viewConfigurationSchema.parse(JSON.parse(JSON.stringify(config)));
}

function cloneInteraction(interaction: ViewInteractionState): ViewInteractionState {
  return {
    selectedReportId: interaction.selectedReportId,
    selectedPathPointId: interaction.selectedPathPointId,
    target: interaction.target ? { ...interaction.target } : null,
    expandedGroupIds: [...interaction.expandedGroupIds],
  };
}

function freezeBinding(binding: ViewBinding): ViewBinding {
  return deepFreeze({
    ownerId: binding.ownerId,
    slotId: binding.slotId,
    kind: binding.kind,
    displayId: binding.displayId,
    sourceView: binding.sourceView
      ? { id: binding.sourceView.id, revision: binding.sourceView.revision }
      : null,
  });
}

function freezeSnapshot(
  config: ViewConfiguration,
  interaction: ViewInteractionState,
  workingRevision: number,
) {
  return deepFreeze({
    config,
    interaction: cloneInteraction(interaction),
    workingRevision,
  });
}

function defaultStorage(): WorkingSlotStorage {
  const session = defaultSessionStorage();
  return session ? createSessionWorkingStorage(session) : createMemoryWorkingStorage();
}

/** Recover working edits only for the same source identity, or unsourced family slots. */
export function shouldRecoverWorking(
  recovered: WorkingSlotRecord | null,
  requested: ViewBinding["sourceView"],
): recovered is WorkingSlotRecord {
  if (!recovered) return false;
  const rec = recovered.sourceView;
  if (requested == null && rec == null) return true;
  return Boolean(
    requested && rec && requested.id === rec.id && requested.revision === rec.revision,
  );
}

export function createViewRuntime(options: CreateViewRuntimeOptions): ScopedViewRuntime {
  const persist = options.persistWorking ?? persistsWorkingSlot(options.binding.kind);
  const storage = options.storage ?? (persist ? defaultStorage() : createMemoryWorkingStorage());
  const namespace = options.storageNamespace ?? options.binding.ownerId;
  const binding = freezeBinding(options.binding);
  const instanceId = (options.createInstanceId ?? createInstanceId)();
  const recovered = persist ? storage.read(namespace, binding.slotId) : null;
  const family = familyFromSlot(binding.slotId);
  const recover = shouldRecoverWorking(recovered, binding.sourceView);
  const seed = recover
    ? recovered.config
    : options.seed
      ? cloneConfig(options.seed)
      : createViewConfiguration(family ?? "pro");
  let snapshot = freezeSnapshot(seed, EMPTY_INTERACTION, recover ? recovered.workingRevision : 0);
  const listeners = new Set<() => void>();
  let disposed = false;

  const persistNow = () => {
    if (!persist || disposed) return;
    storage.write(namespace, binding.slotId, {
      config: snapshot.config,
      workingRevision: snapshot.workingRevision,
      sourceView: binding.sourceView,
    });
  };

  const emit = () => {
    for (const listener of [...listeners]) listener();
  };

  const assertActive = () => {
    if (disposed) throw new Error("View runtime has been disposed");
  };

  const commitConfig = (
    config: ViewConfiguration,
    nextInteraction: ViewInteractionState,
    bump: boolean,
  ) => {
    snapshot = freezeSnapshot(
      config,
      nextInteraction,
      bump ? snapshot.workingRevision + 1 : snapshot.workingRevision,
    );
    persistNow();
    emit();
  };

  const commitInteraction = (interaction: ViewInteractionState) => {
    snapshot = freezeSnapshot(snapshot.config, interaction, snapshot.workingRevision);
    emit();
  };

  const runtime: ScopedViewRuntime = {
    instanceId,
    binding,
    isDisposed: () => disposed,
    getSnapshot() {
      assertActive();
      return snapshot;
    },
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    updateWorkingView(patch: WorkingViewPatch) {
      assertActive();
      const previous = snapshot.config;
      const merged = {
        ...cloneConfig(previous),
        ...(patch.spots ? { spots: spotPresentationPreferencesSchema.parse(JSON.parse(JSON.stringify(patch.spots))) } : {}),
        ...(patch.presentation ? { presentation: patch.presentation } : {}),
        ...(patch.context ? { context: patch.context } : {}),
      };
      const parsed = viewConfigurationSchema.safeParse(JSON.parse(JSON.stringify(merged)));
      if (!parsed.success) throw new Error("Invalid working view patch");
      let next = parsed.data;
      if (patch.spots && !bandModeFiltersEqual(previous.spots, next.spots) && next.context.followRadio) {
        next = { ...next, context: { ...next.context, followRadio: false } };
      }
      commitConfig(next, snapshot.interaction, true);
    },
    replaceWorkingView(config: ViewConfiguration) {
      assertActive();
      commitConfig(cloneConfig(config), EMPTY_INTERACTION, true);
    },
    applyPreset(preset: PresetRecipe) {
      assertActive();
      const { config } = applyPresetRecipe(preset, snapshot.config);
      if (preset.kind === "activity") {
        commitConfig(config, snapshot.interaction, true);
        return;
      }
      runtime.replaceWorkingView(config);
    },
    selectSpot(reportId, location) {
      assertActive();
      commitInteraction({
        selectedReportId: reportId,
        selectedPathPointId: null,
        target: location
          ? { lat: location.lat, lon: location.lon, origin: "spot", reportId }
          : null,
        expandedGroupIds: snapshot.interaction.expandedGroupIds,
      });
    },
    clearSelection() {
      assertActive();
      commitInteraction(EMPTY_INTERACTION);
    },
    selectPathPoint(pointId) {
      assertActive();
      commitInteraction({
        ...cloneInteraction(snapshot.interaction),
        selectedPathPointId: pointId,
      });
    },
    setExpandedGroups(groupIds) {
      assertActive();
      commitInteraction({
        ...cloneInteraction(snapshot.interaction),
        expandedGroupIds: [...groupIds],
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
    },
    applyFollowFilters(radio) {
      assertActive();
      if (!snapshot.config.context.followRadio) return false;
      return followSpotsFromRadio(snapshot.config.spots, radio) !== null;
    },
    followStatus(radio) {
      assertActive();
      return resolveFollowStatus(
        snapshot.config.context.followRadio,
        radio,
        snapshot.config.spots,
      );
    },
    effectiveSpots(radio) {
      assertActive();
      const configured = snapshot.config.spots;
      if (!snapshot.config.context.followRadio) return configured;
      if (!radio) return configured;
      return followSpotsFromRadio(configured, radio) ?? configured;
    },
    persistWorkingSlot: persistNow,
  };

  Object.defineProperty(runtime, "instanceId", { value: instanceId, writable: false });
  Object.defineProperty(runtime, "binding", { value: binding, writable: false });
  persistNow();
  return runtime;
}
