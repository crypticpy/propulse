/**
 * FILTER-01/02/03/04/06: the "Activity" section of the detailed Spots & Paths
 * preferences panel. Every write goes through `controller` — this component
 * never touches a store, IndexedDB, or a global preferences API, and it never
 * writes mode selections directly (only through the modeSelection.ts algebra).
 */
import { useEffect, useRef } from "react";
import {
  SPOT_FILTER_BANDS,
  SPOT_SOURCES,
  categoryState,
  filtersAreDefault,
  isAllModesSelected,
  isModeSelected,
  modeCatalog,
  selectAllModes,
  setIncludeInferred,
  setIncludeUnknown,
  summarizeFilters,
  toggleMode,
  toggleModeCategory,
  type CategoryState,
  type ModeCategoryKey,
} from "@/components/settings/spots/modeSelection";
import type { SpotsPreferencesController } from "@/components/settings/spots/types";
import { useDebouncedSliderCommit } from "@/components/settings/spots/useDebouncedSliderCommit";
import { SettingSlider } from "@/components/settings/ui";
import { normalizeModeSelection } from "@/lib/spots/presentation/modes";
import type { FollowStatus } from "@/lib/views/runtime";
import type { SpotSource } from "@/lib/views/presets";

const FOCUS_RING =
  "focus:outline-none focus:ring-2 focus:ring-plasma-orange/60";

const CHECKBOX_CLASSES = `h-4 w-4 rounded border-su-line/40 bg-void-black text-plasma-orange accent-plasma-orange ${FOCUS_RING}`;

function followStatusText(status: FollowStatus): string {
  switch (status) {
    case "active":
      return "Following radio.";
    case "paused-missing-radio":
      return "Follow radio paused — no radio reporting.";
    case "off":
    default:
      return "Follow radio is off.";
  }
}

/** Tri-state checkbox: sets the DOM `indeterminate` property for "partial". */
function TriStateCheckbox({
  id,
  state,
  label,
  onChange,
}: {
  id: string;
  state: CategoryState;
  label: string;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "partial";
  }, [state]);
  return (
    <input
      ref={ref}
      id={id}
      type="checkbox"
      checked={state === "on"}
      aria-checked={state === "partial" ? "mixed" : state === "on"}
      aria-label={`${label} category`}
      onChange={onChange}
      className={CHECKBOX_CLASSES}
    />
  );
}

function Toggle({
  id,
  checked,
  onChange,
  label,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label
      htmlFor={id}
      className="inline-flex min-h-[40px] items-center gap-2 cursor-pointer"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className={CHECKBOX_CLASSES}
      />
      <span className="text-sm text-su-text">{label}</span>
    </label>
  );
}

