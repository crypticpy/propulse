/**
 * Binds one scoped view runtime to the Spots & Paths preference surfaces.
 *
 * The runtime, repository and feed availability arrive as explicit inputs. This
 * hook never resolves an "active" view, never falls back to a global store, and
 * never starts a feed connection. Two mounted instances therefore edit two
 * independent working copies.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import type { PresetRecipe, SavedView, ViewConfiguration } from "@/lib/views/contracts";
import {
  applyPresetRecipe,
  getBuiltInRecipeIfKnown,
  explainSourceAvailability,
  isActivityCustomized,
  isDisplayCustomized,
  resetBuiltInRecipe,
  isBuiltInPresetId,
  type ApplyPresetResult,
  type BuiltInPresetId,
  type FeedAvailability,
} from "@/lib/views/presets";
import type { RadioObservation, ViewScopedStoreHandle } from "@/lib/views/runtime";
import { defaultFilters } from "./modeSelection";
import type {
  GroupingPreferences,
  PathPreferences,
  PresetCustomization,
  SpotFilterPreferences,
  SpotsPreferencesController,
} from "./types";

export interface UseSpotsPreferencesOptions {
  /** Scoped store handle for the running view being edited. */
  view: ViewScopedStoreHandle;
  /** Current radio observation for Follow radio; null when no rig is reporting. */
  radio?: RadioObservation | null;
  /** Caller-supplied feed state. Availability is explained, never inferred. */
  feedAvailability?: readonly FeedAvailability[];
  /** Library record this working copy came from, when it has one. */
  savedView?: SavedView | null;
  /** Overrides the displayed edit-target name. */
  viewName?: string;
}

const NO_FEEDS: readonly FeedAvailability[] = [];

function sameConfig(left: ViewConfiguration | null, right: ViewConfiguration): boolean {
  return left !== null && JSON.stringify(left) === JSON.stringify(right);
}

