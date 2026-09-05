import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  HAMCLOCK_DENSITIES,
  HAMCLOCK_PANELS,
  HAMCLOCK_UNITS,
  useHamClockDisplayStore,
  type HamClockDensity,
  type HamClockUnits,
} from "@/stores/hamclockDisplayStore";
import { HamClockThemePicker } from "./HamClockThemePicker";

const DENSITY_LABEL: Record<HamClockDensity, string> = {
  wall: "Wall",
  desk: "Desk",
};
const UNITS_LABEL: Record<HamClockUnits, string> = {
  auto: "Auto",
  imperial: "Imperial",
  metric: "Metric",
};

export function HamClockDisplaySettings() {
  const [open, setOpen] = useState(false);
  const [needsScroll, setNeedsScroll] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const s = useHamClockDisplayStore();
  const menu = useRef<HTMLElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  useLayoutEffect(() => {
    if (!open) return;
    const placeMenu = () => {
      const anchor = button.current?.getBoundingClientRect();
      const box = menu.current?.getBoundingClientRect();
      if (!anchor || !box) return;
      setPosition({
        left: Math.max(
          8,
          Math.min(anchor.right - box.width, window.innerWidth - box.width - 8),
        ),
        top: Math.max(
          8,
          Math.min(anchor.bottom + 8, window.innerHeight - box.height - 8),
        ),
      });
    };
    placeMenu();
    window.addEventListener("resize", placeMenu);
    return () => window.removeEventListener("resize", placeMenu);
  }, [open, s.textSize, needsScroll]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", escape, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const regions = [
      ...(ref.current
        ?.closest("[data-hamclock-root]")
        ?.querySelectorAll<HTMLElement>("[data-hamclock-scroll]") ?? []),
    ];
    const check = () =>
      setNeedsScroll(regions.some((e) => e.scrollHeight > e.clientHeight + 2));
    const frame = requestAnimationFrame(check);
    const observer = new ResizeObserver(check);
    regions.forEach((e) => {
      observer.observe(e);
      if (e.firstElementChild) observer.observe(e.firstElementChild);
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [open, s.textSize, s.hiddenPanels, s.smartScaling]);
  return (
    <div className="relative" ref={ref}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="hamclock-display-settings"
        className="rounded border border-white/20 px-2 py-1 text-xs text-gray-200 hover:bg-white/10"
        onClick={() => setOpen(!open)}
      >
        Display
      </button>
      {open && (
        <section
          ref={menu}
          id="hamclock-display-settings"
          aria-label="HamClock display settings"
          style={{
            width: "calc(320px * var(--hamclock-scale, 1))",
            ...position,
          }}
          className="fixed z-50 max-w-[90vw] max-h-[75vh] overflow-auto rounded-lg border border-white/20 bg-deep-space p-4 text-sm text-gray-200 shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <strong>Display settings</strong>
            <button
              type="button"
              aria-label="Close display settings"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
          <label className="mb-3 flex items-center justify-between gap-3">
            Density
            <select
              aria-label="Density"
              value={s.density}
              onChange={(e) =>
                s.setDensity(e.target.value as HamClockDensity)
              }
              className="rounded border border-white/20 bg-void-black p-1"
            >
              {HAMCLOCK_DENSITIES.map((value) => (
                <option key={value} value={value}>
                  {DENSITY_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
          <p className="mb-3 text-xs text-gray-400">
            Wall is the full-bleed map with tile rails for a TV read from
            across the room. Desk keeps the panel layout.
          </p>
          <HamClockThemePicker />
          <label className="mb-3 flex items-center justify-between gap-3">
            Units
            <select
              aria-label="Units"
              value={s.units}
              onChange={(e) => s.setUnits(e.target.value as HamClockUnits)}
              className="rounded border border-white/20 bg-void-black p-1"
            >
              {HAMCLOCK_UNITS.map((value) => (
                <option key={value} value={value}>
                  {UNITS_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="mb-3 flex items-center justify-between gap-3">
            Text Size
            <select
              aria-label="Text Size"
              value={s.textSize}
              onChange={(e) =>
                s.setTextSize(e.target.value as typeof s.textSize)
              }
              className="rounded border border-white/20 bg-void-black p-1"
            >
              <option value="inherit">Use app setting</option>
              <option value="sm">Small</option>
              <option value="md">Medium</option>
              <option value="lg">Large</option>
              <option value="xl">Extra large</option>
              <option value="200">200%</option>
              <option value="250">250%</option>
            </select>
          </label>
          <label className="mb-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={s.smartScaling}
              onChange={(e) => s.setSmartScaling(e.target.checked)}
            />
            Smart scaling
          </label>
          <p className="mb-4 text-xs text-gray-400">
            Fits panel widths and spacing around your text size. Larger text
            leaves fewer rows visible. Panels remain scrollable when needed.
          </p>
          {needsScroll && (
            <p
              role="status"
              className="mb-3 rounded border border-caution-amber/30 p-2 text-xs text-caution-amber"
            >
              This selection needs scrolling. Choose fewer panels to keep more
              visible at this size.
            </p>
          )}
          <fieldset className="space-y-2">
            <legend className="mb-2 font-semibold">Choose panels</legend>
            {HAMCLOCK_PANELS.map(([id, label]) => (
              <label key={id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!s.hiddenPanels.includes(id)}
                  onChange={() => s.togglePanel(id)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <p className="mt-3 text-xs text-gray-400">
            Changes apply to this display. Map zoom and imagery quality stay
            independent.
          </p>
          <button
            className="mt-3 rounded border border-white/20 px-2 py-1"
            type="button"
            onClick={s.resetDisplay}
          >
            Reset display
          </button>
        </section>
      )}
    </div>
  );
}
