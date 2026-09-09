import { LiveRegion } from "@/components/ui/LiveRegion";
import { useHamClockStore, type HamClockMode } from "@/stores/hamclockStore";
import { useMapStore, type ViewMode } from "@/stores/mapStore";
import { HamClockSegmented, HamClockToggleRow } from "../controls";
import {
  enabledHeroCriticalLayers,
  formatHeroProjectionChip,
  resolveHeroProjection,
} from "@/lib/map/layerCapabilities";
import { LAYER_REGISTRY } from "@/lib/map/layerRegistry";

const MODES: { value: HamClockMode; label: string }[] = [
  { value: "traffic", label: "ACTIVITY" },
  { value: "satellites", label: "SATELLITES" },
  { value: "weather", label: "WEATHER" },
];
const PROJECTIONS: { value: ViewMode; label: string }[] = [
  { value: "flat", label: "FLAT" },
  { value: "azimuthal", label: "AZIMUTHAL" },
  { value: "globe", label: "3D" },
];

/** The same persisted view choices as the former compact masthead switches. */
export function ViewControls() {
  const mode = useHamClockStore(state => state.hamclockMode);
  const setMode = useHamClockStore(state => state.setHamclockMode);
  const preferredView = useHamClockStore(state => state.preferredViewMode);
  const setPreferredView = useHamClockStore(state => state.setPreferredViewMode);
  const projection = useMapStore(state => state.viewMode);
  const setProjection = useMapStore(state => state.setViewMode);
  const layers = useMapStore(state => state.layers);
  const autoRotate = useMapStore(state => state.autoRotate);
  const setAutoRotate = useMapStore(state => state.setAutoRotate);
  const speed = useMapStore(state => state.autoRotateSpeed);
  const setSpeed = useMapStore(state => state.setAutoRotateSpeed);
  const durationValue = Math.round(speed / (speed >= 3600 ? 3600 : 60));
  const durationUnit = speed >= 3600 ? "hour" : "minute";
  const duration = `${durationValue} ${durationUnit}${durationValue === 1 ? "" : "s"}`;
  // The segmented control is bound to `viewMode`, which the hero-projection
  // force (#625) can silently overrule right after a click — e.g. picking
  // AZIMUTHAL while DRAP is on reverts to 3D and the control snaps back, so
  // the pick reads as dead. The map's own chip explains this, but it sits
  // behind the settings dialog while it's open, so the reason is repeated
  // here (#691 M3).
  const heroProjectionReason = formatHeroProjectionChip(
    resolveHeroProjection(enabledHeroCriticalLayers(layers), preferredView),
    preferredView,
    key => LAYER_REGISTRY[key as keyof typeof LAYER_REGISTRY]?.name ?? key,
    projection,
  );
  return <div className="hcc-tabgrid"><div className="hcc-view-controls">
    <HamClockSegmented label="HamClock mode" value={mode === "bands" ? "traffic" : mode} options={MODES} onChange={setMode} />
    <div className="hcc-seg-wrap-group">
      <HamClockSegmented label="Map projection" value={projection} options={PROJECTIONS} onChange={value => { setProjection(value); setPreferredView(value); }} />
      <LiveRegion as="p" className="hcc-seg-caveat" role="status">{heroProjectionReason || null}</LiveRegion>
    </div>
  </div>
    <HamClockToggleRow label="Auto-rotate" checked={autoRotate} disabled={projection !== "globe"} onChange={setAutoRotate}
      detail="Slowly turns the 3D globe" caveat={projection !== "globe" ? "Select 3D to use auto-rotate" : undefined} />
    <label className="hcc-rotate-speed">
      <span>Rotation speed · one turn every {duration}</span>
      <input type="range" min={Math.log(60)} max={Math.log(86400)} step={0.01} value={Math.log(speed)} disabled={projection !== "globe" || !autoRotate}
        aria-label="Auto-rotate speed" aria-valuetext={`One turn every ${duration}`} onChange={event => setSpeed(Math.round(Math.exp(Number(event.target.value))))} />
      <span className="hcc-rotate-speed-scale"><span>1 minute</span><span>24 hours</span></span>
    </label>
  </div>;
}