export function useSpotsPreferences(
  options: UseSpotsPreferencesOptions,
): SpotsPreferencesController {
  const { view, radio = null, feedAvailability = NO_FEEDS, savedView = null, viewName } = options;

  // Attach in committed layout setup only; the caller still owns the handle's
  // lifetime, so this never destroys it.
  useLayoutEffect(() => {
    view.ensureSubscribed();
  }, [view]);
  // Keyed on the observation's value, not its identity: callers pass an inline
  // `{ band, mode }` and setRadio always publishes fresh state, so depending on
  // the object would re-enter on every render.
  const radioBand = radio?.band ?? null;
  const radioMode = radio?.mode ?? null;
  useEffect(() => {
    view.setRadio(radioBand !== null && radioMode !== null ? { band: radioBand, mode: radioMode } : null);
  }, [view, radioBand, radioMode]);

  const state = useStore(view.store);
  const config = state.config;

  const [baseline, setBaseline] = useState<ViewConfiguration | null>(savedView?.config ?? null);
  const [appliedPreset, setAppliedPreset] = useState<SavedView["sourcePreset"]>(
    savedView?.sourcePreset ?? null,
  );
  const [revertPoint, setRevertPoint] = useState<ViewConfiguration | null>(null);
  const lastSavedId = useRef<string | null>(savedView?.id ?? null);
  // Identifies which running view this controller is currently bound to. Two
  // unsaved runtimes both report `savedView.id === null`, so the record id
  // alone cannot detect a rebind between them; the runtime's own instanceId
  // can, since it is fixed for the life of that runtime.
  const lastInstanceId = useRef<string>(state.instanceId);

  // A different library record became the edit target, or the provider was
  // rebound to a different running view: rebase status, drop revert.
  useEffect(() => {
    if (savedView?.id === lastSavedId.current && state.instanceId === lastInstanceId.current) {
      return;
    }
    lastSavedId.current = savedView?.id ?? null;
    lastInstanceId.current = state.instanceId;
    setBaseline(savedView?.config ?? null);
    setAppliedPreset(savedView?.sourcePreset ?? null);
    setRevertPoint(null);
  }, [savedView, state.instanceId]);

  const writeSpots = useCallback(
    (spots: ViewConfiguration["spots"]) => {
      setRevertPoint(null);
      view.updateWorkingView({ spots });
    },
    [view],
  );

  const patchFilters = useCallback(
    (patch: Partial<SpotFilterPreferences>) => {
      writeSpots({ ...config.spots, filters: { ...config.spots.filters, ...patch } });
    },
    [config.spots, writeSpots],
  );

  const patchGrouping = useCallback(
    (patch: Partial<GroupingPreferences>) => {
      writeSpots({ ...config.spots, grouping: { ...config.spots.grouping, ...patch } });
    },
    [config.spots, writeSpots],
  );

  const patchPaths = useCallback(
    (patch: Partial<PathPreferences>) => {
      writeSpots({ ...config.spots, paths: { ...config.spots.paths, ...patch } });
    },
    [config.spots, writeSpots],
  );

  const setFollowRadio = useCallback(
    (followRadio: boolean) => {
      setRevertPoint(null);
      view.updateWorkingView({ context: { ...config.context, followRadio } });
    },
    [config.context, view],
  );

  const clearFilters = useCallback(() => {
    writeSpots({ ...config.spots, filters: defaultFilters() });
  }, [config.spots, writeSpots]);

  const previewPreset = useCallback(
    (recipe: PresetRecipe): ApplyPresetResult =>
      applyPresetRecipe(recipe, config, { feedAvailability }),
    [config, feedAvailability],
  );

  const applyPreset = useCallback(
    (recipe: PresetRecipe) => {
      const before = config;
      const result = applyPresetRecipe(recipe, before, { feedAvailability });
      if (result.changes.length === 0) {
        // No-op application must not create a phantom revert point or edit.
        setAppliedPreset({ id: recipe.id, version: recipe.version });
        return;
      }
      setRevertPoint(before);
      setAppliedPreset({ id: recipe.id, version: recipe.version });
      view.applyPreset(recipe);
    },
    [config, feedAvailability, view],
  );

  const resetToBuiltIn = useCallback(
    (id: BuiltInPresetId) => {
      applyPreset(resetBuiltInRecipe(id));
    },
    [applyPreset],
  );

  const revert = useCallback(() => {
    if (!revertPoint) return;
    view.replaceWorkingView(revertPoint);
    setRevertPoint(null);
  }, [revertPoint, view]);

  const markSaved = useCallback((saved: SavedView) => {
    lastSavedId.current = saved.id;
    setBaseline(saved.config);
    setAppliedPreset(saved.sourcePreset ?? null);
    setRevertPoint(null);
  }, []);

  const customization = useMemo<PresetCustomization>(() => {
    const presetId = appliedPreset?.id ?? null;
    if (!presetId || !isBuiltInPresetId(presetId)) {
      return { presetId: null, presetName: null, customized: false };
    }
    const recipe = getBuiltInRecipeIfKnown(presetId);
    if (!recipe) return { presetId: null, presetName: null, customized: false };
    const customized = recipe.kind === "activity"
      ? isActivityCustomized(config.spots, recipe)
      : isDisplayCustomized(config, recipe);
    return { presetId, presetName: recipe.name, customized };
  }, [appliedPreset, config]);

  const sourceNotes = useMemo(
    () => explainSourceAvailability(config.spots.filters.sources, feedAvailability),
    [config.spots.filters.sources, feedAvailability],
  );

  const status = baseline === null
    ? (state.workingRevision > 0 ? "working-changes" : "saved")
    : (sameConfig(baseline, config) ? "saved" : "working-changes");

  return {
    instanceId: state.instanceId,
    viewName: viewName ?? savedView?.name ?? "Unsaved view",
    /** Library record this working copy is currently bound to, when it has one. */
    savedViewId: lastSavedId.current,
    /** Recipe (built-in or custom) last applied to this working copy, when any. */
    appliedPreset,
    config,
    spots: config.spots,
    effectiveSpots: state.effectiveSpots,
    followStatus: state.followStatus,
    status,
    customization,
    feedAvailability,
    sourceNotes,
    canRevert: revertPoint !== null,
    patchFilters,
    patchGrouping,
    patchPaths,
    setFollowRadio,
    clearFilters,
    previewPreset,
    applyPreset,
    resetToBuiltIn,
    revert,
    markSaved,
  };
}
