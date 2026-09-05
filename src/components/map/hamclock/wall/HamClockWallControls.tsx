import { useEffect, useRef, useState } from "react";
import { LayersPopover } from "@/components/map/LayersPopover";
import { useHamClockStore } from "@/stores/hamclockStore";
import { useMapStore, type ViewMode } from "@/stores/mapStore";
import { HamClockDisplaySettings } from "../HamClockDisplaySettings";
import { HamClockModeSwitch } from "../HamClockModeSwitch";
import { HamClockProjectionSwitch } from "../HamClockProjectionSwitch";

/**
 * Wall density has no second toolbar row: the desk header's controls collapse
 * into one anchored overflow cluster at the right end of the header, with the
 * exit affordance always visible.
 */
export function HamClockWallControls() {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const hamclockMode = useHamClockStore((s) => s.hamclockMode);
  const setHamclockMode = useHamClockStore((s) => s.setHamclockMode);
  const setPreferredViewMode = useHamClockStore((s) => s.setPreferredViewMode);
  const viewMode = useMapStore((s) => s.viewMode);
  const setViewMode = useMapStore((s) => s.setViewMode);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  const handleProjection = (mode: ViewMode) => {
    setViewMode(mode);
    setPreferredViewMode(mode);
  };

  return (
    <div className="hc-tools" ref={container}>
      <button
        type="button"
        className="hc-tools-btn"
        aria-expanded={open}
        aria-controls="hamclock-wall-controls"
        onClick={() => setOpen((value) => !value)}
      >
        CONTROLS
      </button>
      <button
        type="button"
        className="hc-tools-btn"
        aria-label="Exit HamClock view"
        title="Exit (Esc)"
        onClick={() => useMapStore.getState().setLayoutMode("normal")}
      >
        ✕
      </button>
      {open && (
        <div
          id="hamclock-wall-controls"
          className="hc-tools-menu hamclock-ui"
          role="group"
          aria-label="HamClock controls"
        >
          <HamClockModeSwitch value={hamclockMode} onChange={setHamclockMode} />
          <HamClockProjectionSwitch
            value={viewMode}
            onChange={handleProjection}
          />
          <LayersPopover />
          <HamClockDisplaySettings />
        </div>
      )}
    </div>
  );
}
