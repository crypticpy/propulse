/**
 * MOTION-01..05: path shape/animation controls.
 *
 * Shape and animation style are independent axes (MOTION-01). Background and
 * selected-path appearance are edited separately; the selected path inherits
 * the background appearance whenever `paths.selected` is null (MOTION-02).
 */
import { ConditionalSubSettings, SegmentedButton, SettingSlider } from "../../ui";
import { useDebouncedSliderCommit } from "../useDebouncedSliderCommit";
import type { PathPreferences, SpotsPreferencesController } from "../types";

type PathAppearance = PathPreferences["background"];

export function PathsMotionSection({ controller }: { controller: SpotsPreferencesController }) {
  const paths = controller.spots.paths;
  const background = paths.background;
  const selected = paths.selected;
  const sameAsBackground = selected === null;
  const selectedValue = selected ?? background;

  const patchBackground = (patch: Partial<PathAppearance>) =>
    controller.patchPaths({ background: { ...background, ...patch } });

  const patchSelected = (patch: Partial<PathAppearance>) => {
    if (selected === null) return;
    controller.patchPaths({ selected: { ...selected, ...patch } });
  };

  const sameAsBackgroundId = `${controller.instanceId}-paths-same-as-background`;
  const reduceMotionId = `${controller.instanceId}-paths-reduce-motion`;

  return (
    <section aria-label="Path shape and motion" className="space-y-6">
      <div role="group" aria-label="Animate scope" className="space-y-2">
        <span className="block text-sm font-medium text-su-muted">Animate</span>
        <SegmentedButton<PathPreferences["animate"]>
          value={paths.animate}
          onChange={(animate) => controller.patchPaths({ animate })}
          options={[
            { value: "new-spots", label: "New spots" },
            { value: "selected-only", label: "Selected path only" },
            { value: "all-displayed", label: "All displayed paths" },
          ]}
        />
        <p className="text-xs text-su-muted">
          With grouping on, background paths for a group's members stay
          suppressed until that group is expanded.
        </p>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-su-text">Background paths</h4>
        <PathAppearanceControls
          idPrefix={`${controller.instanceId}-paths-bg`}
          ariaLabel="Background path timing"
          value={background}
          onChange={patchBackground}
        />
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-su-text">Selected path</h4>
        <Toggle
          id={sameAsBackgroundId}
          label="Same as background paths"
          description="Turn this off to give the selected path its own shape, style
            and timing."
          checked={sameAsBackground}
          onChange={(checked) => {
            if (checked) {
              controller.patchPaths({ selected: null });
            } else {
              controller.patchPaths({ selected: { ...background } });
            }
          }}
        />
        <ConditionalSubSettings show={!sameAsBackground}>
          <PathAppearanceControls
            idPrefix={`${controller.instanceId}-paths-selected`}
            ariaLabel="Selected path timing"
            value={selectedValue}
            onChange={patchSelected}
          />
        </ConditionalSubSettings>
      </div>

      <AnimationBudgetControls controller={controller} paths={paths} />

      <Toggle
        id={reduceMotionId}
        label="Reduce motion"
        description="Your operating system's reduce-motion setting is honored by
          default. Path points stay inspectable even when motion is
          reduced."
        checked={paths.reduceMotion}
        onChange={(reduceMotion) => controller.patchPaths({ reduceMotion })}
      />
    </section>
  );
}

function AnimationBudgetControls({
  controller,
  paths,
}: {
  controller: SpotsPreferencesController;
  paths: PathPreferences;
}) {
  const [maxActive, commitMaxActive] = useDebouncedSliderCommit(
    paths.maxActive,
    (maxActive) => controller.patchPaths({ maxActive }),
  );
  const [maxPending, commitMaxPending] = useDebouncedSliderCommit(
    paths.maxPending,
    (maxPending) => controller.patchPaths({ maxPending }),
  );
  return (
    <div role="group" aria-label="Animation budget" className="space-y-3">
      <SettingSlider
        id={`${controller.instanceId}-paths-max-active`}
        label="Maximum simultaneous animations"
        description="Turn this down on slower devices. When the budget runs out the
          oldest pending animation is dropped — report data is never
          dropped — and 'All displayed paths' keeps its static paths once
          the budget is exhausted."
        value={maxActive}
        min={1}
        max={12}
        step={1}
        formatValue={(value) => `${value}`}
        onChange={commitMaxActive}
      />
      <SettingSlider
        id={`${controller.instanceId}-paths-max-pending`}
        label="Pending animation queue"
        description="How many animations can wait their turn before the oldest
          pending one is dropped. Report data is never dropped."
        value={maxPending}
        min={0}
        max={100}
        step={1}
        formatValue={(value) => `${value}`}
        onChange={commitMaxPending}
      />
    </div>
  );
}

