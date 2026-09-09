import { useEffect } from "react";
import { WatchPopover, Surface } from "propulse";

// open is internal useState(false), no controlling prop — props are just
// [key: string]: unknown (none used). Simulate the trigger click to reveal
// the watch-criteria form (grid/callsign/band/mode/continent), the same
// panel opened from the Pro ribbon and secondary controls.
export function Open() {
  useEffect(() => {
    (document.querySelector('[aria-haspopup="true"]') as HTMLElement | null)?.click();
  }, []);
  return (
    <Surface style={{ width: 340, height: 460 }}>
      <WatchPopover />
    </Surface>
  );
}

// Closed trigger pill as it sits inline in the toolbar.
export function Closed() {
  return (
    <Surface style={{ width: 160 }}>
      <WatchPopover />
    </Surface>
  );
}
