/**
 * HamClockView — Full-screen map with configurable sidebars
 *
 * Layout:
 *   header          (36px slim bar spanning full width)
 *   left | map | right   (sidebars + fill-container map)
 *   live alert/news crawl (30px spanning full width)
 *
 * Sidebars (user-configurable which side):
 *   - DX Spots sidebar (slim, scrollable spot list)
 *   - Info sidebar (stacked propagation, station, and schedule panels)
 *
 * Escape key or X button returns to normal layout mode.
 */

import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import "@/styles/hamclock.css";
import "@/styles/hamclock-themes.css";
import "@/styles/hamclock-wall.css";
import { useHamClockRadioFollow } from "@/hooks/useHamClockRadioFollow";
import {
  HAMCLOCK_PANELS,
  useHamClockDisplayStore,
} from "@/stores/hamclockDisplayStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useKioskStore } from "@/stores/kioskStore";
import {
  hamClockProjectionContent,
  HAMCLOCK_TEXT_SCALE,
  hamClockPanelWidths,
  hamClockHomeRegion,
} from "@/lib/hamclock/displayLayout";
import { HamClockDisplaySettings } from "./hamclock/HamClockDisplaySettings";
import { useUTCClock } from "@/hooks/useUTCClock";
import { useMapStore, type ViewMode } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import { useHamClockStore, type HamClockMode } from "@/stores/hamclockStore";
import {
  HAMCLOCK_MODE_LAYERS,
  applyHamClockModeLayers,
} from "@/lib/hamclock/modePresets";
import { normalizeExclusiveLayers } from "@/lib/map/layerCapabilities";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import {
  useKIndex,
  useSolarFlux,
  useSunspots,
  useMagnetometer,
} from "@/hooks/useSolarData";
import { getGreylineStatus } from "@/lib/utils/greyline";
import { getPathMetrics } from "@/lib/utils/path";
import { FlatMapView } from "./FlatMapView";
import { BandConditionsPanel } from "./BandConditionsPanel";
import { LayersPopover } from "@/components/map/LayersPopover";
import { WatchStatusPill } from "@/components/map/WatchStatusPill";
import { HamClockSidebar } from "./hamclock/HamClockSidebar";
import { HamClockInfoPanel } from "./hamclock/HamClockInfoPanel";
import { HamClockSpotsSidebar } from "./hamclock/HamClockSpotsSidebar";
import { LayoutModeDropdown } from "./LayoutModeDropdown";
import { HamClockBestBandHero } from "./hamclock/HamClockBestBandHero";
import { HamClockProjectionSwitch } from "./hamclock/HamClockProjectionSwitch";
import { HamClockModeSwitch } from "./hamclock/HamClockModeSwitch";
import { HamClockLayerChips } from "./hamclock/HamClockLayerChips";
import { HamClockContestsPanel } from "./hamclock/HamClockContestsPanel";
import { HamClockDxpeditionsPanel } from "./hamclock/HamClockDxpeditionsPanel";
import { HamClockReliabilityPanel } from "./hamclock/HamClockReliabilityPanel";
import { HamClockMoonPanel } from "./hamclock/HamClockMoonPanel";
import { HamClockLocationConditions } from "./hamclock/HamClockLocationConditions";
import { DXNewsTicker } from "./DXNewsTicker";
import { HamClockWall } from "./hamclock/wall/HamClockWall";

