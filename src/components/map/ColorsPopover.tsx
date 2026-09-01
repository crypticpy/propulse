/**
 * ColorsPopover — Spot coloring mode and visual style controls
 *
 * Replaces the inline "Color: Mode/Band" toggle button with a richer popover
 * that matches the LayersPopover design language. Provides radio-style
 * selection for spot coloring modes (Mode, Band, SNR, Age) plus a
 * PillToggle for high-contrast visual style.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUIInteractionPrefs } from "@/stores/settingsStore";

// ─── Types ────────────────────────────────────────────────────────────────────

type SpotColorMode = "mode" | "band" | "snr" | "age";

interface ColorOption {
  value: SpotColorMode;
  label: string;
  description: string;
  /** CSS gradient or color stops for the preview strip */
  previewColors: string[];
}

// ─── Color mode definitions ───────────────────────────────────────────────────

const COLOR_OPTIONS: ColorOption[] = [
  {
    value: "mode",
    label: "By Mode",
    description: "FT8, CW, SSB, etc.",
    previewColors: ["#06b6d4", "#f59e0b", "#22c55e", "#a855f7"],
  },
  {
    value: "band",
    label: "By Band",
    description: "20m, 40m, 15m, etc.",
    previewColors: ["#3b82f6", "#22c55e", "#ef4444", "#f59e0b"],
  },
  {
    value: "snr",
    label: "By SNR",
    description: "Weak (red) to strong (green)",
    previewColors: ["#ef4444", "#f59e0b", "#22c55e"],
  },
  {
    value: "age",
    label: "By Age",
    description: "New (bright) to old (dim)",
    previewColors: ["#ffffff", "#9ca3af", "#374151"],
  },
];

// ─── Pill toggle component (matching LayersPopover) ───────────────────────────

function PillToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-0 ${
        checked ? "bg-signal-green" : "bg-white/10"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform duration-200 mt-0.5 ${
          checked ? "translate-x-3.5 ml-0" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ColorsPopover() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Settings store selectors ──
  const uiPrefs = useUIInteractionPrefs();
  const spotColorMode = (uiPrefs.spotColorMode ?? "mode") as SpotColorMode;
  const visualStyle = uiPrefs.visualStyle ?? "realistic";
  const updateUIInteraction = useSettingsStore((s) => s.updateUIInteraction);

  // ── Close on click outside ──
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // ── Close on Escape ──
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) setOpen(false);
    },
    [open],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const isHighViz = visualStyle === "high-viz";

  return (
    <div ref={containerRef} className="relative">
      {/* ── Trigger button ── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-0 ${
          open
            ? "bg-white/15 text-white"
            : "text-gray-300 hover:text-white hover:bg-white/10"
        }`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {/* Palette icon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="7" cy="7" r="5.5" />
          <circle cx="5.5" cy="5" r="1" fill="currentColor" stroke="none" />
          <circle cx="8.5" cy="5" r="1" fill="currentColor" stroke="none" />
          <circle cx="5" cy="8" r="1" fill="currentColor" stroke="none" />
          <circle cx="9" cy="8" r="1" fill="currentColor" stroke="none" />
        </svg>
        Colors
      </button>

      {/* ── Popover panel ── */}
      <div
        className={`absolute top-full left-0 mt-1.5 w-[min(280px,calc(100vw-2rem))] z-50 bg-void-black/90 backdrop-blur-md border border-white/10 rounded-xl shadow-xl p-3 max-h-[70vh] overflow-y-auto transition-all duration-150 ${
          open
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-1 pointer-events-none"
        }`}
        role="radiogroup"
        aria-label="Spot coloring mode"
      >
        {/* ── Spot Coloring section ── */}
        <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-1.5 px-0.5">
          Spot Coloring
        </div>

        {COLOR_OPTIONS.map((option) => {
          const isSelected = spotColorMode === option.value;
          return (
            <div
              key={option.value}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-white/5 transition-colors"
              role="radio"
              aria-checked={isSelected}
              onClick={() =>
                updateUIInteraction({ spotColorMode: option.value })
              }
            >
              {/* Radio dot */}
              <span
                className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                  isSelected ? "border-signal-green" : "border-white/30"
                }`}
              >
                {isSelected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-signal-green" />
                )}
              </span>

              {/* Label + description */}
              <div className="flex-1 min-w-0">
                <span
                  className={`text-xs block transition-colors ${
                    isSelected ? "text-white" : "text-white/60"
                  }`}
                >
                  {option.label}
                </span>
                <span className="text-[10px] text-white/30 block">
                  {option.description}
                </span>
              </div>

              {/* Color preview strip */}
              <div className="flex gap-0.5 shrink-0">
                {option.previewColors.map((color, i) => (
                  <span
                    key={i}
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* ── Visual Style section ── */}
        <div className="border-t border-white/5 my-2" />
        <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-1.5 px-0.5">
          Visual Style
        </div>

        <div
          title="Bolder, high-contrast spot markers (2D map only)"
          className="flex items-center h-8 px-0.5 rounded hover:bg-white/5 transition-colors cursor-pointer"
          onClick={() =>
            updateUIInteraction({
              visualStyle: isHighViz ? "realistic" : "high-viz",
            })
          }
        >
          <span
            className={`w-1.5 h-1.5 rounded-full mr-2.5 shrink-0 transition-colors ${
              isHighViz ? "bg-signal-green" : "bg-white/20"
            }`}
          />
          <span
            className={`flex-1 text-xs transition-colors ${
              isHighViz ? "text-white" : "text-white/60"
            }`}
          >
            High Contrast
            <span className="text-white/30 text-[10px] ml-1">2D only</span>
          </span>
          <PillToggle
            checked={isHighViz}
            onChange={() =>
              updateUIInteraction({
                visualStyle: isHighViz ? "realistic" : "high-viz",
              })
            }
            label="High Contrast mode"
          />
        </div>
      </div>
    </div>
  );
}
