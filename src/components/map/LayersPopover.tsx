/**
 * LayersPopover — Categorized map layer toggle panel
 *
 * Replaces the 8 inline toggle buttons on the PropSphere toolbar with a
 * single "Layers" button that opens a compact popover showing all available
 * map layers organized by category, plus display controls (spot/pin size
 * sliders and high-contrast mode).
 *
 * Follows the same popover pattern as LayoutModeDropdown (relative parent,
 * absolute child, click-outside + Escape dismissal).
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useMapStore } from "@/stores/mapStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUIInteractionPrefs } from "@/stores/userStore";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LayerToggle {
  key: string;
  label: string;
  title: string;
  getValue: () => boolean;
  onToggle: () => void;
}

interface LayerCategory {
  name: string;
  items: LayerToggle[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRotateSpeed(seconds: number): string {
  if (seconds >= 82800) return "Real-time";
  if (seconds >= 3600) return `${Math.round(seconds / 3600)}h/rev`;
  if (seconds >= 60) return `${Math.round(seconds / 60)}m/rev`;
  return `${seconds}s/rev`;
}

// ─── Pill toggle component ────────────────────────────────────────────────────

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

export function LayersPopover() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Map store selectors ──
  const layers = useMapStore((s) => s.layers);
  const toggleLayer = useMapStore((s) => s.toggleLayer);
  const autoRotate = useMapStore((s) => s.autoRotate);
  const setAutoRotate = useMapStore((s) => s.setAutoRotate);
  const autoRotateSpeed = useMapStore((s) => s.autoRotateSpeed);
  const setAutoRotateSpeed = useMapStore((s) => s.setAutoRotateSpeed);
  const displayDensity = useMapStore((s) => s.displayDensity);
  const setDisplayDensity = useMapStore((s) => s.setDisplayDensity);
  const viewMode = useMapStore((s) => s.viewMode);
  const layoutMode = useMapStore((s) => s.layoutMode);

  // Auto-Rotate only applies to the 3D globe — hide in flat/azimuthal/hamclock
  const isGlobeView = viewMode === "globe" && layoutMode !== "hamclock";

  // ── Settings store selectors ──
  const uiPrefs = useUIInteractionPrefs();
  const spotDotScale = uiPrefs.spotDotScale ?? 1.0;
  const mapPinScale = uiPrefs.mapPinScale ?? 1.0;
  const labelScale = uiPrefs.labelScale ?? 1.0;
  const updateUIInteraction = useSettingsStore((s) => s.updateUIInteraction);

  // ── Active layer count (for badge) ──
  const activeCount =
    Object.values(layers).filter(Boolean).length + (autoRotate ? 1 : 0);

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

  // ── Slider handlers ──
  const handleSpotChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateUIInteraction({ spotDotScale: parseFloat(e.target.value) });
    },
    [updateUIInteraction],
  );

  const handlePinChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateUIInteraction({ mapPinScale: parseFloat(e.target.value) });
    },
    [updateUIInteraction],
  );

  const handleLabelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateUIInteraction({ labelScale: parseFloat(e.target.value) });
    },
    [updateUIInteraction],
  );

  const handleDensityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDisplayDensity(parseInt(e.target.value, 10));
    },
    [setDisplayDensity],
  );

  // ── Category definitions ──
  const categories: LayerCategory[] = [
    {
      name: "Illumination",
      items: [
        {
          key: "terminator",
          label: "Day/Night",
          title: "Show the day/night boundary on Earth",
          getValue: () => layers.terminator,
          onToggle: () => toggleLayer("terminator"),
        },
        {
          key: "greyline",
          label: "Greyline",
          title: "Dawn/dusk zone \u2014 enhanced low-band propagation",
          getValue: () => layers.greyline,
          onToggle: () => toggleLayer("greyline"),
        },
        {
          key: "nightLights",
          label: "City Lights",
          title: "City lights visible on the dark side",
          getValue: () => layers.nightLights,
          onToggle: () => toggleLayer("nightLights"),
        },
      ],
    },
    {
      name: "Activity",
      items: [
        {
          key: "spots",
          label: "Live Spots",
          title: "Real-time DX spots from PSKReporter, RBN, and clusters",
          getValue: () => layers.spots,
          onToggle: () => toggleLayer("spots"),
        },
        {
          key: "satellites",
          label: "Satellites",
          title: "Track amateur radio satellites with pass predictions",
          getValue: () => layers.satellites,
          onToggle: () => toggleLayer("satellites"),
        },
      ],
    },
    {
      name: "QSO Log",
      items: [
        {
          key: "contestQsos",
          label: "Contest QSOs",
          title:
            "Arcs from home station to each contest contact, multipliers highlighted",
          getValue: () => layers.contestQsos,
          onToggle: () => toggleLayer("contestQsos"),
        },
        {
          key: "loggedQsos",
          label: "Logged QSOs",
          title: "Arcs from home station to logged contacts from your logbook",
          getValue: () => layers.loggedQsos,
          onToggle: () => toggleLayer("loggedQsos"),
        },
      ],
    },
    {
      name: "Hazards",
      items: [
        {
          key: "earthquakes",
          label: "Earthquakes",
          title: "Recent M2.5+ earthquakes worldwide (USGS)",
          getValue: () => layers.earthquakes,
          onToggle: () => toggleLayer("earthquakes"),
        },
        {
          key: "weather",
          label: "Weather Alerts",
          title: "Active NOAA weather warnings and advisories",
          getValue: () => layers.weather,
          onToggle: () => toggleLayer("weather"),
        },
        {
          key: "lightning",
          label: "Lightning",
          title: "Real-time lightning strikes worldwide (Blitzortung)",
          getValue: () => layers.lightning,
          onToggle: () => toggleLayer("lightning"),
        },
      ],
    },
    {
      name: "Propagation",
      items: [
        {
          key: "muf",
          label: "MUF",
          title:
            "Maximum Usable Frequency \u2014 highest frequency the ionosphere reflects",
          getValue: () => layers.muf,
          onToggle: () => toggleLayer("muf"),
        },
        {
          key: "aurora",
          label: "Aurora",
          title: "Northern/Southern Lights \u2014 affects VHF propagation",
          getValue: () => layers.aurora,
          onToggle: () => toggleLayer("aurora"),
        },
        {
          key: "wspr",
          label: "WSPR Paths",
          title:
            "Weak Signal Propagation Reporter \u2014 TX/RX paths showing real-time propagation",
          getValue: () => layers.wspr,
          onToggle: () => toggleLayer("wspr"),
        },
      ],
    },
    {
      name: "Reference",
      items: [
        {
          key: "labels",
          label: "Labels",
          title: "Country borders, state lines, and city names",
          getValue: () => layers.labels,
          onToggle: () => toggleLayer("labels"),
        },
        ...(isGlobeView
          ? [
              {
                key: "autoRotate",
                label: "Auto-Rotate",
                title: "Slowly spin the globe for a continuous overview",
                getValue: () => autoRotate,
                onToggle: () => setAutoRotate(!autoRotate),
              },
            ]
          : []),
      ],
    },
  ];

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
        {/* Stacked layers icon */}
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
          <path d="M7 1.5L1.5 4.5L7 7.5L12.5 4.5L7 1.5Z" />
          <path d="M1.5 7L7 10L12.5 7" />
          <path d="M1.5 9.5L7 12.5L12.5 9.5" />
        </svg>
        Layers
        <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-white/10 text-[10px] leading-none font-medium text-white/70">
          {activeCount}
        </span>
      </button>

      {/* ── Popover panel ── */}
      <div
        className={`absolute top-full left-0 mt-1.5 w-[280px] z-50 bg-void-black/90 backdrop-blur-md border border-white/10 rounded-xl shadow-xl p-3 max-h-[70vh] overflow-y-auto transition-all duration-150 ${
          open
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-1 pointer-events-none"
        }`}
        role="group"
        aria-label="Map layers"
      >
        {/* ── Layer categories ── */}
        {categories.map((category, catIdx) => (
          <div key={category.name}>
            {/* Category header */}
            {catIdx > 0 && <div className="border-t border-white/5 my-2" />}
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-1.5 px-0.5">
              {category.name}
            </div>

            {/* Toggle rows */}
            {category.items.map((item) => {
              const active = item.getValue();
              return (
                <div
                  key={item.key}
                  title={item.title}
                  className="flex items-center h-8 px-0.5 rounded hover:bg-white/5 transition-colors cursor-pointer"
                  onClick={item.onToggle}
                >
                  {/* Status dot */}
                  <span
                    className={`w-1.5 h-1.5 rounded-full mr-2.5 shrink-0 transition-colors ${
                      active ? "bg-signal-green" : "bg-white/20"
                    }`}
                  />
                  {/* Label */}
                  <span
                    className={`flex-1 text-xs transition-colors ${
                      active ? "text-white" : "text-white/60"
                    }`}
                  >
                    {item.label}
                  </span>
                  {/* Pill toggle */}
                  <PillToggle
                    checked={active}
                    onChange={item.onToggle}
                    label={item.label}
                  />
                </div>
              );
            })}
          </div>
        ))}

        {/* Auto-rotate speed control */}
        {isGlobeView && autoRotate && (
          <div className="flex items-center h-8 px-2">
            <span className="text-xs text-white/60 w-[52px] shrink-0">
              Speed
            </span>
            <input
              type="range"
              min={Math.log(60)}
              max={Math.log(86400)}
              step={0.01}
              value={Math.log(autoRotateSpeed)}
              onChange={(e) => {
                const seconds = Math.round(
                  Math.exp(parseFloat(e.target.value)),
                );
                setAutoRotateSpeed(seconds);
              }}
              onClick={(e) => e.stopPropagation()}
              className="layers-popover-slider flex-1 mx-2"
              aria-label="Auto-rotate speed"
            />
            <span className="text-[10px] font-mono text-white/50 w-14 text-right shrink-0 tabular-nums">
              {formatRotateSpeed(autoRotateSpeed)}
            </span>
          </div>
        )}

        {/* ── Display section ── */}
        <div className="border-t border-white/5 my-2" />
        <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-1.5 px-0.5">
          Display
        </div>

        {/* Spot Size slider */}
        <div className="flex items-center h-8 px-0.5 mt-1">
          <span className="text-xs text-white/60 w-[72px] shrink-0">
            Spot Size
          </span>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={spotDotScale}
            onChange={handleSpotChange}
            onClick={(e) => e.stopPropagation()}
            className="layers-popover-slider flex-1 mx-2 focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-0"
            aria-label="Spot dot size scale"
          />
          <span className="text-[10px] font-mono text-white/50 w-7 text-right shrink-0">
            {spotDotScale.toFixed(1)}&times;
          </span>
        </div>

        {/* Pin Size slider */}
        <div className="flex items-center h-8 px-0.5">
          <span className="text-xs text-white/60 w-[72px] shrink-0">
            Pin Size
          </span>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={mapPinScale}
            onChange={handlePinChange}
            onClick={(e) => e.stopPropagation()}
            className="layers-popover-slider flex-1 mx-2 focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-0"
            aria-label="Map pin size scale"
          />
          <span className="text-[10px] font-mono text-white/50 w-7 text-right shrink-0">
            {mapPinScale.toFixed(1)}&times;
          </span>
        </div>

        {/* Label Size slider */}
        <div className="flex items-center h-8 px-0.5">
          <span className="text-xs text-white/60 w-[72px] shrink-0">
            Label Size
          </span>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={labelScale}
            onChange={handleLabelChange}
            onClick={(e) => e.stopPropagation()}
            className="layers-popover-slider flex-1 mx-2 focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-0"
            aria-label="Spot label size scale"
          />
          <span className="text-[10px] font-mono text-white/50 w-7 text-right shrink-0">
            {labelScale.toFixed(1)}&times;
          </span>
        </div>

        {/* Arc Density slider */}
        <div className="flex items-center h-8 px-0.5">
          <span className="text-xs text-white/60 w-[72px] shrink-0">
            Arc Density
          </span>
          <input
            type="range"
            min="10"
            max="200"
            step="10"
            value={displayDensity}
            onChange={handleDensityChange}
            onClick={(e) => e.stopPropagation()}
            className="layers-popover-slider flex-1 mx-2 focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-0"
            aria-label="Maximum number of spot arcs to display"
          />
          <span className="text-[10px] font-mono text-white/50 w-7 text-right shrink-0">
            {displayDensity}
          </span>
        </div>

        {/* Inline slider styles */}
        <style>{`
            .layers-popover-slider {
              -webkit-appearance: none;
              appearance: none;
              height: 3px;
              background: rgba(255, 255, 255, 0.1);
              border-radius: 2px;
              outline: none;
            }
            .layers-popover-slider::-webkit-slider-thumb {
              -webkit-appearance: none;
              appearance: none;
              width: 10px;
              height: 10px;
              border-radius: 50%;
              background: #d1d5db;
              cursor: pointer;
              border: none;
              transition: background 0.15s;
            }
            .layers-popover-slider::-webkit-slider-thumb:active {
              background: #ffffff;
            }
            .layers-popover-slider::-moz-range-thumb {
              width: 10px;
              height: 10px;
              border-radius: 50%;
              background: #d1d5db;
              cursor: pointer;
              border: none;
              transition: background 0.15s;
            }
            .layers-popover-slider::-moz-range-thumb:active {
              background: #ffffff;
            }
            .layers-popover-slider::-moz-range-track {
              height: 3px;
              background: rgba(255, 255, 255, 0.1);
              border-radius: 2px;
              border: none;
            }
          `}</style>
      </div>
    </div>
  );
}
