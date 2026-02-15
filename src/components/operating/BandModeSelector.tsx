/**
 * Desktop band/mode selector for the PropSphere toolbar.
 *
 * Displays the active band, mode, and source (CAT/WSJT-X/contest) as
 * compact inline buttons with dropdown popovers for switching.
 */

import { useState, useRef, useEffect } from "react";
import { useOperatingStore } from "@/stores/operatingStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { BandId } from "@/types/user";
import { ALL_UI_MODES, type UIMode } from "@/lib/utils/modeNormalize";
import { BAND_COLORS } from "@/lib/utils/spotColors";

// ─── Constants ──────────────────────────────────────────────────────────────

/** HF bands (160m through 10m) */
const HF_BANDS: BandId[] = [
  "160m",
  "80m",
  "60m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
];

/** VHF/UHF bands */
const VHF_UHF_BANDS: BandId[] = ["6m", "2m", "70cm"];

// ─── Inline chevron SVG ─────────────────────────────────────────────────────

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2.5 3.75L5 6.25L7.5 3.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function bandColor(band: BandId): string {
  return BAND_COLORS[band] ?? BAND_COLORS.default;
}

/** Convert a hex color to an rgba() string at a given alpha. */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── Source badge config ────────────────────────────────────────────────────

const SOURCE_BADGES: Record<
  string,
  { label: string; dotClass: string; textClass: string }
> = {
  cat: {
    label: "CAT",
    dotClass: "bg-green-400",
    textClass: "text-green-400",
  },
  wsjtx: {
    label: "WSJT",
    dotClass: "bg-cyan-400",
    textClass: "text-cyan-400",
  },
  contest: {
    label: "CTX",
    dotClass: "bg-amber-400",
    textClass: "text-amber-400",
  },
};

// ─── Component ──────────────────────────────────────────────────────────────

type PopoverKind = "band" | "mode" | null;

