import { useHamClockStore } from "@/stores/hamclockStore";
import { useMapStore, type ViewMode } from "@/stores/mapStore";
import { HamClockDensitySwitch } from "../HamClockDensitySwitch";
import { HamClockModeSwitch } from "../HamClockModeSwitch";
import { HamClockProjectionSwitch } from "../HamClockProjectionSwitch";
import { HamClockButton } from "./controls";

export interface HamClockWallControlsProps {
  /** Opens the single `HamClockSettingsDialog` the parent (`HamClockView`)
   * owns, so density can flip between wall and desk without the dialog's
   * open state getting stranded on an unmounted copy. */
  onOpenSettings: () => void;
}

/**
 * Wall density has no second toolbar row, so the desk header's controls
 * collapse into one row at the right end of the header: mode · WALL | DESK ·
 * projection · SETTINGS · exit — the same fixed slot and order as the desk
 * header (B1/HW-22). The CONTROLS anchored menu that used to hold
 * `LayersPopover` is gone (B6/HW-21): Layers now lives in
 * `HamClockSettingsDialog`'s Layers tab, reachable through SETTINGS, so
 * there is no second menu competing with the dialog for the same job.
 */
export function HamClockWallControls({
  onOpenSettings,
}: HamClockWallControlsProps) {
  const hamclockMode = useHamClockStore((s) => s.hamclockMode);
  const setHamclockMode = useHamClockStore((s) => s.setHamclockMode);
  const setPreferredViewMode = useHamClockStore((s) => s.setPreferredViewMode);
  const viewMode = useMapStore((s) => s.viewMode);
  const setViewMode = useMapStore((s) => s.setViewMode);

  const handleProjection = (mode: ViewMode) => {
    setViewMode(mode);
    setPreferredViewMode(mode);
  };

  return (
    <div className="hc-tools">
      <HamClockModeSwitch value={hamclockMode} onChange={setHamclockMode} />
      <HamClockDensitySwitch />
      <HamClockProjectionSwitch value={viewMode} onChange={handleProjection} />
      <HamClockButton onClick={onOpenSettings}>SETTINGS</HamClockButton>
      <button
        type="button"
        className="hc-tools-btn"
        aria-label="Exit HamClock view"
        title="Exit (Esc)"
        onClick={() => useMapStore.getState().setLayoutMode("normal")}
      >
        ✕
      </button>
    </div>
  );
}
