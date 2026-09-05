import { useEffect, useRef, useState } from "react";
import { LayersPopover } from "@/components/map/LayersPopover";
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
 * collapse into one anchored overflow cluster at the right end of the
 * header. Mode, density, projection and SETTINGS stay always visible ahead
 * of the cluster — the same fixed slot and order as the desk header (mode ·
 * WALL | DESK · projection · SETTINGS, B1/HW-22) — so switching back to desk
 * density, or reaching settings, is never a menu away. SETTINGS opens the
 * single centered `HamClockSettingsDialog` the parent owns (B5/HW-26), not a
 * popout. The Display tab of that dialog now owns map content and home
 * region, so the CONTROLS trigger only opens Layers — it stays only because
 * B6 has not yet replaced it with the Layers tab; the exit affordance is
 * always visible outside the menu.
 */
export function HamClockWallControls({
  onOpenSettings,
}: HamClockWallControlsProps) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const hamclockMode = useHamClockStore((s) => s.hamclockMode);
  const setHamclockMode = useHamClockStore((s) => s.setHamclockMode);
  const setPreferredViewMode = useHamClockStore((s) => s.setPreferredViewMode);
  const viewMode = useMapStore((s) => s.viewMode);
  const setViewMode = useMapStore((s) => s.setViewMode);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (container.current?.contains(target)) return;
      // LayersPopover portals its menu to document.body; a click inside it
      // belongs to this menu even though it is outside the container.
      if (target?.closest?.("[data-layers-popover]")) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  // Closing on Escape returns the caret to the trigger, so a keyboard
  // operator never loses their place in the header. Attached to document
  // (not the container node) because LayersPopover portals its menu to
  // document.body — outside the container's DOM subtree — so a keydown
  // inside that portal would never reach a container-scoped listener and
  // would instead bubble straight to the window-level exit handler.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const active = document.activeElement as HTMLElement | null;
      const withinContainer = !!container.current?.contains(active);
      const withinLayersPopover = !!active?.closest?.("[data-layers-popover]");
      if (!withinContainer && !withinLayersPopover) return;
      // The window-level handler exits HamClock entirely; closing a menu is
      // the closer meaning of Escape while that menu (or its portalled
      // content) has focus.
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const handleProjection = (mode: ViewMode) => {
    setViewMode(mode);
    setPreferredViewMode(mode);
  };

  return (
    <div className="hc-tools" ref={container}>
      <HamClockModeSwitch value={hamclockMode} onChange={setHamclockMode} />
      <HamClockDensitySwitch />
      <HamClockProjectionSwitch value={viewMode} onChange={handleProjection} />
      <HamClockButton onClick={onOpenSettings}>SETTINGS</HamClockButton>
      <button
        ref={trigger}
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
          <LayersPopover />
        </div>
      )}
    </div>
  );
}