export function BandModeSelector({ className }: { className?: string }) {
  const activeBand = useOperatingStore((s) => s.activeBand);
  const activeMode = useOperatingStore((s) => s.activeMode);
  const activeSource = useOperatingStore((s) => s.activeSource);
  const catOverridden = useOperatingStore((s) => s.catOverridden);
  const catConnected = useOperatingStore((s) => s._catConnected);
  const favoredBands = useSettingsStore((s) => s.favoredBands);

  const [openPopover, setOpenPopover] = useState<PopoverKind>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const bandBtnRef = useRef<HTMLButtonElement>(null);
  const modeBtnRef = useRef<HTMLButtonElement>(null);

  // ── Click-outside & Escape handling ─────────────────────────────────────

  useEffect(() => {
    if (openPopover === null) return;

    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpenPopover(null);
      }
    }

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenPopover(null);
      }
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [openPopover]);

  // ── Handlers ────────────────────────────────────────────────────────────

  function togglePopover(kind: PopoverKind) {
    setOpenPopover((prev) => (prev === kind ? null : kind));
  }

  function selectBand(band: BandId) {
    useOperatingStore.getState().setManualBand(band);
    setOpenPopover(null);
  }

  function selectMode(mode: UIMode) {
    useOperatingStore.getState().setManualMode(mode);
    setOpenPopover(null);
  }

  function handleResumeCat() {
    useOperatingStore.getState().resumeCATFollow();
  }

  // ── Derived values ──────────────────────────────────────────────────────

  const color = bandColor(activeBand);
  const primarySet = new Set(favoredBands?.primary ?? []);
  const hiddenSet = new Set(favoredBands?.hidden ?? []);
  const sourceBadge = SOURCE_BADGES[activeSource];

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center gap-1.5 ${className ?? ""}`}
    >
      {/* ── Band button ──────────────────────────────────────────────── */}
      <button
        ref={bandBtnRef}
        type="button"
        onClick={() => togglePopover("band")}
        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
        style={{
          backgroundColor: hexToRgba(color, 0.15),
          color: color,
          border: `1px solid ${hexToRgba(color, 0.3)}`,
        }}
      >
        {activeBand}
        <ChevronDown className="opacity-70" />
      </button>

      {/* ── Mode button ──────────────────────────────────────────────── */}
      <button
        ref={modeBtnRef}
        type="button"
        onClick={() => togglePopover("mode")}
        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-gray-300 hover:text-white hover:bg-white/10 border border-transparent transition-colors"
      >
        {activeMode}
        <ChevronDown className="opacity-70" />
      </button>

      {/* ── Source badge ──────────────────────────────────────────────── */}
      {activeSource !== "manual" && sourceBadge && (
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${sourceBadge.dotClass}`}
            />
            <span
              className={`text-[10px] font-medium tracking-wide uppercase ${sourceBadge.textClass}`}
            >
              {sourceBadge.label}
            </span>
          </span>

          {catOverridden && catConnected && (
            <button
              type="button"
              onClick={handleResumeCat}
              className="text-[10px] font-medium text-gray-400 hover:text-white transition-colors"
            >
              Resume ↩
            </button>
          )}
        </div>
      )}

      {/* ── Band popover ─────────────────────────────────────────────── */}
      {openPopover === "band" && (
        <div className="absolute left-0 top-full mt-1.5 z-50 bg-void-black/95 backdrop-blur-sm border border-white/10 rounded-lg shadow-xl p-2 min-w-[200px]">
          {/* HF bands */}
          <div className="grid grid-cols-4 gap-1">
            {HF_BANDS.map((band) => {
              const bc = bandColor(band);
              const isActive = band === activeBand;
              const isFavored = primarySet.has(band);
              const isHidden = hiddenSet.has(band);

              return (
                <button
                  key={band}
                  type="button"
                  onClick={() => selectBand(band)}
                  className={`
                    relative px-2 py-1.5 rounded text-xs font-medium text-center transition-colors
                    ${isHidden ? "opacity-40" : ""}
                    ${
                      isActive
                        ? "text-white"
                        : "text-gray-400 hover:text-white hover:bg-white/10"
                    }
                  `}
                  style={{
                    borderLeft: `2px solid ${bc}`,
                    ...(isActive
                      ? { backgroundColor: hexToRgba(bc, 0.3) }
                      : {}),
                  }}
                >
                  {band}
                  {isFavored && !isActive && (
                    <span
                      className="absolute top-0.5 right-0.5 h-1 w-1 rounded-full"
                      style={{ backgroundColor: bc }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Separator */}
          <div className="border-t border-white/10 my-1.5" />

          {/* VHF/UHF bands */}
          <div className="grid grid-cols-4 gap-1">
            {VHF_UHF_BANDS.map((band) => {
              const bc = bandColor(band);
              const isActive = band === activeBand;
              const isFavored = primarySet.has(band);
              const isHidden = hiddenSet.has(band);

              return (
                <button
                  key={band}
                  type="button"
                  onClick={() => selectBand(band)}
                  className={`
                    relative px-2 py-1.5 rounded text-xs font-medium text-center transition-colors
                    ${isHidden ? "opacity-40" : ""}
                    ${
                      isActive
                        ? "text-white"
                        : "text-gray-400 hover:text-white hover:bg-white/10"
                    }
                  `}
                  style={{
                    borderLeft: `2px solid ${bc}`,
                    ...(isActive
                      ? { backgroundColor: hexToRgba(bc, 0.3) }
                      : {}),
                  }}
                >
                  {band}
                  {isFavored && !isActive && (
                    <span
                      className="absolute top-0.5 right-0.5 h-1 w-1 rounded-full"
                      style={{ backgroundColor: bc }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Mode popover ─────────────────────────────────────────────── */}
      {openPopover === "mode" && (
        <div className="absolute left-0 top-full mt-1.5 z-50 bg-void-black/95 backdrop-blur-sm border border-white/10 rounded-lg shadow-xl p-2 min-w-[200px]">
          <div className="grid grid-cols-4 gap-1">
            {ALL_UI_MODES.map((mode) => {
              const isActive = mode === activeMode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => selectMode(mode)}
                  className={`
                    px-2 py-1.5 rounded text-xs font-medium text-center transition-colors
                    ${
                      isActive
                        ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/30"
                        : "text-gray-400 hover:text-white hover:bg-white/10 border border-transparent"
                    }
                  `}
                >
                  {mode}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