// Keep the WebGL-heavy alternate projections out of the initial HamClock
// chunk. They load only after the operator selects them in the header.
const GlobeView = lazy(() =>
  import("./GlobeView").then((module) => ({ default: module.GlobeView })),
);
const AzimuthalView = lazy(() =>
  import("./AzimuthalView").then((module) => ({
    default: module.AzimuthalView,
  })),
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HamClockViewProps {
  displayTime: Date;
  onLocationClick?: (
    lat: number,
    lon: number,
    screenPosition: { x: number; y: number },
  ) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function fmtHMS(d: Date): string {
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

function fmtLocalHM(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fmtUTCHM(d: Date): string {
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

function fmtCoord(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}${ns}  ${Math.abs(lon).toFixed(2)}${ew}`;
}

function fmtDistance(km: number): string {
  return km.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " km";
}

function fmtBearing(deg: number): string {
  return Math.round(deg).toString().padStart(3, "0") + "\u00B0";
}

function kpTextColor(kp: number): string {
  if (kp > 5) return "text-alert-red";
  if (kp >= 4) return "text-caution-amber";
  return "text-signal-green";
}

function bzTextColor(bz: number): string {
  if (bz < -5) return "text-alert-red";
  if (bz <= 0) return "text-caution-amber";
  return "text-signal-green";
}

function kpColor(kp: number): string {
  if (kp > 5) return "bg-alert-red/80 text-white";
  if (kp >= 4) return "bg-caution-amber/80 text-void-black";
  return "bg-signal-green/80 text-void-black";
}

function bzColor(bz: number): string {
  if (bz < -5) return "bg-alert-red/80 text-white";
  if (bz <= 0) return "bg-caution-amber/80 text-void-black";
  return "bg-signal-green/80 text-void-black";
}

function applyModeLayers(mode: HamClockMode) {
  const map = useMapStore.getState();
  const patch = HAMCLOCK_MODE_LAYERS[mode];
  useMapStore.setState({
    layers: normalizeExclusiveLayers(
      applyHamClockModeLayers(map.layers, mode),
      patch.muf ? "muf" : undefined,
    ),
    activePreset: null,
  });
}

// ---------------------------------------------------------------------------
// Isolated clock component — prevents 1s re-renders of entire HamClockView
// ---------------------------------------------------------------------------

function HamClockTime() {
  const now = useUTCClock();

  return (
    <>
      <span className="text-2xl font-mono font-bold text-white tracking-wider">
        {fmtHMS(now)} UTC
      </span>
      <span className="text-[11px] text-gray-400 font-mono">
        {fmtLocalHM(now)} Local
      </span>
    </>
  );
}

// ---------------------------------------------------------------------------
// Solar condition pills (header bar)
// ---------------------------------------------------------------------------

function SolarPills() {
  const solarFluxQuery = useSolarFlux();
  const kIndexQuery = useKIndex();
  const magnetometerQuery = useMagnetometer();

  const sfi = solarFluxQuery.data?.[solarFluxQuery.data.length - 1]?.flux;
  const kp = kIndexQuery.data?.[kIndexQuery.data.length - 1]?.kp_index;

  const bz = useMemo(() => {
    const data = magnetometerQuery.data;
    if (!data) return undefined;
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].bz_gsm !== null) return data[i].bz_gsm;
    }
    return undefined;
  }, [magnetometerQuery.data]);

  const pillBase =
    "px-2 py-0.5 rounded text-[11px] font-mono font-medium inline-flex items-center gap-1";

  return (
    <div className="flex items-center gap-1.5">
      {sfi != null && (
        <span className={`${pillBase} bg-white/10 text-gray-200`}>
          <span className="text-gray-500">SFI</span>
          {Math.round(sfi)}
        </span>
      )}
      {kp != null && (
        <span className={`${pillBase} ${kpColor(kp)}`}>
          <span className="opacity-70">Kp</span>
          {kp.toFixed(1)}
        </span>
      )}
      {bz != null && (
        <span className={`${pillBase} ${bzColor(bz)}`}>
          <span className="opacity-70">Bz</span>
          {bz > 0 ? "+" : ""}
          {bz.toFixed(1)}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Swap sides icon
// ---------------------------------------------------------------------------

function SwapIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="w-3.5 h-3.5"
    >
      <path d="M7 16l-4-4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 8l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 12h18" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// DE Station content (for info sidebar)
// ---------------------------------------------------------------------------

function DEContent({ displayTime }: { displayTime: Date }) {
  const station = useUserStore((s) => s.station);
  const location = useActiveLocation();

  const greyline = useMemo(() => {
    if (!location) return null;
    return getGreylineStatus(location.lat, location.lon, displayTime);
  }, [location, displayTime]);

  const callsign = station?.callsign || "NO CALL";
  const grid = location?.grid || station?.grid || "";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-mono text-lg font-bold text-signal-green leading-tight">
        {callsign}
      </div>
      {grid && <div className="font-mono text-sm text-gray-300">{grid}</div>}
      {location && (
        <>
          <div className="font-mono text-xs text-gray-400">
            {fmtCoord(location.lat, location.lon)}
          </div>
          <HamClockLocationConditions
            latitude={location.lat}
            longitude={location.lon}
            displayTime={displayTime}
            timeZone={location.timezone}
            stationLabel="DE"
          />
        </>
      )}
      {greyline && greyline.nextEventType && greyline.nextEventTime && (
        <div className="flex flex-col mt-1">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">
            {greyline.nextEventType === "sunrise" ? "Sunrise" : "Sunset"}
          </span>
          <span className="font-mono text-sm text-gray-200">
            {fmtUTCHM(greyline.nextEventTime)} z
          </span>
          {greyline.minutesToNextEvent != null && (
            <span className="font-mono text-[10px] text-gray-500">
              in{" "}
              {greyline.minutesToNextEvent < 60
                ? `${greyline.minutesToNextEvent}m`
                : `${Math.floor(greyline.minutesToNextEvent / 60)}h ${greyline.minutesToNextEvent % 60}m`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DX Target content (for info sidebar)
// ---------------------------------------------------------------------------

function DXContent({ displayTime }: { displayTime: Date }) {
  const target = useMapStore((s) => s.target);
  const location = useActiveLocation();

  const metrics = useMemo(() => {
    if (!target || !location) return null;
    return getPathMetrics(location.lat, location.lon, target.lat, target.lon);
  }, [target, location]);

  const greyline = useMemo(() => {
    if (!target) return null;
    return getGreylineStatus(target.lat, target.lon, displayTime);
  }, [target, displayTime]);

  if (!target) {
    return (
      <div className="text-sm text-gray-500 italic">Click map to select DX</div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-mono text-lg font-bold text-plasma-orange leading-tight truncate">
        {target.name || fmtCoord(target.lat, target.lon)}
      </div>
      {target.grid && (
        <div className="font-mono text-sm text-gray-300">{target.grid}</div>
      )}
      <div className="font-mono text-xs text-gray-400">
        {fmtCoord(target.lat, target.lon)}
      </div>
      <HamClockLocationConditions
        latitude={target.lat}
        longitude={target.lon}
        displayTime={displayTime}
        stationLabel="DX"
      />
      {metrics && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1">
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">
              Bearing
            </span>
            <span className="font-mono text-sm text-gray-200">
              {fmtBearing(metrics.shortPath.bearing)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">
              Distance
            </span>
            <span className="font-mono text-sm text-gray-200">
              {fmtDistance(metrics.shortPath.distance)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">
              Long Path
            </span>
            <span className="font-mono text-xs text-gray-400">
              {fmtBearing(metrics.longPath.bearing)} /{" "}
              {fmtDistance(metrics.longPath.distance)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">
              Hops
            </span>
            <span className="font-mono text-sm text-gray-200">
              ~{metrics.hops}F
            </span>
          </div>
        </div>
      )}
      {greyline && greyline.nextEventType && greyline.nextEventTime && (
        <div className="flex flex-col mt-1">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">
            DX {greyline.nextEventType === "sunrise" ? "Sunrise" : "Sunset"}
          </span>
          <span className="font-mono text-sm text-gray-200">
            {fmtUTCHM(greyline.nextEventTime)} z
          </span>
          {greyline.minutesToNextEvent != null && (
            <span className="font-mono text-[10px] text-gray-500">
              in{" "}
              {greyline.minutesToNextEvent < 60
                ? `${greyline.minutesToNextEvent}m`
                : `${Math.floor(greyline.minutesToNextEvent / 60)}h ${greyline.minutesToNextEvent % 60}m`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Space Weather content (for info sidebar)
// ---------------------------------------------------------------------------

function SpaceWeatherContent() {
  const solarFluxQuery = useSolarFlux();
  const sunspotsQuery = useSunspots();
  const kIndexQuery = useKIndex();
  const magnetometerQuery = useMagnetometer();

  const sfi = solarFluxQuery.data?.[solarFluxQuery.data.length - 1]?.flux;
  const ssn = sunspotsQuery.data?.[sunspotsQuery.data.length - 1]?.ssn;
  const kp = kIndexQuery.data?.[kIndexQuery.data.length - 1]?.kp_index;

  const bz = useMemo(() => {
    const data = magnetometerQuery.data;
    if (!data) return undefined;
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].bz_gsm !== null) return data[i].bz_gsm;
    }
    return undefined;
  }, [magnetometerQuery.data]);

  const rows: { label: string; value: string; colorClass: string }[] = [];

  if (sfi != null) {
    rows.push({
      label: "SFI",
      value: Math.round(sfi).toString(),
      colorClass:
        sfi >= 150
          ? "text-signal-green"
          : sfi >= 100
            ? "text-gray-200"
            : "text-caution-amber",
    });
  }
  if (ssn != null) {
    rows.push({
      label: "SSN",
      value: Math.round(ssn).toString(),
      colorClass:
        ssn >= 100
          ? "text-signal-green"
          : ssn >= 50
            ? "text-gray-200"
            : "text-caution-amber",
    });
  }
  if (kp != null) {
    rows.push({
      label: "Kp",
      value: kp.toFixed(1),
      colorClass: kpTextColor(kp),
    });
  }
  if (bz != null) {
    const arrow = bz > 0 ? "\u2191" : bz < 0 ? "\u2193" : "\u2194";
    rows.push({
      label: "Bz",
      value: `${bz > 0 ? "+" : ""}${bz.toFixed(1)} ${arrow}`,
      colorClass: bzTextColor(bz),
    });
  }

  const isLoading =
    solarFluxQuery.isLoading ||
    sunspotsQuery.isLoading ||
    kIndexQuery.isLoading ||
    magnetometerQuery.isLoading;

  if (isLoading)
    return <div className="text-xs text-gray-500 font-mono">Loading...</div>;
  if (rows.length === 0)
    return <div className="text-xs text-gray-500 font-mono">No data</div>;

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-2"
        >
          <span className="text-[10px] text-gray-500 uppercase tracking-wide font-mono">
            {row.label}
          </span>
          <span className={`font-mono text-sm font-bold ${row.colorClass}`}>
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Info Sidebar (stacked station, propagation, and live schedule panels)
// ---------------------------------------------------------------------------

function InfoSidebarContent({
  displayTime,
  mode,
}: {
  displayTime: Date;
  mode: HamClockMode;
}) {
  const panelCollapsed = useHamClockDisplayStore((s) => s.panelCollapsed);
  const togglePanel = useHamClockDisplayStore((s) => s.togglePanelExpansion);
  const location = useActiveLocation();
  const hidden = useHamClockDisplayStore((s) => s.hiddenPanels);

  return (
    <div className="hamclock-ui flex flex-col min-h-0">
      {!hidden.includes("best") && (mode === "traffic" || mode === "bands") && (
        <HamClockBestBandHero />
      )}

      <HamClockInfoPanel
        id="de"
        title="DE Station"
        collapsed={panelCollapsed.de ?? false}
        onToggle={() => togglePanel("de")}
      >
        <DEContent displayTime={displayTime} />
      </HamClockInfoPanel>

      <HamClockInfoPanel
        id="dx"
        title="DX Target"
        collapsed={panelCollapsed.dx ?? false}
        onToggle={() => togglePanel("dx")}
      >
        <DXContent displayTime={displayTime} />
      </HamClockInfoPanel>

      <HamClockInfoPanel
        id="spacewx"
        title="Space Weather"
        collapsed={panelCollapsed.spacewx ?? false}
        onToggle={() => togglePanel("spacewx")}
      >
        <SpaceWeatherContent />
      </HamClockInfoPanel>

      <HamClockInfoPanel
        id="moon"
        title="Moon"
        collapsed={panelCollapsed.moon ?? false}
        onToggle={() => togglePanel("moon")}
      >
        <HamClockMoonPanel
          displayTime={displayTime}
          latitude={location?.lat}
          longitude={location?.lon}
          timeZone={location?.timezone}
        />
      </HamClockInfoPanel>

      <HamClockInfoPanel
        id="bands"
        title="Band Conditions"
        collapsed={panelCollapsed.bands ?? mode !== "bands"}
        onToggle={() => togglePanel("bands", mode !== "bands")}
      >
        <div className="max-h-64 overflow-y-auto">
          <BandConditionsPanel
            displayTime={displayTime}
            compact
            collapsed={false}
            className="!bg-transparent !border-0 !rounded-none !shadow-none"
          />
        </div>
      </HamClockInfoPanel>

      <HamClockInfoPanel
        id="reliability"
        title="24h Reliability"
        collapsed={panelCollapsed.reliability ?? true}
        onToggle={() => togglePanel("reliability", true)}
      >
        {!(panelCollapsed.reliability ?? true) && <HamClockReliabilityPanel />}
      </HamClockInfoPanel>

      <HamClockInfoPanel
        id="dxpeditions"
        title="DXpeditions"
        collapsed={panelCollapsed.dxpeditions ?? true}
        onToggle={() => togglePanel("dxpeditions", true)}
      >
        {!(panelCollapsed.dxpeditions ?? true) && <HamClockDxpeditionsPanel />}
      </HamClockInfoPanel>

      <HamClockInfoPanel
        id="contests"
        title="Contests"
        collapsed={panelCollapsed.contests ?? true}
        onToggle={() => togglePanel("contests", true)}
      >
        {!(panelCollapsed.contests ?? true) && <HamClockContestsPanel />}
      </HamClockInfoPanel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function HamClockView({
  displayTime,
  onLocationClick,
}: HamClockViewProps) {
  useHamClockRadioFollow();
  const display = useHamClockDisplayStore();
  const frameHome = display.frameHome;
  const appSize = useSettingsStore((s) => s.textScale);
  const textScale =
    HAMCLOCK_TEXT_SCALE[
      display.textSize === "inherit" ? appSize : display.textSize
    ];
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const activeLocation = useActiveLocation();
  const kiosk = useKioskStore((s) => s.active);
  const homeStarted = useRef(false);
  const userNavigated = useRef(false);
  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    if (
      homeStarted.current ||
      userNavigated.current ||
      kiosk ||
      !activeLocation
    )
      return;
    homeStarted.current = true;
    frameHome(hamClockHomeRegion(activeLocation.lat, activeLocation.lon));
  }, [activeLocation, kiosk, frameHome]);
  const infoVisible = HAMCLOCK_PANELS.some(
    ([id]) =>
      id !== "spots" && id !== "contacts" && !display.hiddenPanels.includes(id),
  );
  const spotsVisible =
    !display.hiddenPanels.includes("spots") ||
    !display.hiddenPanels.includes("contacts");
  const widths = hamClockPanelWidths(
    viewportWidth,
    textScale,
    display.smartScaling,
    infoVisible,
    spotsVisible,
  );
  const station = useUserStore((s) => s.station);
  const observatory = useMapStore((s) => s.observatoryMode);
  const viewMode = useMapStore((s) => s.viewMode);
  const mapContent = hamClockProjectionContent(viewMode, display.mapContent);
  const setViewMode = useMapStore((s) => s.setViewMode);

  const spotsSide = useHamClockDisplayStore((s) => s.spotsSide);
  const setSpotsSide = useHamClockDisplayStore((s) => s.setSpotsSide);
  const spotsSidebarCollapsed = useHamClockDisplayStore(
    (s) => s.spotsSidebarCollapsed,
  );
  const infoSidebarCollapsed = useHamClockDisplayStore(
    (s) => s.infoSidebarCollapsed,
  );
  const toggleSpotsSidebar = useHamClockDisplayStore(
    (s) => s.toggleSpotsSidebar,
  );
  const toggleInfoSidebar = useHamClockDisplayStore((s) => s.toggleInfoSidebar);
  const hamclockMode = useHamClockStore((s) => s.hamclockMode);
  const setHamclockMode = useHamClockStore((s) => s.setHamclockMode);
  const setPreferredViewMode = useHamClockStore((s) => s.setPreferredViewMode);
  const setFiltersBeforeBands = useHamClockStore(
    (s) => s.setFiltersBeforeBands,
  );

  const prevModeRef = useRef(hamclockMode);

  const leftIsSpots = spotsSide === "left";
  const leftCollapsed = leftIsSpots
    ? spotsSidebarCollapsed || !spotsVisible
    : infoSidebarCollapsed || !infoVisible;
  const rightCollapsed = leftIsSpots
    ? infoSidebarCollapsed || !infoVisible
    : spotsSidebarCollapsed || !spotsVisible;
  const toggleLeft = leftIsSpots ? toggleSpotsSidebar : toggleInfoSidebar;
  const toggleRight = leftIsSpots ? toggleInfoSidebar : toggleSpotsSidebar;

  const SPOTS_WIDTH = widths.spots;
  const INFO_WIDTH = widths.info;
  const leftWidth = leftIsSpots ? SPOTS_WIDTH : INFO_WIDTH;
  const rightWidth = leftIsSpots ? INFO_WIDTH : SPOTS_WIDTH;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        useMapStore.getState().setLayoutMode("normal");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Apply mode layer/filter transitions when the operator changes product mode.
  useEffect(() => {
    const prev = prevModeRef.current;
    if (prev === hamclockMode) return;

    const map = useMapStore.getState();
    if (hamclockMode === "bands" && prev !== "bands") {
      setFiltersBeforeBands({ ...map.spotFilters });
      map.setSpotFilters({
        ...map.spotFilters,
        bands: [...useHamClockStore.getState().bandFocus],
      });
    } else if (prev === "bands" && hamclockMode !== "bands") {
      const restore = useHamClockStore.getState().filtersBeforeBands;
      if (restore) map.setSpotFilters(restore);
      setFiltersBeforeBands(null);
    }

    applyModeLayers(hamclockMode);
    prevModeRef.current = hamclockMode;
  }, [hamclockMode, setFiltersBeforeBands]);

  // Ensure the active mode's layer preset is applied on first mount.
  useEffect(() => {
    applyModeLayers(useHamClockStore.getState().hamclockMode);
  }, []);

  useEffect(() => {
    if (hamclockMode !== "traffic" && hamclockMode !== "bands") return;
    const map = useMapStore.getState();
    const showActivity = mapContent !== "contacts";
    useMapStore.setState({
      layers: {
        ...map.layers,
        spots: showActivity,
        spotTraces: false,
        gridActivity: showActivity,
        loggedQsos: mapContent !== "activity",
      },
    });
  }, [mapContent, hamclockMode]);

  const handleMapClick = useCallback(
    (lat: number, lon: number) => {
      onLocationClick?.(lat, lon, { x: 0, y: 0 });
    },
    [onLocationClick],
  );

  const handleSwapSides = useCallback(() => {
    setSpotsSide(spotsSide === "left" ? "right" : "left");
  }, [spotsSide, setSpotsSide]);

  const handleProjectionChange = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
      setPreferredViewMode(mode);
    },
    [setViewMode, setPreferredViewMode],
  );

  const spotsSidebar = <HamClockSpotsSidebar mode={hamclockMode} />;
  const infoSidebar = (
    <InfoSidebarContent displayTime={displayTime} mode={hamclockMode} />
  );
  const wall = display.density === "wall";

  const mapStage = (
    <main
      className="min-h-0 min-w-0 overflow-hidden relative bg-void-black"
      style={{ gridArea: wall ? undefined : "map" }}
      onPointerDownCapture={() => {
        userNavigated.current = true;
      }}
      onWheelCapture={() => {
        userNavigated.current = true;
      }}
    >
      {viewMode === "flat" &&
        display.homeRequest &&
        Math.abs(display.homeRequest.lon) +
          display.homeRequest.longitudeSpan / 2 >
          180 && (
          <div className="absolute top-2 left-2 z-10 rounded bg-void-black/90 p-2 text-xs text-gray-200">
            Dateline region · world overview. Use 3D for a centered regional
            view.
          </div>
        )}
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center font-mono text-xs uppercase tracking-widest text-white/35">
            Loading projection…
          </div>
        }
      >
        {viewMode === "flat" && (
          <FlatMapView
            displayTime={displayTime}
            onLocationClick={handleMapClick}
            fillContainer
          />
        )}
        {viewMode === "azimuthal" && (
          <AzimuthalView
            displayTime={displayTime}
            onLocationClick={handleMapClick}
          />
        )}
        {viewMode === "globe" && (
          <GlobeView
            displayTime={displayTime}
            onLocationClick={handleMapClick}
          />
        )}
      </Suspense>

      {(hamclockMode === "traffic" || hamclockMode === "bands") &&
        mapContent !== "activity" && (
          <div className="absolute bottom-3 left-3 rounded bg-void-black/85 px-2 py-1 text-xs text-gray-200 pointer-events-none">
            ○ Logged contacts · UTC{" "}
            {mapContent === "both" && " · • Live activity"}
          </div>
        )}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 pointer-events-auto">
        <WatchStatusPill className="sm:hidden" />
      </div>
    </main>
  );

  if (wall) {
    return (
      <div
        data-hamclock-root
        data-hamclock-theme={display.theme}
        className="fixed inset-0 z-[200] bg-void-black text-white select-none"
      >
        <HamClockWall>{mapStage}</HamClockWall>
      </div>
    );
  }

  return (
    <div
      data-hamclock-root
      data-hamclock-theme={display.theme}
      className="fixed inset-0 z-[200] bg-void-black text-white select-none"
      style={
        {
          "--hamclock-scale": textScale,
          "--hamclock-spacing":
            display.smartScaling && display.hiddenPanels.length < 4 ? 0.85 : 1,
          display: "grid",
          gridTemplateAreas: `"header header header" "left map right" "ticker ticker ticker"`,
          gridTemplateRows: "auto minmax(0, 1fr) 30px",
          gridTemplateColumns: `${leftCollapsed ? "0px" : `${leftWidth}px`} minmax(0, 1fr) ${rightCollapsed ? "0px" : `${rightWidth}px`}`,
        } as CSSProperties
      }
    >
      <header
        className="hamclock-ui flex flex-wrap items-center justify-between gap-2 px-3 py-1 border-b border-white/10"
        style={{ gridArea: "header" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <LayoutModeDropdown className="shrink-0" />
          <button
            onClick={toggleLeft}
            className="p-1 rounded hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
            aria-label={
              leftCollapsed ? "Expand left sidebar" : "Collapse left sidebar"
            }
            title={leftCollapsed ? "Show left panel" : "Hide left panel"}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="w-3.5 h-3.5"
            >
              {leftCollapsed ? (
                <path
                  d="M13 5l7 7-7 7M5 5l7 7-7 7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <path
                  d="M11 19l-7-7 7-7M19 19l-7-7 7-7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>
          </button>
          <HamClockModeSwitch value={hamclockMode} onChange={setHamclockMode} />
          <span className="font-mono text-sm font-bold text-signal-green truncate hidden xl:inline">
            {station?.callsign || "NO CALL"}
          </span>
          {station?.grid && (
            <span className="font-mono text-xs text-gray-400 hidden xl:inline">
              {station.grid}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 leading-tight">
          <HamClockTime />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(hamclockMode === "traffic" || hamclockMode === "bands") && (
            <div
              className="flex rounded border border-white/20 p-0.5"
              role="group"
              aria-label="Map content"
            >
              {(
                [
                  ["activity", "Activity"],
                  ["contacts", "My contacts"],
                  ["both", "Both"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mapContent === value}
                  disabled={viewMode === "azimuthal" && value !== "activity"}
                  title={
                    viewMode === "azimuthal" && value !== "activity"
                      ? "Map logged contacts in Flat or 3D"
                      : undefined
                  }
                  className={`rounded px-2 py-1 text-xs disabled:opacity-40 disabled:cursor-not-allowed ${mapContent === value ? "bg-signal-green text-void-black" : "text-gray-400 hover:bg-white/10"}`}
                  onClick={() => display.setMapContent(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            aria-pressed={observatory}
            className={`rounded border border-white/20 px-2 py-1 text-xs ${observatory ? "text-signal-green" : "text-gray-300"}`}
            onClick={() =>
              observatory
                ? useMapStore.getState().exitObservatory()
                : useMapStore.getState().enterObservatory()
            }
          >
            Observatory
          </button>
          <HamClockDisplaySettings />
          <button
            type="button"
            disabled={!activeLocation}
            className="rounded border border-white/20 px-2 py-1 text-xs text-gray-200 disabled:opacity-40"
            onClick={() => {
              if (observatory) useMapStore.getState().exitObservatory();
              if (activeLocation)
                display.frameHome(
                  hamClockHomeRegion(activeLocation.lat, activeLocation.lon),
                );
            }}
          >
            Home region
          </button>
          <HamClockProjectionSwitch
            value={viewMode}
            onChange={handleProjectionChange}
          />
          <button
            onClick={handleSwapSides}
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Swap sidebar sides"
            title="Swap sidebar sides"
          >
            <SwapIcon />
          </button>
          <SolarPills />
          <HamClockLayerChips />
          <LayersPopover />
          <WatchStatusPill className="hidden sm:flex" />
          <button
            onClick={toggleRight}
            className="p-1 rounded hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
            aria-label={
              rightCollapsed ? "Expand right sidebar" : "Collapse right sidebar"
            }
            title={rightCollapsed ? "Show right panel" : "Hide right panel"}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="w-3.5 h-3.5"
            >
              {rightCollapsed ? (
                <path
                  d="M11 19l-7-7 7-7M19 19l-7-7 7-7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <path
                  d="M13 5l7 7-7 7M5 5l7 7-7 7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>
          </button>
          <button
            onClick={() => useMapStore.getState().setLayoutMode("normal")}
            className="p-1 rounded hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
            aria-label="Exit HamClock view"
            title="Exit (Esc)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
      </header>

      <HamClockSidebar
        side="left"
        collapsed={leftCollapsed}
        onToggle={toggleLeft}
        width={leftWidth}
      >
        {leftIsSpots ? spotsSidebar : infoSidebar}
      </HamClockSidebar>

      {mapStage}

      <HamClockSidebar
        side="right"
        collapsed={rightCollapsed}
        onToggle={toggleRight}
        width={rightWidth}
      >
        {leftIsSpots ? infoSidebar : spotsSidebar}
      </HamClockSidebar>

      <div className="min-w-0" style={{ gridArea: "ticker" }}>
        <DXNewsTicker className="rounded-none" />
      </div>
    </div>
  );
}

export default HamClockView;
