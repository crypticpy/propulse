import { useEffect } from "react";
import { RegionPresetSelector, Surface } from "propulse";

// isOpen is internal useState(false), no controlling prop. regionPresets
// comes from useMapStore, which seeds DEFAULT_REGION_PRESETS (Europe, DX
// window, etc.) even with no persisted data, so the opened dropdown shows
// real built-in presets. Simulate the operator's click on the trigger.
export function Open() {
  useEffect(() => {
    (document.querySelector('[aria-haspopup="listbox"]') as HTMLElement | null)?.click();
  }, []);
  return (
    <Surface style={{ width: 320, height: 380 }}>
      <RegionPresetSelector onOpenManager={() => {}} />
    </Surface>
  );
}

// Closed trigger as it sits inline in the Pro ribbon.
export function Closed() {
  return (
    <Surface style={{ width: 220 }}>
      <RegionPresetSelector onOpenManager={() => {}} />
    </Surface>
  );
}
