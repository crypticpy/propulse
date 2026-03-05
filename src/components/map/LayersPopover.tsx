/**
 * LayersPopover — Cascading two-tier map layer menu
 *
 * A portal-rendered popover that shows layer categories on the left
 * and expands toggle submenus to the right on hover. Escapes parent
 * stacking contexts via createPortal + position:fixed + z-[250].
 *
 * Interaction model:
 * - Click "Layers" button → category list appears
 * - Hover a category → submenu slides in to the right after 80ms intent delay
 * - Move between categories → submenu crossfades
 * - Mouse leaves popover → 200ms grace period before close
 * - Click outside or Escape → close
 */

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useMapStore } from "@/stores/mapStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUIInteractionPrefs } from "@/stores/userStore";
import BasemapCategory from "./layers/BasemapCategory";
import SatelliteFilters from "./layers/SatelliteFilters";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LayerToggle {
  key: string;
  label: string;
  title: string;
  getValue: () => boolean;
  onToggle: () => void;
}

interface CategoryDef {
  id: string;
  name: string;
  icon: ReactNode;
  items: LayerToggle[];
  /** Optional custom submenu renderer (used by Basemap category) */
  renderSubmenu?: () => ReactNode;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRotateSpeed(seconds: number): string {
  if (seconds >= 82800) return "Real-time";
  if (seconds >= 3600) return `${Math.round(seconds / 3600)}h/rev`;
  if (seconds >= 60) return `${Math.round(seconds / 60)}m/rev`;
  return `${seconds}s/rev`;
}

// ─── Category Icons (16×16 viewBox) ──────────────────────────────────────────

const iconClass = "w-4 h-4 shrink-0 text-white/50";

function IconIllumination() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={iconClass}>
      <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.75 3.75l1.06 1.06M11.19 11.19l1.06 1.06M12.25 3.75l-1.06 1.06M4.81 11.19l-1.06 1.06"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconActivity() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={iconClass}>
      <path
        d="M1.5 8h2.5l1.5-4 2 8 2-6 1.5 2h3.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconQsoLog() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={iconClass}>
      <rect
        x="3"
        y="2"
        width="10"
        height="12"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconHazards() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={iconClass}>
      <path
        d="M8 2.5L1.5 13.5h13L8 2.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M8 6.5v3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

function IconPropagation() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={iconClass}>
      <path
        d="M4.5 11.5a5 5 0 017 0"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M2.5 9.5a8 8 0 0111 0"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M6.5 13.5a2 2 0 013 0"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconReference() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={iconClass}>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M8 2.5v11M2.5 8h11"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M3.5 5h9M3.5 11h9"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

function IconBasemap() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={iconClass}>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <ellipse
        cx="8"
        cy="8"
        rx="2.5"
        ry="5.5"
        stroke="currentColor"
        strokeWidth="0.9"
      />
      <path
        d="M2.5 8h11"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconDisplay() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={iconClass}>
      <path
        d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <circle cx="5.5" cy="4.5" r="1.3" fill="currentColor" opacity="0.7" />
      <circle cx="10" cy="8" r="1.3" fill="currentColor" opacity="0.7" />
      <circle cx="7" cy="11.5" r="1.3" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

// ─── Pill toggle ──────────────────────────────────────────────────────────────

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

// ─── Category row ─────────────────────────────────────────────────────────────

function CategoryRow({
  icon,
  label,
  enabledCount,
  totalCount,
  isActive,
  onMouseEnter,
}: {
  icon: ReactNode;
  label: string;
  enabledCount: number;
  totalCount: number;
  isActive: boolean;
  onMouseEnter: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-[7px] cursor-pointer transition-colors duration-100 rounded-md group ${
        isActive ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
      }`}
      onMouseEnter={onMouseEnter}
    >
      {/* Icon */}
      <span className={isActive ? "[&_svg]:text-white/80" : ""}>{icon}</span>

      {/* Label */}
      <span
        className={`flex-1 text-[12px] font-medium transition-colors ${
          isActive ? "text-white" : "text-white/70"
        }`}
      >
        {label}
      </span>

      {/* Count badge */}
      {enabledCount > 0 && (
        <span className="px-1 min-w-[18px] h-[16px] flex items-center justify-center rounded-[4px] bg-white/[0.08] text-[9px] font-semibold tabular-nums text-white/50">
          {enabledCount}/{totalCount}
        </span>
      )}

      {/* Chevron */}
      <svg
        viewBox="0 0 6 10"
        fill="none"
        className={`w-[6px] h-[10px] shrink-0 transition-all duration-100 ${
          isActive
            ? "text-white/60 translate-x-0.5"
            : "text-white/20 group-hover:text-white/40"
        }`}
      >
        <path
          d="M1 1l4 4-4 4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// ─── Submenu toggle row ───────────────────────────────────────────────────────

function ToggleRow({ item }: { item: LayerToggle }) {
  const active = item.getValue();
  return (
    <div
      title={item.title}
      className="flex items-center h-[30px] px-1 rounded hover:bg-white/[0.06] transition-colors cursor-pointer"
      onClick={item.onToggle}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full mr-2 shrink-0 transition-colors ${
          active ? "bg-signal-green" : "bg-white/20"
        }`}
      />
      <span
        className={`flex-1 text-[12px] transition-colors ${
          active ? "text-white" : "text-white/55"
        }`}
      >
        {item.label}
      </span>
      <PillToggle
        checked={active}
        onChange={item.onToggle}
        label={item.label}
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LayersPopover() {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });

