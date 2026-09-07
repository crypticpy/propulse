import {
  viewConfigurationSchema,
  type PresetRecipe,
  type ViewBinding,
  type ViewConfiguration,
  type ViewInteractionState,
  type ViewRuntime,
  type WorkingViewPatch,
} from "../contracts";
import { spotPresentationPreferencesSchema } from "../spotContracts";
import { createViewConfiguration } from "../defaults";
import { createInstanceId } from "./ids";
import {
  bandModeFiltersEqual,
  followSpotsFromRadio,
  resolveFollowStatus,
  type RadioObservation,
} from "./follow";
import { familyFromSlot, persistsWorkingSlot } from "./slots";
import {
  createMemoryWorkingStorage,
  createSessionWorkingStorage,
  defaultSessionStorage,
  type WorkingSlotStorage,
} from "./workingStorage";

const EMPTY_INTERACTION: ViewInteractionState = Object.freeze({
  selectedReportId: null,
  selectedPathPointId: null,
  target: null,
  expandedGroupIds: Object.freeze([]) as readonly string[],
});

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
  /** Follow-radio filter apply; does not disable follow or issue radio commands. */
  applyFollowFilters(radio: RadioObservation): boolean;
  followStatus(radio: RadioObservation | null): ReturnType<typeof resolveFollowStatus>;
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

function emptySnapshot(config: ViewConfiguration, workingRevision: number) {
  return {
    config,
    interaction: cloneInteraction(EMPTY_INTERACTION),
    workingRevision,
  };
}

function defaultStorage(): WorkingSlotStorage {
  const session = defaultSessionStorage();
  return session ? createSessionWorkingStorage(session) : createMemoryWorkingStorage();
}

export function createViewRuntime(options: CreateViewRuntimeOptions): ScopedViewRuntime {
  const persist = options.persistWorking ?? persistsWorkingSlot(options.binding.kind);
  const storage = options.storage ?? (persist ? defaultStorage() : createMemoryWorkingStorage());
  const namespace = options.storageNamespace ?? options.binding.ownerId;
  const instanceId = (options.createInstanceId ?? createInstanceId)();
  const recovered = persist ? storage.read(namespace, options.binding.slotId) : null;
  const family = familyFromSlot(options.binding.slotId);
  const seed = recovered?.config
    ?? (options.seed ? cloneConfig(options.seed) : createViewConfiguration(family ?? "pro"));
  let snapshot = emptySnapshot(seed, recovered?.workingRevision ?? 0);
  const listeners = new Set<() => void>();
  let disposed = false;

  const persistNow = () => {
    if (!persist || disposed) return;
    storage.write(namespace, options.binding.slotId, {
      config: snapshot.config,
      workingRevision: snapshot.workingRevision,
      sourceView: options.binding.sourceView,
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
    snapshot = {
      config,
      interaction: nextInteraction,
      workingRevision: bump ? snapshot.workingRevision + 1 : snapshot.workingRevision,
    };
    persistNow();
    emit();
  };

  const runtime: ScopedViewRuntime = {
    instanceId,
    binding: options.binding,
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
        ...previous,
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
      commitConfig(cloneConfig(config), cloneInteraction(EMPTY_INTERACTION), true);
    },
    applyPreset(preset: PresetRecipe) {
      assertActive();
      if (preset.kind === "activity") {
        runtime.updateWorkingView({
          spots: spotPresentationPreferencesSchema.parse(JSON.parse(JSON.stringify(preset.spots))),
        });
        return;
      }
      runtime.replaceWorkingView(preset.config);
    },
    selectSpot(reportId, location) {
      assertActive();
      snapshot = {
        ...snapshot,
        interaction: {
          selectedReportId: reportId,
          selectedPathPointId: null,
          target: location
            ? { lat: location.lat, lon: location.lon, origin: "spot", reportId }
            : null,
          expandedGroupIds: snapshot.interaction.expandedGroupIds,
        },
      };
      emit();
    },
    clearSelection() {
      assertActive();
      snapshot = {
        ...snapshot,
        interaction: cloneInteraction(EMPTY_INTERACTION),
      };
      emit();
    },
    selectPathPoint(pointId) {
      assertActive();
      snapshot = {
        ...snapshot,
        interaction: { ...snapshot.interaction, selectedPathPointId: pointId },
      };
      emit();
    },
    setExpandedGroups(groupIds) {
      assertActive();
      snapshot = {
        ...snapshot,
        interaction: { ...snapshot.interaction, expandedGroupIds: Object.freeze([...groupIds]) },
      };
      emit();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
    },
    applyFollowFilters(radio) {
      assertActive();
      if (!snapshot.config.context.followRadio) return false;
      const spots = followSpotsFromRadio(snapshot.config.spots, radio);
      if (!spots) return false;
      if (bandModeFiltersEqual(snapshot.config.spots, spots)) return true;
      commitConfig({ ...snapshot.config, spots }, snapshot.interaction, true);
      return true;
    },
    followStatus(radio) {
      assertActive();
      return resolveFollowStatus(snapshot.config.context.followRadio, radio);
    },
    persistWorkingSlot: persistNow,
  };

  Object.defineProperty(runtime, "instanceId", { value: instanceId, writable: false });
  Object.defineProperty(runtime, "binding", { value: options.binding, writable: false });
  persistNow();
  return runtime;
}
