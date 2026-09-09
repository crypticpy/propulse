/**
 * PRESET-01/02/03: catalog + custom presets for the detailed Spots & Paths
 * preferences panel. Every write goes through `controller`/`library` — this
 * component never touches a store, IndexedDB, HTTP or a rig directly, and it
 * never applies a preset without first routing through the preview dialog.
 */
import { useState } from "react";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import {
  activityRecipeFromWorkingSpots,
  copyPresetRecipe,
  listActivityRecipes,
  listDisplayRecipes,
  type ApplyPresetResult,
} from "@/lib/views/presets";
import type { PresetRecipe, ViewConfiguration } from "@/lib/views/contracts";
import type { PathAppearance, SpotPresentationPreferences } from "@/lib/views/spotContracts";
import { LibraryConfirmDialog } from "../LibraryConfirmDialog";
import { LibraryNoticeBar } from "../LibraryNoticeBar";
import { PresetPreviewDialog } from "../PresetPreviewDialog";
import { newLibraryId, type SpotsLibraryController } from "../useSpotsLibrary";
import type { SpotsLibraryEntry, SpotsPreferencesController } from "../types";

const FOCUS_RING = "focus:outline-none focus:ring-2 focus:ring-plasma-orange/60";

type PreviewState = { recipe: PresetRecipe; result: ApplyPresetResult } | null;
type NamePromptState =
  | { mode: "save-new" }
  | { mode: "rename"; entry: SpotsLibraryEntry<PresetRecipe> }
  | null;

function describePathTreatment(appearance: PathAppearance | null): string {
  if (!appearance) return "inherits background";
  return appearance.style === "off" ? "off" : appearance.style.replace(/-/g, " ");
}

function summarizeModes(filters: SpotPresentationPreferences["filters"]): string {
  if (filters.modes.all) return "all modes";
  if (filters.modes.modes.length > 0) return filters.modes.modes.join("/");
  if (filters.modes.categories.length > 0) return filters.modes.categories.join("/");
  return "selected modes";
}

/** Derived from the recipe itself so the summary can never drift from the catalog. */
function summarizeActivitySpots(spots: SpotPresentationPreferences): string {
  const modes = summarizeModes(spots.filters);
  const background = describePathTreatment(spots.paths.background);
  const selected = describePathTreatment(spots.paths.selected);
  return `${modes} • ${spots.filters.maxAgeMinutes} min • up to ${spots.filters.spotLimit} spots • background ${background} • selected ${selected}`;
}

function summarizeDisplayConfig(config: ViewConfiguration): string {
  return `${config.family} layout • ${config.presentation.projection} projection • ${config.presentation.textScale} text`;
}

function CatalogRow({
  recipe,
  summary,
  onSelect,
}: {
  recipe: PresetRecipe;
  summary: string;
  onSelect: () => void;
}) {
  return (
    <div role="listitem">
      <button
        type="button"
        onClick={onSelect}
        className={`flex min-h-[40px] w-full flex-col items-start gap-0.5 rounded-lg border border-su-line/40 bg-void-black px-3 py-2 text-left transition-colors hover:border-plasma-orange/60 ${FOCUS_RING}`}
      >
        <span className="text-sm font-medium text-su-text">{recipe.name}</span>
        <span className="text-xs text-su-muted">{summary}</span>
        {/* recipe.id must stay visible: PRESET-01 in PresetsSection.test.tsx
            asserts every ACTIVITY_PRESET_IDS/DISPLAY_PRESET_IDS entry renders
            as text, so a catalog entry that's deferred from the UI fails the
            test. text-xs/full text-su-muted meets the DS-16 legibility floor
            (was text-[10px] text-su-muted/70). */}
        <span className="font-mono text-xs text-su-muted">{recipe.id}</span>
      </button>
    </div>
  );
}

