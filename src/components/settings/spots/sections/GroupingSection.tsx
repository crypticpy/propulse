/**
 * GEO-03/04/05: report grouping controls.
 *
 * Grouping level is a fixed, deterministic choice made here — it never
 * changes with zoom or camera rotation, and a group that grows past the
 * maximum size does not split itself in this release.
 */
import { ConditionalSubSettings, SegmentedButton, SettingSlider } from "../../ui";
import type { GroupingPreferences, SpotsPreferencesController } from "../types";

type GroupingLevel = "regions" | "grid";

function levelFromDetail(detail: GroupingPreferences["detail"]): GroupingLevel {
  return detail === "regions" ? "regions" : "grid";
}

export function GroupingSection({ controller }: { controller: SpotsPreferencesController }) {
  const grouping = controller.spots.grouping;
  const level = levelFromDetail(grouping.detail);
  const enabledId = `${controller.instanceId}-grouping-enabled`;

  return (
    <section aria-label="Report grouping" className="space-y-4">
      <div className="flex items-center justify-between gap-4 min-h-[40px]">
        <div className="flex-1 min-w-0">
          <label htmlFor={enabledId} className="text-sm font-medium text-su-text">
            Group nearby reports
          </label>
          <p className="text-xs text-su-muted mt-0.5">
            When this is off, every mapped report is drawn on its own. Reports at
            the same approximate location may then visually overlap.
          </p>
        </div>
        <button
          id={enabledId}
          type="button"
          role="switch"
          aria-checked={grouping.enabled}
          onClick={() => controller.patchGrouping({ enabled: !grouping.enabled })}
          className={`flex-shrink-0 relative w-11 h-6 min-h-[24px] rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-plasma-orange/60 ${
            grouping.enabled ? "bg-plasma-orange" : "bg-su-panel border border-su-line/40"
          }`}
        >
          <span
            className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-su-on-accent transition-transform ${
              grouping.enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      <div role="group" aria-label="Grouping level" className="space-y-2">
        <span className="block text-sm font-medium text-su-muted">Grouping level</span>
        <SegmentedButton<GroupingLevel>
          value={level}
          onChange={(next) => {
            if (next === "regions") {
              controller.patchGrouping({ detail: "regions" });
            } else if (level !== "grid") {
              controller.patchGrouping({ detail: "grid4" });
            }
          }}
          options={[
            { value: "regions", label: "Regions" },
            { value: "grid", label: "Maidenhead grids" },
          ]}
        />
        <p className="text-xs text-su-muted">
          Regions group reports by country, with U.S. states and Canadian
          provinces/territories broken out where a report's location supports
          that precision. Other countries stay single country groups in this
          release. This choice is fixed: it does not change as you zoom or
          rotate the view, and a group that grows past the maximum size never
          splits on its own in this release.
        </p>

        <ConditionalSubSettings show={level === "grid"}>
          <div role="group" aria-label="Maidenhead grid precision" className="space-y-2">
            <GridPrecisionToggle controller={controller} grouping={grouping} />
          </div>
        </ConditionalSubSettings>
      </div>

      <SettingSlider
        id={`${controller.instanceId}-grouping-min-size`}
        label="Minimum group size"
        description="Below this count, individual mapped reports are drawn instead of a
          group. Label placement never manufactures a more precise position
          than the underlying report has."
        value={grouping.minGroupSize}
        min={2}
        max={50}
        step={1}
        formatValue={(value) => `${value} reports`}
        onChange={(value) => controller.patchGrouping({ minGroupSize: value })}
      />
    </section>
  );
}

function GridPrecisionToggle({
  controller,
  grouping,
}: {
  controller: SpotsPreferencesController;
  grouping: GroupingPreferences;
}) {
  const id = `${controller.instanceId}-grouping-grid6`;
  const checked = grouping.detail === "grid6";
  return (
    <div className="flex items-center justify-between gap-4 min-h-[40px]">
      <div className="flex-1 min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-su-text">
          Use precise six-character grid squares
        </label>
        <p className="text-xs text-su-muted mt-0.5">
          Advanced: only usable for reports precise enough to support it.
          Coarser reports stay in their approximate parent grid group.
        </p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => controller.patchGrouping({ detail: checked ? "grid4" : "grid6" })}
        className={`flex-shrink-0 relative w-11 h-6 min-h-[24px] rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-plasma-orange/60 ${
          checked ? "bg-plasma-orange" : "bg-su-panel border border-su-line/40"
        }`}
      >
        <span
          className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-su-on-accent transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