function Chip({
  id,
  checked,
  label,
  onChange,
}: {
  id: string;
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label
      htmlFor={id}
      className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg border px-3 py-1.5 text-sm cursor-pointer transition-colors ${
        checked
          ? "border-plasma-orange bg-plasma-orange/10 text-plasma-orange"
          : "border-su-line/40 bg-void-black text-su-muted"
      }`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className={`h-4 w-4 rounded border-su-line/40 bg-void-black text-plasma-orange accent-plasma-orange ${FOCUS_RING}`}
      />
      {label}
    </label>
  );
}

export function ActivitySection({
  controller,
}: {
  controller: SpotsPreferencesController;
}) {
  const filters = controller.spots.filters;
  const [maxAgeMinutes, commitMaxAgeMinutes] = useDebouncedSliderCommit(
    filters.maxAgeMinutes,
    (maxAgeMinutes) => controller.patchFilters({ maxAgeMinutes }),
  );
  const [spotLimit, commitSpotLimit] = useDebouncedSliderCommit(
    filters.spotLimit,
    (spotLimit) => controller.patchFilters({ spotLimit }),
  );
  const modes = filters.modes;
  const normalized = normalizeModeSelection(modes);
  const allModes = isAllModesSelected(modes);
  const catalog = modeCatalog();
  // Instance-scoped ids: two panels editing two working copies must never
  // collide on DOM id, or label association breaks for both.
  const uid = (suffix: string) => `activity-${controller.instanceId}-${suffix}`;

  const notesBySource = new Map(
    controller.sourceNotes
      .filter((note) => note.source !== "all-enabled-authorized")
      .map((note) => [note.source as SpotSource, note.message]),
  );

  return (
    <section aria-label="Activity">
      <div className="space-y-6">
        {/* FILTER-01/02: modes and provenance */}
        <div role="group" aria-label="Modes" className="space-y-3">
          <h4 className="text-sm font-semibold text-su-muted uppercase tracking-wider">
            Modes
          </h4>

          <label
            htmlFor={uid("mode-all")}
            className="inline-flex min-h-[40px] items-center gap-2 cursor-pointer"
          >
            <input
              id={uid("mode-all")}
              type="checkbox"
              checked={allModes}
              onChange={() => {
                if (!allModes) {
                  controller.patchFilters({ modes: selectAllModes(modes) });
                }
              }}
              className={CHECKBOX_CLASSES}
            />
            <span className="text-sm text-su-text">All modes</span>
          </label>

          {allModes && (
            <p className="text-xs text-su-muted">
              No specific modes chosen — showing all modes.
            </p>
          )}

          <div className="space-y-3 pl-1">
            {catalog.map(({ key, label, modes: members }) => {
              const state = categoryState(modes, key as ModeCategoryKey);
              const categoryId = uid(`mode-category-${key}`);
              return (
                <div key={key} className="space-y-1.5">
                  <label
                    htmlFor={categoryId}
                    className="inline-flex min-h-[40px] items-center gap-2 cursor-pointer"
                  >
                    <TriStateCheckbox
                      id={categoryId}
                      state={state}
                      label={label}
                      onChange={() =>
                        controller.patchFilters({
                          modes: toggleModeCategory(modes, key as ModeCategoryKey),
                        })
                      }
                    />
                    <span className="text-sm text-su-text">{label}</span>
                  </label>
                  <div className="flex flex-wrap gap-3 pl-6">
                    {members.map((mode) => {
                      const modeId = uid(`mode-${mode}`);
                      return (
                        <label
                          key={mode}
                          htmlFor={modeId}
                          className="inline-flex min-h-[40px] items-center gap-2 cursor-pointer"
                        >
                          <input
                            id={modeId}
                            type="checkbox"
                            checked={isModeSelected(modes, mode)}
                            onChange={() =>
                              controller.patchFilters({
                                modes: toggleMode(modes, mode),
                              })
                            }
                            className={CHECKBOX_CLASSES}
                          />
                          <span className="text-sm text-su-muted">{mode}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-2 pt-1">
            <Toggle
              id={uid("include-unknown")}
              checked={normalized.includeUnknown}
              onChange={(next) =>
                controller.patchFilters({ modes: setIncludeUnknown(modes, next) })
              }
              label="Include unknown modes"
            />
            <p className="text-xs text-su-muted pl-6">
              A generic PHONE report matches Phone but is not asserted to be SSB,
              and a generic DIGITAL report matches Digital but not FT8. Turning
              this off hides reports whose mode could not be identified.
            </p>
            <Toggle
              id={uid("include-inferred")}
              checked={normalized.includeInferred}
              onChange={(next) =>
                controller.patchFilters({ modes: setIncludeInferred(modes, next) })
              }
              label="Include inferred modes"
            />
            <p className="text-xs text-su-muted pl-6">
              Some sources guess a mode instead of reporting one directly.
              Turning this off hides those guessed reports.
            </p>
          </div>
        </div>

        {/* FILTER-03: bands */}
        <div role="group" aria-label="Bands" className="space-y-2">
          <h4 className="text-sm font-semibold text-su-muted uppercase tracking-wider">
            Bands
          </h4>
          <p className="text-xs text-su-muted">
            {filters.bands.length === 0
              ? "No bands chosen — showing all bands."
              : `Showing: ${filters.bands.join(", ")}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            {SPOT_FILTER_BANDS.map((band) => {
              const checked = filters.bands.includes(band);
              return (
                <Chip
                  key={band}
                  id={uid(`band-${band}`)}
                  checked={checked}
                  label={band}
                  onChange={() =>
                    controller.patchFilters({
                      bands: checked
                        ? filters.bands.filter((entry) => entry !== band)
                        : [...filters.bands, band],
                    })
                  }
                />
              );
            })}
          </div>
        </div>

        {/* FILTER-03: sources */}
        <div role="group" aria-label="Sources" className="space-y-2">
          <h4 className="text-sm font-semibold text-su-muted uppercase tracking-wider">
            Sources
          </h4>
          <p className="text-xs text-su-muted">
            {filters.sources.length === 0
              ? "No sources chosen — showing all available sources."
              : `Showing: ${filters.sources
                  .map((source) => (source === "Cluster" ? "DX Cluster" : source))
                  .join(", ")}.`}
          </p>
          <div className="space-y-2">
            {SPOT_SOURCES.map(({ value, label }) => {
              const checked = filters.sources.includes(value);
              const note = notesBySource.get(value);
              return (
                <div key={value} className="space-y-0.5">
                  <Chip
                    id={uid(`source-${value}`)}
                    checked={checked}
                    label={label}
                    onChange={() =>
                      controller.patchFilters({
                        sources: checked
                          ? filters.sources.filter((entry) => entry !== value)
                          : [...filters.sources, value],
                      })
                    }
                  />
                  {note && <p className="text-xs text-su-muted pl-1">{note}</p>}
                </div>
              );
            })}
          </div>
        </div>

        {/* FILTER-03: max report age */}
        <SettingSlider
          id={uid("max-age")}
          label="Maximum report age"
          description="Reports older than this are hidden. Increasing this cannot recover reports a source did not supply."
          value={maxAgeMinutes}
          min={1}
          max={60}
          formatValue={(value) => `${value} min`}
          onChange={commitMaxAgeMinutes}
        />

        {/* FILTER-03: follow radio */}
        <div role="group" aria-label="Follow radio" className="space-y-1.5">
          <Toggle
            id={uid("follow-radio")}
            checked={controller.config.context.followRadio}
            onChange={(next) => controller.setFollowRadio(next)}
            label="Follow radio"
          />
          <p className="text-xs text-su-muted pl-6">
            {followStatusText(controller.followStatus)} Following radio filters
            spots to the band and mode the radio is currently on. Hand-editing
            band or mode filters below turns follow off.
          </p>
        </div>

        {/* FILTER-06: spot limit */}
        <SettingSlider
          id={uid("spot-limit")}
          label="Maximum reports shown"
          description="Counts individual reports, including reports inside clusters, not map hexagons. Raising this cannot recover reports a source did not supply."
          value={spotLimit}
          min={10}
          max={200}
          formatValue={(value) => `${value} reports`}
          onChange={commitSpotLimit}
        />

        {/* FILTER-04: summary and reset */}
        <div className="space-y-2 border-t border-su-line/40 pt-4">
          <p className="text-xs text-su-muted font-mono">
            {summarizeFilters(filters)}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={controller.clearFilters}
              disabled={filtersAreDefault(filters)}
              className={`min-h-[40px] rounded-lg border border-su-line/40 bg-void-black px-3 py-1.5 text-sm font-medium text-su-text transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:text-plasma-orange ${FOCUS_RING}`}
            >
              Clear filters
            </button>
            <p className="text-xs text-su-muted">
              Resets bands, modes, sources, age, and reports shown for this view
              only. Grouping, animation, and your selected preset are unaffected.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