function CustomPresetRow({
  entry,
  onSelect,
  onDuplicate,
  onRename,
  onDelete,
}: {
  entry: SpotsLibraryEntry<PresetRecipe>;
  onSelect: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div role="listitem" className="rounded-lg border border-su-line/40 bg-void-black px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSelect}
          className={`min-h-[40px] text-left text-sm font-medium text-su-text hover:text-plasma-orange ${FOCUS_RING}`}
        >
          {entry.value.name}
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDuplicate}
            className={`min-h-[40px] rounded-lg border border-su-line/40 px-2 py-1 text-xs font-medium text-su-muted hover:text-su-text ${FOCUS_RING}`}
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={onRename}
            className={`min-h-[40px] rounded-lg border border-su-line/40 px-2 py-1 text-xs font-medium text-su-muted hover:text-su-text ${FOCUS_RING}`}
          >
            Rename
          </button>
          <button
            type="button"
            onClick={onDelete}
            className={`min-h-[40px] rounded-lg border border-alert-red/40 px-2 py-1 text-xs font-medium text-alert-red hover:bg-alert-red/10 ${FOCUS_RING}`}
          >
            Delete
          </button>
        </div>
      </div>
      <span className="text-xs text-su-muted">
        {entry.value.kind === "activity" ? "Activity recipe" : "Display template"}
      </span>
    </div>
  );
}

