/**
 * HamClockView — Full-screen map with the wall shell at both densities
 *
 * Wall and desk render the identical `HamClockWall` tree (tile rails,
 * callsign header, ticker, footer pager); density only scales it down via
 * `--hc-scale` and opaque rails in `hamclock-wall.css` (wall spec §3, §15,
 * HW-24/HW-25). This view owns the map stage itself (flat/azimuthal/globe),
 * the shared settings dialog, and the mode/projection state the map stage
 * and the wall header both read.
 *
 * Escape key or the header's exit button returns to normal layout mode.
 */

import {
  lazy,
  Suspense,
  useEffect,
  useCallback,
  useRef,
  useState,
} from "react";
import "@/styles/hamclock.css";
import "@/styles/hamclock-themes.css";
import "@/styles/hamclock-wall.css";
import "@/styles/hamclock-wall-forecast.css";
import "@/styles/hamclock-wall-report.css";
import "@/styles/hamclock-wall-controls.css";
import { useHamClockRadioFollow } from "@/hooks/useHamClockRadioFollow";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { useKioskStore } from "@/stores/kioskStore";
import {
  hamClockProjectionContent,
  hamClockHomeRegion,
} from "@/lib/hamclock/displayLayout";
import { HamClockSettingsDialog } from "./hamclock/wall/settings/HamClockSettingsDialog";
import { useMapStore } from "@/stores/mapStore";
import { useHamClockStore, type HamClockMode } from "@/stores/hamclockStore";
import {
  HAMCLOCK_MODE_LAYERS,
  applyHamClockModeLayers,
} from "@/lib/hamclock/modePresets";
import { normalizeExclusiveLayers } from "@/lib/map/layerCapabilities";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { FlatMapView } from "./FlatMapView";
import { WatchStatusPill } from "@/components/map/WatchStatusPill";
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
// Main Component
// ---------------------------------------------------------------------------

export function HamClockView({
  displayTime,
  onLocationClick,
}: HamClockViewProps) {
  useHamClockRadioFollow();
  const display = useHamClockDisplayStore();
  const frameHome = display.frameHome;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const activeLocation = useActiveLocation();
  const kiosk = useKioskStore((s) => s.active);
  const homeStarted = useRef(false);
  const userNavigated = useRef(false);
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

  const viewMode = useMapStore((s) => s.viewMode);
  const mapContent = hamClockProjectionContent(viewMode, display.mapContent);

  const hamclockMode = useHamClockStore((s) => s.hamclockMode);
  const setFiltersBeforeBands = useHamClockStore(
    (s) => s.setFiltersBeforeBands,
  );

  const prevModeRef = useRef(hamclockMode);

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

  const mapStage = (
    <main
      className="min-h-0 min-w-0 overflow-hidden relative bg-void-black"
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

  // Owned here, above `HamClockWall`, so switching density never strands a
  // stale `settingsOpen` on an unmounted copy of this dialog: wall and desk
  // each used to own their own state and their own `HamClockSettingsDialog`
  // mount, so opening SETTINGS at desk and choosing WALL from the Display
  // tab left the desk dialog's `true` state behind, which then reopened
  // uninvited the next time density flipped back.
  const settingsDialog = (
    <HamClockSettingsDialog
      open={settingsOpen}
      onClose={() => setSettingsOpen(false)}
    />
  );

  return (
    <>
      <div
        data-hamclock-root
        data-hamclock-theme={display.theme}
        className="fixed inset-0 z-[200] bg-void-black text-white select-none"
      >
        <HamClockWall onOpenSettings={() => setSettingsOpen(true)}>
          {mapStage}
        </HamClockWall>
      </div>
      {settingsDialog}
    </>
  );
}

export default HamClockView;