  // ── Map store selectors ──
  const layers = useMapStore((s) => s.layers);
  const toggleLayer = useMapStore((s) => s.toggleLayer);
  const autoRotate = useMapStore((s) => s.autoRotate);
  const setAutoRotate = useMapStore((s) => s.setAutoRotate);
  const autoRotateSpeed = useMapStore((s) => s.autoRotateSpeed);
  const setAutoRotateSpeed = useMapStore((s) => s.setAutoRotateSpeed);
  const displayDensity = useMapStore((s) => s.displayDensity);
  const setDisplayDensity = useMapStore((s) => s.setDisplayDensity);
  const labelOptions = useMapStore((s) => s.labelOptions);
  const setLabelOption = useMapStore((s) => s.setLabelOption);
  const gridLabelDetail = useMapStore((s) => s.gridLabelDetail);
  const setGridLabelDetail = useMapStore((s) => s.setGridLabelDetail);
  const viewMode = useMapStore((s) => s.viewMode);
  const layoutMode = useMapStore((s) => s.layoutMode);

  const isGlobeView = viewMode === "globe" && layoutMode !== "hamclock";

  // ── Settings store selectors ──
  const uiPrefs = useUIInteractionPrefs();
  const spotDotScale = uiPrefs.spotDotScale ?? 1.0;
  const mapPinScale = uiPrefs.mapPinScale ?? 1.0;
  const labelScale = uiPrefs.labelScale ?? 1.0;
  const updateUIInteraction = useSettingsStore((s) => s.updateUIInteraction);