export function PresetsSection({
  controller,
  library,
}: {
  controller: SpotsPreferencesController;
  library: SpotsLibraryController;
}) {
  const activityRecipes = listActivityRecipes();
  const displayRecipes = listDisplayRecipes();

  const [preview, setPreview] = useState<PreviewState>(null);
  const [namePrompt, setNamePrompt] = useState<NamePromptState>(null);
  const [nameValue, setNameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SpotsLibraryEntry<PresetRecipe> | null>(null);

  function openPreview(recipe: PresetRecipe) {
    setPreview({ recipe, result: controller.previewPreset(recipe) });
  }

  function handleApply() {
    if (!preview) return;
    controller.applyPreset(preview.recipe);
    setPreview(null);
  }

  function openSavePrompt() {
    setNameValue("");
    setNamePrompt({ mode: "save-new" });
  }

  function openRenamePrompt(entry: SpotsLibraryEntry<PresetRecipe>) {
    setNameValue(entry.value.name);
    setNamePrompt({ mode: "rename", entry });
  }

  async function confirmNamePrompt() {
    const name = nameValue.trim();
    if (!name || !namePrompt) return;
    if (namePrompt.mode === "save-new") {
      const recipe = activityRecipeFromWorkingSpots({
        id: newLibraryId("preset"),
        name,
        spots: controller.spots,
      });
      await library.savePreset(recipe, 0);
    } else {
      const renamed = { ...namePrompt.entry.value, name } as PresetRecipe;
      await library.savePreset(renamed, namePrompt.entry.revision);
    }
    setNamePrompt(null);
  }

  async function handleDuplicate(entry: SpotsLibraryEntry<PresetRecipe>) {
    const duplicate = {
      ...copyPresetRecipe(entry.value),
      id: newLibraryId("preset"),
      name: `${entry.value.name} (copy)`,
    } as PresetRecipe;
    await library.savePreset(duplicate, 0);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await library.deletePreset(deleteTarget);
    setDeleteTarget(null);
  }

  return (
    <section aria-label="Presets" className="space-y-6">
      <LibraryNoticeBar notice={library.notice} onDismiss={library.dismissNotice} />

      <div className="flex flex-wrap items-center gap-3 text-xs text-su-muted">
        {controller.customization.presetName && (
          <span data-testid="active-preset">
            {controller.customization.customized
              ? `${controller.customization.presetName} (Customized)`
              : controller.customization.presetName}
          </span>
        )}
        {controller.canRevert && (
          <button
            type="button"
            onClick={controller.revert}
            className={`min-h-[40px] rounded-lg border border-su-line/40 bg-void-black px-3 py-1.5 text-sm font-medium text-su-text hover:text-plasma-orange ${FOCUS_RING}`}
          >
            Revert last preset application
          </button>
        )}
        {controller.customization.presetId && (
          <button
            type="button"
            onClick={() => controller.resetToBuiltIn(controller.customization.presetId!)}
            className={`min-h-[40px] rounded-lg border border-su-line/40 bg-void-black px-3 py-1.5 text-sm font-medium text-su-text hover:text-plasma-orange ${FOCUS_RING}`}
          >
            Reset to the built-in version
          </button>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold uppercase tracking-wider text-su-muted">
          Activity recipes
        </h4>
        <p className="text-xs text-su-muted">
          An activity recipe changes Spots &amp; Paths only — your current
          layout, projection and camera stay the same.
        </p>
        <div role="list" aria-label="Activity recipes" className="space-y-2">
          {activityRecipes.map((recipe) => (
            <CatalogRow
              key={recipe.id}
              recipe={recipe}
              summary={summarizeActivitySpots(recipe.spots)}
              onSelect={() => openPreview(recipe)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold uppercase tracking-wider text-su-muted">
          Display templates
        </h4>
        <p className="text-xs text-su-muted">
          A display template replaces the whole view — layout, panels, text
          and presentation, not only Spots &amp; Paths.
        </p>
        <div role="list" aria-label="Display templates" className="space-y-2">
          {displayRecipes.map((recipe) => (
            <CatalogRow
              key={recipe.id}
              recipe={recipe}
              summary={summarizeDisplayConfig(recipe.config)}
              onSelect={() => openPreview(recipe)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2 border-t border-su-line/40 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-su-muted">
            Custom presets
          </h4>
          <button
            type="button"
            onClick={openSavePrompt}
            className={`min-h-[40px] rounded-lg bg-plasma-orange px-3 py-1.5 text-sm font-medium text-su-on-accent transition-colors hover:bg-plasma-orange/90 ${FOCUS_RING}`}
          >
            Save as preset
          </button>
        </div>
        {library.presets.length === 0 ? (
          <p className="text-xs text-su-muted">No custom presets saved yet.</p>
        ) : (
          <div role="list" aria-label="Custom presets" className="space-y-2">
            {library.presets.map((entry) => (
              <CustomPresetRow
                key={entry.id}
                entry={entry}
                onSelect={() => openPreview(entry.value)}
                onDuplicate={() => void handleDuplicate(entry)}
                onRename={() => openRenamePrompt(entry)}
                onDelete={() => setDeleteTarget(entry)}
              />
            ))}
          </div>
        )}
      </div>

      <PresetPreviewDialog
        open={preview !== null}
        recipe={preview?.recipe ?? null}
        result={preview?.result ?? null}
        onCancel={() => setPreview(null)}
        onApply={handleApply}
      />

      <AccessibleDialog
        open={namePrompt !== null}
        onClose={() => setNamePrompt(null)}
        title={namePrompt?.mode === "rename" ? "Rename preset" : "Save as preset"}
        size="md"
        chrome="bare"
        panelProps={{
          className:
            "flex w-full max-w-xl max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-2xl border border-su-line/40 bg-su-panel/95 shadow-2xl shadow-black/60",
        }}
      >
        {/*
         * `chrome="bare"` is used deliberately: the default chrome renders a
         * focusable close button ahead of this form in DOM order, and
         * AccessibleDialog's own mount-time focus effect (a
         * requestAnimationFrame call) grabs the first focusable descendant —
         * racing this input's `autoFocus`. If that effect wins the race after
         * the user has started typing, focus lands on a `<button>`, and a
         * later space keystroke activates it (native button behavior),
         * closing the dialog mid-edit. Making the input the first focusable
         * element in this subtree removes the race entirely.
         */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void confirmNamePrompt();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
            <h3 className="font-orbitron text-lg font-bold text-su-text">
              {namePrompt?.mode === "rename" ? "Rename preset" : "Save as preset"}
            </h3>
            <label htmlFor="preset-name-input" className="block text-sm font-medium text-su-text">
              Preset name
            </label>
            <input
              id="preset-name-input"
              type="text"
              value={nameValue}
              onChange={(event) => setNameValue(event.target.value)}
              className={`min-h-[40px] w-full rounded-lg border border-su-line/40 bg-void-black px-3 py-2 text-sm text-su-text ${FOCUS_RING}`}
              autoFocus
            />
          </div>
          <div className="flex shrink-0 justify-end gap-3 border-t border-su-line/40 px-5 py-4 sm:px-6">
            <button
              type="button"
              onClick={() => setNamePrompt(null)}
              className={`min-h-[40px] rounded-lg border border-su-line/40 bg-void-black px-4 py-2 text-sm font-medium text-su-muted transition-colors hover:text-su-text ${FOCUS_RING}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={nameValue.trim().length === 0}
              className={`min-h-[40px] rounded-lg bg-plasma-orange px-4 py-2 text-sm font-medium text-su-on-accent transition-colors disabled:cursor-not-allowed disabled:opacity-40 hover:enabled:bg-plasma-orange/90 ${FOCUS_RING}`}
            >
              Save
            </button>
          </div>
        </form>
      </AccessibleDialog>

      <LibraryConfirmDialog
        open={deleteTarget !== null}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
        title="Delete preset"
        message={
          deleteTarget
            ? `Delete "${deleteTarget.value.name}"? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
      />
    </section>
  );
}
