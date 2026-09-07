import { useMapStore } from "@/stores/mapStore";
import { HamClockDensitySwitch } from "../HamClockDensitySwitch";
import { HamClockButton } from "./controls";

export interface HamClockWallControlsProps {
  /** Opens the single `HamClockSettingsDialog` the parent (`HamClockView`)
   * owns, so density can flip between wall and desk without the dialog's
   * open state getting stranded on an unmounted copy. */
  onOpenSettings: () => void;
}

/** Frequent actions stay in the masthead; mode and projection live in Settings. */
export function HamClockWallControls({
  onOpenSettings,
}: HamClockWallControlsProps) {
  return (
    <div className="hc-tools">
      <HamClockDensitySwitch />
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
