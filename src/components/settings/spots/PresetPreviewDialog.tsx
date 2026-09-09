/**
 * PRESET-03: shows what a recipe would change before anything is written.
 * Pure presentation — this component never calls `previewPreset` or
 * `applyPreset` itself; the caller supplies the already-computed
 * `ApplyPresetResult` and this dialog only relays the two button intents.
 */
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import type { PresetRecipe } from "@/lib/views/contracts";
import type { ApplyPresetResult, PresetFieldChange } from "@/lib/views/presets";

const FOCUS_RING = "focus:outline-none focus:ring-2 focus:ring-plasma-orange/60";

const EXACT_LABELS: Record<string, string> = {
  "spots.filters.modes.all": "All modes",
  "spots.filters.modes.modes": "Specific modes",
  "spots.filters.modes.categories": "Mode categories",
  "spots.filters.modes.includeUnknown": "Include unknown modes",
  "spots.filters.modes.includeInferred": "Include inferred modes",
  "spots.filters.maxAgeMinutes": "Spot age limit",
  "spots.filters.spotLimit": "Spot limit",
  "spots.filters.bands": "Band filter",
  "spots.filters.sources": "Spot sources",
  "spots.grouping.enabled": "Grouping",
  "spots.grouping.detail": "Grouping detail",
  "spots.grouping.minGroupSize": "Minimum group size",
  "spots.paths.animate": "Motion trigger",
  "spots.paths.reduceMotion": "Reduced motion",
  "spots.paths.maxActive": "Maximum active paths",
  "spots.paths.maxPending": "Maximum pending paths",
  "spots.paths.background.style": "Background path style",
  "spots.paths.background.shape": "Background path shape",
  "spots.paths.selected.style": "Selected path style",
  "spots.paths.selected.shape": "Selected path shape",
  "context.followRadio": "Follow radio",
  "context.followOperatingSession": "Follow operating session",
};

const PREFIX_LABELS: [string, string][] = [
  ["spots.filters.", "Filter"],
  ["spots.grouping.", "Grouping"],
  ["spots.paths.", "Paths & motion"],
  ["presentation.", "Presentation"],
  ["context.", "Context"],
];

/** Human language for a dotted change path; falls back to the raw path. */
function humanizePath(path: string): string {
  const exact = EXACT_LABELS[path];
  if (exact) return exact;
  const prefixMatch = PREFIX_LABELS.find(([prefix]) => path.startsWith(prefix));
  if (prefixMatch) {
    const [prefix, label] = prefixMatch;
    return `${label}: ${path.slice(prefix.length)}`;
  }
  return path;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (typeof value === "string") return value || "(none)";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.length === 0 ? "(none)" : value.map(String).join(", ");
  return JSON.stringify(value);
}

function ChangeRow({ change }: { change: PresetFieldChange }) {
  return (
    <div
      role="listitem"
      className="rounded-lg border border-su-line/40 bg-void-black/40 px-3 py-2 text-sm"
    >
      <div className="font-medium text-su-text">{humanizePath(change.path)}</div>
      <div className="text-su-muted">
        <span>{formatValue(change.before)}</span>
        <span aria-hidden="true"> {"→"} </span>
        <span className="sr-only"> changes to </span>
        <span>{formatValue(change.after)}</span>
      </div>
    </div>
  );
}

export function PresetPreviewDialog({
  open,
  recipe,
  result,
  onCancel,
  onApply,
}: {
  open: boolean;
  recipe: PresetRecipe | null;
  result: ApplyPresetResult | null;
  onCancel: () => void;
  onApply: () => void;
}) {
  const ready = open && recipe !== null && result !== null;

  return (
    <AccessibleDialog
      open={ready}
      onClose={onCancel}
      title={recipe?.name ?? "Preview preset"}
      description={recipe?.kind === "activity" ? "Activity recipe" : "Display template"}
      size="lg"
    >
      {recipe && result && (
        <div className="space-y-5">
          {recipe.kind === "activity" ? (
            <p className="text-sm text-su-text">
              Your current layout, projection and camera stay exactly as they
              are. Only Spots &amp; Paths settings change.
            </p>
          ) : (
            <p className="text-sm text-su-text">
              This is an explicit full view replacement: layout, panels, text
              and presentation will change to match this template.
            </p>
          )}

          {result.changes.length === 0 ? (
            <p
              role="status"
              className="rounded-lg border border-su-line/40 bg-void-black/40 px-3 py-2 text-sm text-su-muted"
            >
              This recipe matches your current settings. Applying it changes
              nothing.
            </p>
          ) : (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-su-muted">
                What will change
              </h3>
              <div
                role="list"
                aria-label={`Changes from ${recipe.name}`}
                className="space-y-2"
              >
                {result.changes.map((change) => (
                  <ChangeRow key={change.path} change={change} />
                ))}
              </div>
            </div>
          )}

          {result.sourceNotes.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-su-muted">
                Source availability
              </h3>
              <ul
                aria-label="Source availability"
                className="space-y-1 text-xs text-su-muted"
              >
                {result.sourceNotes.map((note) => (
                  <li key={note.source}>{note.message}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className={`min-h-[40px] rounded-lg border border-su-line/40 bg-void-black px-4 py-2 text-sm font-medium text-su-muted transition-colors hover:text-su-text ${FOCUS_RING}`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onApply}
              className={`min-h-[40px] rounded-lg bg-plasma-orange px-4 py-2 text-sm font-medium text-su-on-accent transition-colors hover:bg-plasma-orange/90 ${FOCUS_RING}`}
            >
              {result.changes.length === 0 ? "Apply (no changes)" : "Apply"}
            </button>
          </div>
        </div>
      )}
    </AccessibleDialog>
  );
}
