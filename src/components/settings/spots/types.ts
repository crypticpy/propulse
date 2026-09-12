/**
 * SP-08 UI-owned ports. The preferences surfaces receive every runtime and
 * persistence dependency explicitly: there is no global active view, no global
 * store fallback, and no import of IndexedDB/HTTP internals from a component.
 */
import type {
  PresetRecipe,
  SaveResult,
  SavedView,
  ViewConfiguration,
} from "@/lib/views/contracts";
import type {
  ApplyPresetResult,
  BuiltInPresetId,
  FeedAvailability,
  SourceAvailabilityNote,
} from "@/lib/views/presets";
import type { FollowStatus } from "@/lib/views/runtime";
import type {
  SpotPresentationPreferences,
} from "@/lib/views/spotContracts";

export type SpotFilterPreferences = SpotPresentationPreferences["filters"];
export type GroupingPreferences = SpotPresentationPreferences["grouping"];
export type PathPreferences = SpotPresentationPreferences["paths"];
export type PathAppearance = PathPreferences["background"];
/** Nested appearance fields are partial so two slider flushes can merge. */
export type PathPreferencesPatch = Omit<
  Partial<PathPreferences>,
  "background" | "selected"
> & {
  background?: Partial<PathAppearance>;
  selected?: Partial<PathAppearance> | null;
};

/** One stored library row with the revision the next write must expect. */
export interface SpotsLibraryEntry<T> {
  id: string;
  revision: number;
  value: T;
}

/**
 * Named-view and custom-preset library operations used by this package.
 * `RevisionedViewRepository` is adapted onto this port by
 * `createRepositoryLibraryPort`; tests supply an in-memory double.
 */
export interface SpotsLibraryPort {
  listViews(): Promise<SpotsLibraryEntry<SavedView>[]>;
  listPresets(): Promise<SpotsLibraryEntry<PresetRecipe>[]>;
  saveView(
    view: Omit<SavedView, "ownerId" | "revision">,
    expectedRevision: number,
  ): Promise<SaveResult<SavedView>>;
  savePreset(preset: PresetRecipe, expectedRevision: number): Promise<SaveResult<{ revision: number }>>;
  deleteEntry(kind: "view" | "preset", id: string, expectedRevision: number): Promise<SaveResult<{ revision: number }>>;
}

/** Working-copy edit status shown next to the view name (UX-02). */
export type WorkingStatus = "saved" | "working-changes";

export interface PresetCustomization {
  /** The built-in recipe this working copy was last applied from, if known. */
  presetId: BuiltInPresetId | null;
  presetName: string | null;
  /** True when the working copy no longer matches that recipe. */
  customized: boolean;
}

/**
 * Everything the Activity / Grouping / Paths & Motion / Presets surfaces need.
 * The quick popover and the detailed panel share exactly one controller
 * instance, so both entry points edit the same scoped working copy (UX-02).
 */
export interface SpotsPreferencesController {
  instanceId: string;
  /** Human name of the edit target; "Unsaved view" when nothing is loaded. */
  viewName: string;
  /** Library record this working copy is currently bound to, when it has one. */
  savedViewId: string | null;
  /** Recipe (built-in or custom) last applied to this working copy, when any. */
  appliedPreset: SavedView["sourcePreset"];
  config: ViewConfiguration;
  /** Configured preferences — what the user chose and what saves. */
  spots: SpotPresentationPreferences;
  /** Effective preferences after Follow radio; never written back. */
  effectiveSpots: SpotPresentationPreferences;
  followStatus: FollowStatus;
  status: WorkingStatus;
  customization: PresetCustomization;
  feedAvailability: readonly FeedAvailability[];
  sourceNotes: SourceAvailabilityNote[];
  /** Revert is offered until the next edit or save (PRESET). */
  canRevert: boolean;

  patchFilters: (patch: Partial<SpotFilterPreferences>) => void;
  patchGrouping: (patch: Partial<GroupingPreferences>) => void;
  patchPaths: (patch: PathPreferencesPatch) => void;
  setFollowRadio: (followRadio: boolean) => void;
  /** FILTER-04: restores filter defaults only. Grouping, motion and preset stay. */
  clearFilters: () => void;

  /** Pure: describes the fields a recipe would change without writing anything. */
  previewPreset: (recipe: PresetRecipe) => ApplyPresetResult;
  applyPreset: (recipe: PresetRecipe) => void;
  resetToBuiltIn: (id: BuiltInPresetId) => void;
  revert: () => void;
  /** Marks the working copy clean after a successful library save. */
  markSaved: (view: SavedView) => void;
}