  // ── Active count for button badge ──
  const activeCount =
    Object.values(layers).filter(Boolean).length + (autoRotate ? 1 : 0);

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
  const categories: CategoryDef[] = useMemo(
    () => [
      {
        id: "basemap",
        name: "Basemap",
        icon: <IconBasemap />,
        items: [],
        renderSubmenu: () => <BasemapCategory />,
      },
      {
        id: "illumination",
        name: "Illumination",
        icon: <IconIllumination />,
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
        id: "activity",
        name: "Activity",
        icon: <IconActivity />,
        items: [
          {
            key: "spots",
            label: "Live Spots",
            title: "Real-time DX spots from PSKReporter, RBN, and clusters",
            getValue: () => layers.spots,
            onToggle: () => toggleLayer("spots"),
          },
          {
            key: "spotTraces",
            label: "Spot Traces",
            title: "Animated trace lines from transmitter to receiver",
            getValue: () => layers.spotTraces,
            onToggle: () => toggleLayer("spotTraces"),
          },
          {
            key: "ft8Spotter",
            label: "FT8 Spotter",
            title: "Live FT8/FT4 decode visualization on the globe",
            getValue: () => layers.ft8Spotter,
            onToggle: () => toggleLayer("ft8Spotter"),
          },
          {
            key: "satellites",
            label: "Satellites",
            title: "Track amateur radio satellites with pass predictions",
            getValue: () => layers.satellites,
            onToggle: () => toggleLayer("satellites"),
          },
          {
            key: "issTracker",
            label: "ISS Tracker",
            title:
              "Track the International Space Station with enhanced visuals",
            getValue: () => layers.issTracker,
            onToggle: () => toggleLayer("issTracker"),
          },
          {
            key: "gridActivity",
            label: "Grid Activity",
            title:
              "Persistent Maidenhead grid highlights showing recent spot activity",
            getValue: () => layers.gridActivity,
            onToggle: () => toggleLayer("gridActivity"),
          },
          {
            key: "wspr",
            label: "WSPR Paths",
            title: "Weak Signal Propagation Reporter spot arcs colored by band",
            getValue: () => layers.wspr,
            onToggle: () => toggleLayer("wspr"),
          },
          {
            key: "beacons",
            label: "Beacon Network",
            title:
              "NCDXF/IARU 18 beacon stations with active transmission schedule",
            getValue: () => layers.beacons,
            onToggle: () => toggleLayer("beacons"),
          },
          {
            key: "meteorShowers",
            label: "Meteor Showers",
            title: "Active meteor shower radiants and 6m scatter zones",
            getValue: () => layers.meteorShowers,
            onToggle: () => toggleLayer("meteorShowers"),
          },
          {
            key: "spectrumRing",
            label: "Spectrum Waterfall",
            title: "Equatorial ring showing band activity waterfall over time",
            getValue: () => layers.spectrumRing,
            onToggle: () => toggleLayer("spectrumRing"),
          },
          {
            key: "satelliteFootprints",
            label: "Sat Footprints",
            title: "Radio coverage circles for visible satellites",
            getValue: () => layers.satelliteFootprints,
            onToggle: () => toggleLayer("satelliteFootprints"),
          },
        ],
      },
      {
        id: "qsoLog",
        name: "QSO Log",
        icon: <IconQsoLog />,
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
            title:
              "Arcs from home station to logged contacts from your logbook",
            getValue: () => layers.loggedQsos,
            onToggle: () => toggleLayer("loggedQsos"),
          },
        ],
      },
      {
        id: "hazards",
        name: "Hazards",
        icon: <IconHazards />,
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
          {
            key: "fires",
            label: "Active Fires",
            title: "NASA FIRMS fire hotspots worldwide (requires API key)",
            getValue: () => layers.fires,
            onToggle: () => toggleLayer("fires"),
          },
          {
            key: "radar",
            label: "Weather Radar",
            title: "Global precipitation radar overlay (RainViewer)",
            getValue: () => layers.radar,
            onToggle: () => toggleLayer("radar"),
          },
        ],
      },
      {
        id: "propagation",
        name: "Propagation",
        icon: <IconPropagation />,
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
            key: "ionosphere",
            label: "Ionosphere",
            title:
              "Translucent D/E/F1/F2 ionospheric shells \u2014 dayside brighter, responds to solar conditions",
            getValue: () => layers.ionosphere,
            onToggle: () => toggleLayer("ionosphere"),
          },
          {
            key: "rayPath",
            label: "Ray Path",
            title:
              "Multi-hop skip path showing how signals bounce between Earth and ionosphere",
            getValue: () => layers.rayPath,
            onToggle: () => toggleLayer("rayPath"),
          },
          {
            key: "nvis",
            label: "NVIS Coverage",
            title: "Near-Vertical Incidence Skywave coverage dome at your QTH",
            getValue: () => layers.nvis,
            onToggle: () => toggleLayer("nvis"),
          },
          {
            key: "sporadicE",
            label: "Sporadic E",
            title:
              "Sporadic E cloud probability at ionospheric E-layer altitude",
            getValue: () => layers.sporadicE,
            onToggle: () => toggleLayer("sporadicE"),
          },
          {
            key: "drap",
            label: "D-RAP Absorption",
            title:
              "D-Region Absorption Prediction \u2014 HF blackout zones from solar flares",
            getValue: () => layers.drap,
            onToggle: () => toggleLayer("drap"),
          },
          {
            key: "ducting",
            label: "Tropo Ducting",
            title: "Tropospheric ducting probability regions for VHF/UHF",
            getValue: () => layers.ducting,
            onToggle: () => toggleLayer("ducting"),
          },
          {
            key: "noiseFloor",
            label: "HF Noise Floor",
            title:
              "ITU-R P.372 estimated noise levels \u2014 blue (quiet) to red (noisy)",
            getValue: () => layers.noiseFloor,
            onToggle: () => toggleLayer("noiseFloor"),
          },
          {
            key: "geomagField",
            label: "Geomagnetic Field",
            title:
              "Magnetic dipole field lines colored by Kp disturbance level",
            getValue: () => layers.geomagField,
            onToggle: () => toggleLayer("geomagField"),
          },
        ],
      },
      {
        id: "reference",
        name: "Reference",
        icon: <IconReference />,
        items: [
          {
            key: "labels",
            label: "Labels",
            title: "Country borders, state lines, and city names",
            getValue: () => layers.labels,
            onToggle: () => toggleLayer("labels"),
          },
          {
            key: "stateBorders",
            label: "State Borders",
            title: "US state boundary lines",
            getValue: () => labelOptions.stateBorders,
            onToggle: () =>
              setLabelOption("stateBorders", !labelOptions.stateBorders),
          },
          {
            key: "maidenheadGrid",
            label: "Maidenhead Grid",
            title: "Grid lines and field labels on the globe",
            getValue: () => labelOptions.maidenheadGrid,
            onToggle: () =>
              setLabelOption("maidenheadGrid", !labelOptions.maidenheadGrid),
          },
          {
            key: "gridLabels",
            label: "Grid Labels",
            title:
              "Maidenhead grid designators — zoom-adaptive field, square, and subsquare labels",
            getValue: () => labelOptions.gridLabels,
            onToggle: () =>
              setLabelOption("gridLabels", !labelOptions.gridLabels),
          },
          {
            key: "tileLabels",
            label: "Map Labels",
            title:
              "Zoom-dependent city names, roads, and boundaries from OpenStreetMap",
            getValue: () => labelOptions.tileLabels,
            onToggle: () =>
              setLabelOption("tileLabels", !labelOptions.tileLabels),
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
    ],
    [
      layers,
      toggleLayer,
      autoRotate,
      setAutoRotate,
      isGlobeView,
      labelOptions,
      setLabelOption,
    ],
  );

  // "Display" is special — not a toggle list, it has sliders
  const displayCategoryId = "display";

  // All category IDs for iteration
  const allCategoryIds = useMemo(
    () => [...categories.map((c) => c.id), displayCategoryId],
    [categories],
  );

  // ── Enabled counts ──
  const enabledCounts = useMemo(() => {
    const counts: Record<string, { enabled: number; total: number }> = {};
    for (const cat of categories) {
      const enabled = cat.items.filter((i) => i.getValue()).length;
      counts[cat.id] = { enabled, total: cat.items.length };
    }
    // Display section: count band height arcs as the only toggle
    counts[displayCategoryId] = {
      enabled: uiPrefs.bandHeightArcs ? 1 : 0,
      total: 1,
    };
    return counts;
  }, [categories, uiPrefs.bandHeightArcs]);

  // ── Position calculation ──
  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPopoverPos({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
  }, [open]);

  // ── Open/close logic ──
  const openPopover = useCallback(() => {
    setOpen(true);
    // Default to first category
    setActiveCategory(allCategoryIds[0]);
  }, [allCategoryIds]);

  const closePopover = useCallback(() => {
    setOpen(false);
    setActiveCategory(null);
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
  }, []);

  // ── Click outside ──
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      closePopover();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, closePopover]);

  // ── Escape ──
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePopover();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, closePopover]);

  // ── Hover handlers ──
  const handleCategoryHover = useCallback((catId: string) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setActiveCategory(catId);
    }, 80);
  }, []);

  const handlePopoverEnter = useCallback(() => {
    if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
  }, []);

  const handlePopoverLeave = useCallback(() => {
    if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
    leaveTimeoutRef.current = setTimeout(() => {
      closePopover();
    }, 200);
  }, [closePopover]);

  // ── Render submenu content ──
  const activeCategoryDef = categories.find((c) => c.id === activeCategory);

  // ── Submenu: Display section content ──
  const renderDisplaySubmenu = () => (
    <div className="space-y-0.5">
      {/* Arc Mode: Flat Arcs ↔ Ionosphere Bounces */}
      <div
        title={
          (uiPrefs.bandHeightArcs ?? true)
            ? "Showing ionosphere bounces — arcs skip off E/F1/F2 layers by band. Click for flat arcs."
            : "Showing flat arcs on globe surface. Click for ionosphere bounces."
        }
        className="flex items-center h-[30px] px-1 rounded hover:bg-white/[0.06] transition-colors cursor-pointer"
        onClick={() =>
          updateUIInteraction({
            bandHeightArcs: !(uiPrefs.bandHeightArcs ?? true),
          })
        }
      >
        <span
          className={`w-1.5 h-1.5 rounded-full mr-2 shrink-0 transition-colors ${
            (uiPrefs.bandHeightArcs ?? true) ? "bg-signal-green" : "bg-white/20"
          }`}
        />
        <span
          className={`flex-1 text-[12px] transition-colors ${
            (uiPrefs.bandHeightArcs ?? true) ? "text-white" : "text-white/55"
          }`}
        >
          {(uiPrefs.bandHeightArcs ?? true)
            ? "Ionosphere Bounces"
            : "Flat Arcs"}
        </span>
        <PillToggle
          checked={uiPrefs.bandHeightArcs ?? true}
          onChange={() =>
            updateUIInteraction({
              bandHeightArcs: !(uiPrefs.bandHeightArcs ?? true),
            })
          }
          label="Arc mode"
        />
      </div>

      {/* Grid Detail slider (visible when grid labels are on) */}
      {labelOptions.gridLabels && (
        <>
          <div className="flex items-center h-[28px] px-1 mt-1">
            <span className="text-[11px] text-white/50 w-[60px] shrink-0">
              Grid Detail
            </span>
            <input
              type="range"
              min="1"
              max="3"
              step="1"
              value={gridLabelDetail}
              onChange={(e) => setGridLabelDetail(parseInt(e.target.value, 10))}
              onClick={(e) => e.stopPropagation()}
              className="layers-slider flex-1 mx-2"
              aria-label="Grid label detail level"
            />
            <span className="text-[10px] font-mono text-white/40 w-14 text-right shrink-0 tabular-nums">
              {gridLabelDetail === 1
                ? "Field"
                : gridLabelDetail === 2
                  ? "Square"
                  : "Subsq."}
            </span>
          </div>
        </>
      )}

      {/* Separator */}
      <div className="border-t border-white/[0.06] my-1.5" />

      {/* Spot Size */}
      <div className="flex items-center h-[28px] px-1">
        <span className="text-[11px] text-white/50 w-[60px] shrink-0">
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
          className="layers-slider flex-1 mx-2"
          aria-label="Spot dot size scale"
        />
        <span className="text-[10px] font-mono text-white/40 w-7 text-right shrink-0 tabular-nums">
          {spotDotScale.toFixed(1)}&times;
        </span>
      </div>

      {/* Pin Size */}
      <div className="flex items-center h-[28px] px-1">
        <span className="text-[11px] text-white/50 w-[60px] shrink-0">
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
          className="layers-slider flex-1 mx-2"
          aria-label="Map pin size scale"
        />
        <span className="text-[10px] font-mono text-white/40 w-7 text-right shrink-0 tabular-nums">
          {mapPinScale.toFixed(1)}&times;
        </span>
      </div>

      {/* Label Size */}
      <div className="flex items-center h-[28px] px-1">
        <span className="text-[11px] text-white/50 w-[60px] shrink-0">
          Labels
        </span>
        <input
          type="range"
          min="0.5"
          max="2.0"
          step="0.1"
          value={labelScale}
          onChange={handleLabelChange}
          onClick={(e) => e.stopPropagation()}
          className="layers-slider flex-1 mx-2"
          aria-label="Spot label size scale"
        />
        <span className="text-[10px] font-mono text-white/40 w-7 text-right shrink-0 tabular-nums">
          {labelScale.toFixed(1)}&times;
        </span>
      </div>

      {/* Arc Density */}
      <div className="flex items-center h-[28px] px-1">
        <span className="text-[11px] text-white/50 w-[60px] shrink-0">
          Density
        </span>
        <input
          type="range"
          min="10"
          max="200"
          step="10"
          value={displayDensity}
          onChange={handleDensityChange}
          onClick={(e) => e.stopPropagation()}
          className="layers-slider flex-1 mx-2"
          aria-label="Maximum number of spot arcs to display"
        />
        <span className="text-[10px] font-mono text-white/40 w-7 text-right shrink-0 tabular-nums">
          {displayDensity}
        </span>
      </div>
    </div>
  );

  // ── Submenu: auto-rotate speed (conditional) ──
  const renderAutoRotateSpeed = () => {
    if (!isGlobeView || !autoRotate) return null;
    return (
      <>
        <div className="border-t border-white/[0.06] my-1.5" />
        <div className="flex items-center h-[28px] px-1">
          <span className="text-[11px] text-white/50 w-[44px] shrink-0">
            Speed
          </span>
          <input
            type="range"
            min={Math.log(60)}
            max={Math.log(86400)}
            step={0.01}
            value={Math.log(autoRotateSpeed)}
            onChange={(e) => {
              const seconds = Math.round(Math.exp(parseFloat(e.target.value)));
              setAutoRotateSpeed(seconds);
            }}
            onClick={(e) => e.stopPropagation()}
            className="layers-slider flex-1 mx-2"
            aria-label="Auto-rotate speed"
          />
          <span className="text-[10px] font-mono text-white/40 w-14 text-right shrink-0 tabular-nums">
            {formatRotateSpeed(autoRotateSpeed)}
          </span>
        </div>
      </>
    );
  };

  return (
    <>
      {/* ── Trigger button ── */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closePopover() : openPopover())}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-0 ${
          open
            ? "bg-white/15 text-white"
            : "text-gray-300 hover:text-white hover:bg-white/10"
        }`}
        aria-haspopup="true"
        aria-expanded={open}
      >
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

      {/* ── Portal popover ── */}
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className="fixed z-[250] animate-in fade-in slide-in-from-top-1"
            style={{ top: popoverPos.top, left: popoverPos.left }}
            onMouseEnter={handlePopoverEnter}
            onMouseLeave={handlePopoverLeave}
            role="group"
            aria-label="Map layers"
          >
            <div className="flex bg-[#0c0e18]/[0.96] backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl shadow-black/60 overflow-hidden">
              {/* ── Category column ── */}
              <div className="w-[168px] py-1.5 border-r border-white/[0.06]">
                {categories.map((cat, i) => (
                  <div key={cat.id}>
                    {i === categories.length - 1 && (
                      <div className="border-t border-white/[0.05] my-1 mx-2" />
                    )}
                    <CategoryRow
                      icon={cat.icon}
                      label={cat.name}
                      enabledCount={enabledCounts[cat.id]?.enabled ?? 0}
                      totalCount={enabledCounts[cat.id]?.total ?? 0}
                      isActive={activeCategory === cat.id}
                      onMouseEnter={() => handleCategoryHover(cat.id)}
                    />
                  </div>
                ))}

                {/* Separator before Display */}
                <div className="border-t border-white/[0.05] my-1 mx-2" />
                <CategoryRow
                  icon={<IconDisplay />}
                  label="Display"
                  enabledCount={enabledCounts[displayCategoryId]?.enabled ?? 0}
                  totalCount={enabledCounts[displayCategoryId]?.total ?? 0}
                  isActive={activeCategory === displayCategoryId}
                  onMouseEnter={() => handleCategoryHover(displayCategoryId)}
                />
              </div>

              {/* ── Submenu panel ── */}
              <div className="w-[232px] min-h-[180px] max-h-[70vh] overflow-y-auto py-2 px-2.5">
                {/* Category header */}
                <div className="text-[10px] uppercase tracking-wider text-white/30 font-semibold mb-1.5 px-1">
                  {activeCategory === displayCategoryId
                    ? "Display"
                    : (activeCategoryDef?.name ?? "")}
                </div>

                {/* Content area with crossfade */}
                <div
                  key={activeCategory}
                  className="slide-in-from-left-1 animate-in"
                >
                  {activeCategory === displayCategoryId ? (
                    renderDisplaySubmenu()
                  ) : activeCategoryDef?.renderSubmenu ? (
                    activeCategoryDef.renderSubmenu()
                  ) : activeCategoryDef ? (
                    <div className="space-y-0.5">
                      {activeCategoryDef.items.map((item) => (
                        <ToggleRow key={item.key} item={item} />
                      ))}
                      {/* Satellite filters inline (Activity category) */}
                      {activeCategory === "activity" && layers.satellites && (
                        <div className="mt-1 ml-1">
                          <SatelliteFilters />
                        </div>
                      )}
                      {/* Auto-rotate speed slider inside Reference category */}
                      {activeCategory === "reference" &&
                        renderAutoRotateSpeed()}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Slider styles */}
            <style>{`
              .layers-slider {
                -webkit-appearance: none;
                appearance: none;
                height: 3px;
                background: rgba(255, 255, 255, 0.08);
                border-radius: 2px;
                outline: none;
              }
              .layers-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: #9ca3af;
                cursor: pointer;
                border: none;
                transition: background 0.15s;
              }
              .layers-slider::-webkit-slider-thumb:active {
                background: #ffffff;
              }
              .layers-slider::-moz-range-thumb {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: #9ca3af;
                cursor: pointer;
                border: none;
                transition: background 0.15s;
              }
              .layers-slider::-moz-range-thumb:active {
                background: #ffffff;
              }
              .layers-slider::-moz-range-track {
                height: 3px;
                background: rgba(255, 255, 255, 0.08);
                border-radius: 2px;
                border: none;
              }
            `}</style>
          </div>,
          document.body,
        )}
    </>
  );
}