function PathAppearanceControls({
  idPrefix,
  ariaLabel,
  value,
  onChange,
}: {
  idPrefix: string;
  ariaLabel: string;
  value: PathAppearance;
  onChange: (patch: Partial<PathAppearance>) => void;
}) {
  const [travelSeconds, commitTravelSeconds] = useDebouncedSliderCommit(
    value.travelSeconds,
    (travelSeconds) => onChange({ travelSeconds }),
  );
  const [trailSeconds, commitTrailSeconds] = useDebouncedSliderCommit(
    value.trailSeconds,
    (trailSeconds) => onChange({ trailSeconds }),
  );
  const [fadeSeconds, commitFadeSeconds] = useDebouncedSliderCommit(
    value.fadeSeconds,
    (fadeSeconds) => onChange({ fadeSeconds }),
  );
  const [repeatSeconds, commitRepeatSeconds] = useDebouncedSliderCommit(
    value.repeatSeconds,
    (repeatSeconds) => onChange({ repeatSeconds }),
  );
  return (
    <div role="group" aria-label={ariaLabel} className="space-y-3">
      <div className="space-y-2">
        <span className="block text-sm font-medium text-su-muted">Path shape</span>
        <SegmentedButton<PathAppearance["shape"]>
          value={value.shape}
          onChange={(shape) => onChange({ shape })}
          options={[
            { value: "simple-arc", label: "Simple arc" },
            { value: "ionospheric-hops", label: "Ionospheric hops" },
          ]}
        />
        <p className="text-xs text-su-muted">
          Ionospheric hop geometry is illustrative and model-derived — it is
          not a measurement from a live feed.
        </p>
      </div>

      <div className="space-y-2">
        <span className="block text-sm font-medium text-su-muted">Animation style</span>
        <SegmentedButton<PathAppearance["style"]>
          value={value.style}
          onChange={(style) => onChange({ style })}
          options={[
            { value: "off", label: "Off" },
            { value: "quick-sweep", label: "Quick sweep" },
            { value: "traveling-pulse", label: "Traveling pulse" },
            { value: "flowing-dashes", label: "Flowing dashes" },
          ]}
        />
      </div>

      <ConditionalSubSettings show={value.style !== "off"}>
        <div className="space-y-3">
          <SettingSlider
            id={`${idPrefix}-travel`}
            label="Travel duration"
            description="Visual pacing only — not physical radio travel time."
            value={travelSeconds}
            min={0.25}
            max={5}
            step={0.05}
            formatValue={(v) => `${v.toFixed(2)} s`}
            onChange={commitTravelSeconds}
          />
          <SettingSlider
            id={`${idPrefix}-trail`}
            label="Trail persistence"
            value={trailSeconds}
            min={0}
            max={30}
            step={0.5}
            formatValue={(v) => `${v.toFixed(1)} s`}
            onChange={commitTrailSeconds}
          />
          <SettingSlider
            id={`${idPrefix}-fade`}
            label="Fade time"
            value={fadeSeconds}
            min={0}
            max={5}
            step={0.05}
            formatValue={(v) => `${v.toFixed(2)} s`}
            onChange={commitFadeSeconds}
          />
          <SettingSlider
            id={`${idPrefix}-repeat`}
            label="Repeat interval"
            description="Only applies to styles that repeat continuously; it has no
              effect once a style's animation completes just once."
            value={repeatSeconds}
            min={1}
            max={10}
            step={0.5}
            formatValue={(v) => `${v.toFixed(1)} s`}
            onChange={commitRepeatSeconds}
          />
          <Toggle
            id={`${idPrefix}-arrival-pulse`}
            label="Arrival pulse"
            checked={value.arrivalPulse}
            onChange={(arrivalPulse) => onChange({ arrivalPulse })}
          />
          <Toggle
            id={`${idPrefix}-bounce-glow`}
            label="Bounce glow"
            checked={value.bounceGlow}
            onChange={(bounceGlow) => onChange({ bounceGlow })}
          />
        </div>
      </ConditionalSubSettings>
    </div>
  );
}

function Toggle({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 min-h-[40px]">
      <div className="flex-1 min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-su-text">
          {label}
        </label>
        {description && <p className="text-xs text-su-muted mt-0.5">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`flex-shrink-0 relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-plasma-orange/60 ${
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
