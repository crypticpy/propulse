/**
 * SP-08 named-view library surface for the Presets panel.
 *
 * All writes go through `library` (SpotsLibraryController); all working-copy
 * state comes from `controller` (SpotsPreferencesController). This component
 * never reads a store, IndexedDB or HTTP directly, and never marks the
 * working copy saved on a non-"saved" write outcome.
 */
import { useCallback, useEffect, useState } from "react";
import type { PresetRecipe, SavedView } from "@/lib/views/contracts";
import { getBuiltInRecipeIfKnown } from "@/lib/views/presets";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { SectionHeader } from "@/components/settings/ui/SectionHeader";
import { LibraryNoticeBar } from "./LibraryNoticeBar";
import { StatusStrip } from "./StatusStrip";
import type { SpotsLibraryController } from "./useSpotsLibrary";
import type { SpotsLibraryEntry, SpotsPreferencesController } from "./types";

const FOCUS_RING = "focus:outline-none focus:ring-2 focus:ring-plasma-orange/60";
const ROW_BUTTON = `min-h-[40px] rounded-lg border border-su-line/40 bg-void-black px-3 py-1.5 text-xs font-medium text-su-text transition-colors hover:bg-su-line/20 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const ROW_BUTTON_DANGER = `min-h-[40px] rounded-lg border border-alert-red/30 bg-void-black px-3 py-1.5 text-xs font-medium text-alert-red transition-colors hover:bg-alert-red/10 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const PRIMARY_BUTTON = `min-h-[40px] rounded-lg bg-plasma-orange px-4 py-2 text-sm font-medium text-su-on-accent transition-colors hover:bg-plasma-orange/90 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const SECONDARY_BUTTON = `min-h-[40px] rounded-lg border border-su-line/40 bg-void-black px-4 py-2 text-sm font-medium text-su-muted transition-colors hover:text-su-text ${FOCUS_RING}`;

type NamePromptMode = "create" | "duplicate" | "rename";

interface NamePromptState {
  mode: NamePromptMode;
  entry: SpotsLibraryEntry<SavedView> | null;
  initialName: string;
}

const NAME_PROMPT_TITLE: Record<NamePromptMode, string> = {
  create: "Save as new view",
  duplicate: "Duplicate view",
  rename: "Rename view",
};

const NAME_PROMPT_SUBMIT_LABEL: Record<NamePromptMode, string> = {
  create: "Save",
  duplicate: "Duplicate",
  rename: "Rename",
};

/** Name of the built-in or custom recipe a saved view was created from, if any. */
function recipeLabelFor(
  entry: SpotsLibraryEntry<SavedView>,
  presets: SpotsLibraryEntry<PresetRecipe>[],
): string | null {
  const ref = entry.value.sourcePreset;
  if (!ref) return null;
  const builtIn = getBuiltInRecipeIfKnown(ref.id);
  if (builtIn) return builtIn.name;
  const custom = presets.find((preset) => preset.id === ref.id);
  return custom?.value.name ?? null;
}

function NamePromptDialog({
  prompt,
  onCancel,
  onSubmit,
}: {
  prompt: NamePromptState;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(prompt.initialName);
  const trimmed = name.trim();
  return (
    <AccessibleDialog open onClose={onCancel} title={NAME_PROMPT_TITLE[prompt.mode]} size="md">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed) onSubmit(trimmed);
        }}
        className="flex flex-col gap-4"
      >
        <label className="flex flex-col gap-1 text-sm text-su-muted">
          View name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={`min-h-[40px] rounded-lg border border-su-line/40 bg-void-black px-3 py-2 text-sm text-su-text ${FOCUS_RING}`}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>
            Cancel
          </button>
          <button type="submit" disabled={!trimmed} className={PRIMARY_BUTTON}>
            {NAME_PROMPT_SUBMIT_LABEL[prompt.mode]}
          </button>
        </div>
      </form>
    </AccessibleDialog>
  );
}

/**
 * Confirmation built on `AccessibleDialog` rather than the bare `ConfirmDialog`
 * primitive. This surface is opened from inside `SpotsPreferencesPanel`'s own
 * `AccessibleDialog`; both then register on the same module-level dialog
 * stack, so Escape closes only the topmost (this confirmation) instead of
 * bubbling to the outer preferences panel. `ConfirmDialog`'s own Escape
 * listener does not participate in that stack.
 */
function LibraryConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  variant = "destructive",
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: "destructive" | "warning";
}) {
  const confirmClass =
    variant === "destructive"
      ? `min-h-[40px] rounded-lg border border-alert-red/30 bg-alert-red/20 px-4 py-2 text-sm font-medium text-alert-red transition-colors hover:bg-alert-red/30 ${FOCUS_RING}`
      : `min-h-[40px] rounded-lg border border-caution-amber/30 bg-caution-amber/20 px-4 py-2 text-sm font-medium text-caution-amber transition-colors hover:bg-caution-amber/30 ${FOCUS_RING}`;
  return (
    <AccessibleDialog open={open} onClose={onCancel} title={title} size="md">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-su-muted">{message}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className={confirmClass}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </AccessibleDialog>
  );
}

export function ViewLibrary({
  controller,
  library,
  onLoadView,
}: {
  controller: SpotsPreferencesController;
  library: SpotsLibraryController;
  /** Host-supplied loader: replaces the working copy with a stored view. */
  onLoadView: (view: SavedView) => void;
}) {
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(controller.savedViewId);
  const [namePrompt, setNamePrompt] = useState<NamePromptState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SpotsLibraryEntry<SavedView> | null>(null);
  const [pendingLoad, setPendingLoad] = useState<SpotsLibraryEntry<SavedView> | null>(null);

  // The provider can be initialized with (or rebound to) an existing saved
  // view; keep the edit-target row in sync with that, not only with this
  // component's own load/save/create actions.
  useEffect(() => {
    setCurrentEntryId(controller.savedViewId);
  }, [controller.savedViewId]);

  const currentEntry = currentEntryId
    ? library.views.find((entry) => entry.id === currentEntryId) ?? null
    : null;
  // A brand-new, never-saved working copy also reports status "saved" (there
  // is no baseline to diverge from yet), so "nothing to save" only applies
  // once there is a current library entry the working copy could diverge
  // from. Otherwise "Save as new view" would be permanently disabled.
  const nothingToSave = controller.status === "saved" && currentEntry !== null;

  const handleNamePromptSubmit = useCallback(
    async (prompt: NamePromptState, name: string) => {
      if (prompt.mode === "create") {
        const record = await library.createView({
          name,
          config: controller.config,
          sourcePreset: controller.appliedPreset,
        });
        if (record) {
          controller.markSaved(record);
          setCurrentEntryId(record.id);
        }
      } else if (prompt.mode === "duplicate" && prompt.entry) {
        await library.duplicateView(prompt.entry, name);
      } else if (prompt.mode === "rename" && prompt.entry) {
        await library.renameView(prompt.entry, name);
      }
      setNamePrompt(null);
    },
    [controller, library],
  );

  const handleSaveChanges = useCallback(async () => {
    if (!currentEntry) return;
    const record = await library.updateView(currentEntry, controller.config, controller.appliedPreset);
    if (record) controller.markSaved(record);
  }, [currentEntry, controller, library]);

  const requestLoad = useCallback(
    (entry: SpotsLibraryEntry<SavedView>) => {
      if (controller.status === "working-changes") {
        setPendingLoad(entry);
        return;
      }
      setCurrentEntryId(entry.id);
      onLoadView(entry.value);
    },
    [controller.status, onLoadView],
  );

  const confirmLoad = useCallback(() => {
    if (!pendingLoad) return;
    setCurrentEntryId(pendingLoad.id);
    onLoadView(pendingLoad.value);
    setPendingLoad(null);
  }, [pendingLoad, onLoadView]);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const ok = await library.deleteView(pendingDelete);
    if (ok && pendingDelete.id === currentEntryId) setCurrentEntryId(null);
    setPendingDelete(null);
  }, [pendingDelete, library, currentEntryId]);

  return (
    <div className="flex flex-col gap-4">
      <StatusStrip controller={controller} />

      <LibraryNoticeBar notice={library.notice} onDismiss={library.dismissNotice} />
      {library.notice?.kind === "conflict" && (
        <button
          type="button"
          onClick={() => {
            void library.refresh();
          }}
          className={SECONDARY_BUTTON}
        >
          Reload the saved view library
        </button>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setNamePrompt({ mode: "create", entry: null, initialName: "" })}
          disabled={nothingToSave}
          className={PRIMARY_BUTTON}
        >
          Save as new view
        </button>
        {nothingToSave && (
          <span className="text-xs text-su-muted">No changes to save.</span>
        )}
      </div>

      <div>
        <SectionHeader>Saved views</SectionHeader>
        {library.loading ? (
          <p className="text-sm text-su-muted">Loading saved views…</p>
        ) : library.views.length === 0 ? (
          <p className="text-sm text-su-muted">
            {library.notice?.kind === "offline"
              ? "The saved view library could not be read."
              : "No saved views yet."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {library.views.map((entry) => {
              const recipeLabel = recipeLabelFor(entry, library.presets);
              const isCurrent = entry.id === currentEntryId;
              return (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-su-line/40 bg-su-panel px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-su-text">{entry.value.name}</p>
                    {recipeLabel && (
                      <p className="truncate text-xs text-su-muted">From {recipeLabel}</p>
                    )}
                    {isCurrent && (
                      <p className="text-xs text-plasma-orange">Current edit target</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {isCurrent && (
                      <button
                        type="button"
                        onClick={() => {
                          void handleSaveChanges();
                        }}
                        disabled={nothingToSave}
                        aria-label={`Save changes to ${entry.value.name}`}
                        className={ROW_BUTTON}
                      >
                        Save changes
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => requestLoad(entry)}
                      aria-label={`Load ${entry.value.name}`}
                      className={ROW_BUTTON}
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setNamePrompt({
                          mode: "duplicate",
                          entry,
                          initialName: `${entry.value.name} copy`,
                        })
                      }
                      aria-label={`Duplicate ${entry.value.name}`}
                      className={ROW_BUTTON}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setNamePrompt({ mode: "rename", entry, initialName: entry.value.name })
                      }
                      aria-label={`Rename ${entry.value.name}`}
                      className={ROW_BUTTON}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(entry)}
                      aria-label={`Delete ${entry.value.name}`}
                      className={ROW_BUTTON_DANGER}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-xs text-su-muted">
          Duplicating a view makes an independent copy — editing the copy never changes the
          original.
        </p>
      </div>

      {namePrompt && (
        <NamePromptDialog
          prompt={namePrompt}
          onCancel={() => setNamePrompt(null)}
          onSubmit={(name) => {
            void handleNamePromptSubmit(namePrompt, name);
          }}
        />
      )}

      <LibraryConfirmDialog
        open={pendingDelete !== null}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          void confirmDelete();
        }}
        title="Delete saved view"
        message={`Delete "${pendingDelete?.value.name ?? ""}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
      />

      <LibraryConfirmDialog
        open={pendingLoad !== null}
        onCancel={() => setPendingLoad(null)}
        onConfirm={confirmLoad}
        title="Discard working changes?"
        message={`Loading "${pendingLoad?.value.name ?? ""}" will discard your unsaved working changes.`}
        confirmLabel="Load"
        cancelLabel="Cancel"
        variant="warning"
      />
    </div>
  );
}
