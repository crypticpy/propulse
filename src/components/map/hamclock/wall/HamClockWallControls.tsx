import { useEffect, useRef, useState } from "react";
import { LayersPopover } from "@/components/map/LayersPopover";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import {
  hamClockHomeRegion,
  hamClockProjectionContent,
} from "@/lib/hamclock/displayLayout";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { useHamClockStore } from "@/stores/hamclockStore";
import { useMapStore, type ViewMode } from "@/stores/mapStore";
import { HamClockDensitySwitch } from "../HamClockDensitySwitch";
import { HamClockDisplaySettings } from "../HamClockDisplaySettings";
import { HamClockModeSwitch } from "../HamClockModeSwitch";
import { HamClockProjectionSwitch } from "../HamClockProjectionSwitch";

const MAP_CONTENT_OPTIONS = [
  ["activity", "Activity"],
  ["contacts", "My contacts"],
  ["both", "Both"],
] as const;

/** Activity / My contacts / Both — the same choice the desk header offers,
 * with the same azimuthal restriction, so a wall operator is not sent back to
 * desk density to change what the map plots. */
function WallMapContent() {
  const content = useHamClockDisplayStore((s) => s.mapContent);
  const setMapContent = useHamClockDisplayStore((s) => s.setMapContent);
  const viewMode = useMapStore((s) => s.viewMode);
  const effective = hamClockProjectionContent(viewMode, content);
  return (
    <div
      className="flex rounded border border-white/20 p-0.5"
      role="group"
      aria-label="Map content"
    >
      {MAP_CONTENT_OPTIONS.map(([value, label]) => {
        const blocked = viewMode === "azimuthal" && value !== "activity";
        return (
          <button
            key={value}
            type="button"
            aria-pressed={effective === value}
            disabled={blocked}
            title={blocked ? "Map logged contacts in Flat or 3D" : undefined}
            className={`rounded px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
              effective === value
                ? "bg-signal-green text-void-black"
                : "text-gray-400 hover:bg-white/10"
            }`}
            onClick={() => setMapContent(value)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Re-frame the map on the operator's own QTH. Observatory mode owns the
 * camera, so it is released first, exactly as the desk header does. */
function WallHomeRegion() {
  const location = useActiveLocation();
  const frameHome = useHamClockDisplayStore((s) => s.frameHome);
  return (
    <button
      type="button"
      disabled={!location}
      className="rounded border border-white/20 px-2 py-1 text-xs text-gray-200 hover:bg-white/10 disabled:opacity-40"
      onClick={() => {
        if (!location) return;
        const map = useMapStore.getState();
        if (map.observatoryMode) map.exitObservatory();
        frameHome(hamClockHomeRegion(location.lat, location.lon));
      }}
    >
      Home region
    </button>
  );
}

/**
 * Wall density has no second toolbar row, so the desk header's controls
 * collapse into one anchored overflow cluster at the right end of the
 * header. Mode, density and projection stay always visible ahead of the
 * cluster — the same fixed slot and order as the desk header (B1/HW-22) —
 * so switching back to desk density is never a menu away. The CONTROLS
 * trigger keeps opening the remaining popout content, and the exit
 * affordance is always visible outside the menu.
 */
export function HamClockWallControls() {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const hamclockMode = useHamClockStore((s) => s.hamclockMode);
  const setHamclockMode = useHamClockStore((s) => s.setHamclockMode);
  const setPreferredViewMode = useHamClockStore((s) => s.setPreferredViewMode);
  const viewMode = useMapStore((s) => s.viewMode);
  const setViewMode = useMapStore((s) => s.setViewMode);
  const showMapContent = hamclockMode === "traffic" || hamclockMode === "bands";

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
          {showMapContent && <WallMapContent />}
          <WallHomeRegion />
          <LayersPopover />
          <HamClockDisplaySettings />
        </div>
      )}
    </div>
  );
}
