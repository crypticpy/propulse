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
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import "@/styles/hamclock.css";
import "@/styles/hamclock-themes.css";
import "@/styles/hamclock-wall.css";
import "@/styles/hamclock-wall-forecast.css";
import "@/styles/hamclock-wall-report.css";
import "@/styles/hamclock-wall-controls.css";
import { BoundViewHost } from "@/components/views/BoundViewHost";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { useBoundViewRadioFollow } from "@/hooks/useHamClockRadioFollow";
import { useHamClockWallOperatingState } from "@/hooks/useHamClockWallOperatingState";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { useKioskStore } from "@/stores/kioskStore";
import {
  hamClockProjectionContent,
  hamClockHomeRegion,
} from "@/lib/hamclock/displayLayout";
import { HamClockSettingsDialog } from "./hamclock/wall/settings/HamClockSettingsDialog";
import { useMapStore } from "@/stores/mapStore";
import { useHamClockStore, type HamClockMode } from "@/stores/hamclockStore";
import type { SpotPresentationPreferences } from "@/lib/views/spotContracts";
import {
  HAMCLOCK_MODE_LAYERS,
  applyHamClockModeLayers,
} from "@/lib/hamclock/modePresets";
import {
  enabledHeroCriticalLayers,
  formatHeroProjectionChip,
  normalizeExclusiveLayers,
  resolveHeroProjection,
  type PropSphereViewMode,
} from "@/lib/map/layerCapabilities";
import { LAYER_REGISTRY } from "@/lib/map/layerRegistry";
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

type HeroForceLatch = {
  wrote: PropSphereViewMode;
  presetId: string | null;
};

function restoreForcedHeroProjection(latch: HeroForceLatch) {
  const map = useMapStore.getState();
  if (map.viewMode !== latch.wrote) return;
  const preferred = useHamClockStore.getState().preferredViewMode;
  const livePresetId = map.activePresetId;
  const presetToRestore = livePresetId ?? latch.presetId;

  if (map.viewMode !== preferred) {
    map.setViewMode(preferred);
  }
  // `restoreActivePresetId` re-marks the preset active without re-applying
  // its stored rotation/zoom, so any pan/zoom the operator did while the
  // projection was forced survives the restore (#691 M2). `setViewMode`
  // above already cleared `activePresetId`, so this always needs to run
  // when there is a preset to bring back.
  if (presetToRestore) {
    map.restoreActivePresetId(presetToRestore);
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function HamClockBoundFollow() {
  useBoundViewRadioFollow();
  return null;
}

/**
 * Capture/restore the bound view's spot filters across Bands-mode entry and
 * exit. Mounted inside `<BoundViewHost slot="hamclock">` (unlike the mode
 * layer effect in `HamClockView` itself, which runs above the provider and
 * only touches `mapStore`), because this needs `useViewRuntime()`. Manual
 * bands changes here go through `updateWorkingView`, which clears
 * follow-radio on its own when the bands/modes actually change
 * (`bandModeFiltersEqual`), so no separate follow-radio write is needed.
 */
export function HamClockBoundModeFilters() {
  const runtime = useViewRuntime();
  const hamclockMode = useHamClockStore((s) => s.hamclockMode);
  const setFiltersBeforeBands = useHamClockStore(
    (s) => s.setFiltersBeforeBands,
  );
  // Starts at a sentinel, not `hamclockMode`, so landing on this component
  // already in Bands mode still counts as an entry transition below and
  // captures/patches the runtime once. Persisted "bands" never survives a
  // reload — `hamclockStore.ts` coerces it back to "traffic" on rehydrate —
  // but `hamclockMode` can still already be "bands" in memory when this
  // mounts, e.g. via `LayoutModeDropdown.tsx`'s `selectMode` re-entering the
  // hamclock layout with a stale in-memory mode, or a kiosk scene's
  // `applySceneToMap.ts` setting `hamclockMode` before `setLayoutMode`.
  const prevModeRef = useRef<HamClockMode | null>(null);
  // Local mirror of the captured pre-Bands filters, set alongside the store
  // write below and cleared alongside it. #747: this component — not the
  // store — owns restoring the runtime when a Bands session ends, including
  // when it ends by unmounting rather than by a mode change (see the
  // unmount effect below). The unmount cleanup restores from this ref
  // rather than re-reading `filtersBeforeBands` from the store, because
  // `mapStore.setLayoutMode`'s hamclock-exit path also clears that field
  // (independently, before this component ever unmounts) as a leftover
  // belt-and-suspenders reset from before SP-09 moved ownership here; this
  // ref keeps the restore correct regardless of what else touches the
  // shared field in between.
  const pendingRestoreRef = useRef<
    SpotPresentationPreferences["filters"] | null
  >(null);

  useEffect(() => {
    const prev = prevModeRef.current;
    if (prev === hamclockMode) return;

    const snapshot = runtime.getSnapshot();
    if (hamclockMode === "bands" && prev !== "bands") {
      const captured = { ...snapshot.config.spots.filters };
      setFiltersBeforeBands(captured);
      pendingRestoreRef.current = captured;
      runtime.updateWorkingView({
        spots: {
          ...snapshot.config.spots,
          filters: {
            ...snapshot.config.spots.filters,
            bands: [...useHamClockStore.getState().bandFocus],
          },
        },
      });
    } else if (prev === "bands" && hamclockMode !== "bands") {
      const restore = useHamClockStore.getState().filtersBeforeBands;
      if (restore) {
        runtime.updateWorkingView({
          spots: { ...snapshot.config.spots, filters: restore },
        });
      }
      setFiltersBeforeBands(null);
      pendingRestoreRef.current = null;
    }

    prevModeRef.current = hamclockMode;
  }, [hamclockMode, runtime, setFiltersBeforeBands]);

  // Unmount-only cleanup, symmetric with the exit-Bands branch above: if
  // this component tears down (layout exit, or a `ViewProvider` identity
  // change from e.g. a sign-in/out mid-session) while a Bands session is
  // still open, restore the runtime's pre-Bands filters instead of leaving
  // the Bands patch stuck in the persisted working view for the next mount
  // to mistake for the operator's real baseline (#747). `[]` deps: this
  // must run once, on final unmount, not on every `hamclockMode` change —
  // the effect above already handles in-place mode transitions.
  useEffect(() => {
    return () => {
      const restore = pendingRestoreRef.current;
      if (restore) {
        runtime.updateWorkingView({
          spots: { ...runtime.getSnapshot().config.spots, filters: restore },
        });
      }
      setFiltersBeforeBands(null);
      // React StrictMode double-invokes effects in development: setup →
      // this cleanup → setup again, on the same mount. Without resetting
      // these, the replayed setup sees `prevModeRef.current === "bands"`
      // (untouched by this cleanup) and takes neither the entry nor the
      // exit branch above, leaving Bands mode selected with the runtime
      // showing the just-restored pre-Bands filters. Resetting both lets
      // the replay see `prev === null` with `hamclockMode` still "bands"
      // and re-enter cleanly, re-capturing from the snapshot this cleanup
      // just restored (so the recapture is correct) and re-patching the
      // runtime. On a genuine unmount these refs are about to be garbage
      // anyway, so resetting them here is harmless.
      prevModeRef.current = null;
      pendingRestoreRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount-only cleanup; runtime/setFiltersBeforeBands are stable for this mount's lifetime
  }, []);

  return null;
}

export function HamClockView({
  displayTime,
  onLocationClick,
}: HamClockViewProps) {
  // Registers this screen on the shared operating roster and mirrors an
  // inbound cursor's target onto `mapStore.target` (#712). Wall and desk
  // density share this one mount, so there is exactly one registration
  // regardless of which the operator has picked.
  useHamClockWallOperatingState();
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
  const layers = useMapStore((s) => s.layers);
  const preferredViewMode = useHamClockStore((s) => s.preferredViewMode);
  const mapContent = hamClockProjectionContent(viewMode, display.mapContent);

  const requestedHeroLayers = useMemo(
    () => enabledHeroCriticalLayers(layers),
    [layers],
  );
  const heroProjection = useMemo(
    () => resolveHeroProjection(requestedHeroLayers, preferredViewMode),
    [requestedHeroLayers, preferredViewMode],
  );
  const projectionChip = formatHeroProjectionChip(
    heroProjection,
    preferredViewMode,
    (key) => LAYER_REGISTRY[key as keyof typeof LAYER_REGISTRY]?.name ?? key,
    viewMode,
  );

  const forceLatchRef = useRef<HeroForceLatch | null>(null);
  const yieldedBlockerKeyRef = useRef<string | null>(null);
  const lastPreferredRef = useRef(preferredViewMode);
  const resolvedProjection = heroProjection.projection;
  const blockerKey = heroProjection.forcedBy.join(",");

  // Layout effect, not a plain effect: the force must land before the
  // browser paints, or the first frame renders with the still-unforced
  // `viewMode` and `formatHeroProjectionChip` reads that as a yield
  // (`"...cannot draw..."`) for one frame before flipping to the correct
  // "Switched to..." copy on the next (#691 M4).
  useLayoutEffect(() => {
    const map = useMapStore.getState();
    const yieldKey = `${blockerKey}|${preferredViewMode}`;
    const preferredChanged = lastPreferredRef.current !== preferredViewMode;
    lastPreferredRef.current = preferredViewMode;

    if (blockerKey.length === 0) {
      yieldedBlockerKeyRef.current = null;
      const latch = forceLatchRef.current;
      forceLatchRef.current = null;
      if (latch) restoreForcedHeroProjection(latch);
      return;
    }

    if (
      yieldedBlockerKeyRef.current != null &&
      yieldedBlockerKeyRef.current !== yieldKey
    ) {
      yieldedBlockerKeyRef.current = null;
    }

    if (yieldedBlockerKeyRef.current === yieldKey) {
      return;
    }

    const latch = forceLatchRef.current;
    if (latch && viewMode !== latch.wrote && !preferredChanged) {
      forceLatchRef.current = null;
      yieldedBlockerKeyRef.current = yieldKey;
      return;
    }

    if (viewMode === resolvedProjection) {
      if (latch === null) {
        // #744: since PR #743, `applySceneToMap` pre-resolves the
        // projection before this effect ever runs, so `viewMode` can
        // already equal `resolvedProjection` the first time a blocked
        // scene is seen — nothing below needs to force anything, and
        // without this, no latch is ever recorded. Later, when the
        // blocking layer switches off and `blockerKey` empties, the
        // `blockerKey.length === 0` branch above finds `latch === null`
        // and nothing re-asserts the projection the scene actually
        // requested. Record a latch here too, whenever the live
        // projection differs from what is actually preferred, so that
        // restore has the same live-`preferredViewMode` lookup and the
        // same yield protection (below) that a real force gets. The
        // `viewMode !== preferredViewMode` guard is what keeps this to
        // genuinely blocked scenes: `resolveHeroProjection` can also
        // return a non-empty `forcedBy` with `projection ===
        // preferredProjection` when no fallback can draw the set
        // either, and in that case nothing was ever forced, so there is
        // nothing to latch and nothing to restore.
        if (viewMode !== preferredViewMode) {
          forceLatchRef.current = {
            wrote: resolvedProjection,
            presetId: map.activePresetId,
          };
        }
      } else if (
        map.activePresetId != null &&
        map.activePresetId !== latch.presetId
      ) {
        forceLatchRef.current = { ...latch, presetId: map.activePresetId };
      }
      return;
    }

    if (forceLatchRef.current === null) {
      forceLatchRef.current = {
        wrote: resolvedProjection,
        presetId: map.activePresetId,
      };
    } else {
      forceLatchRef.current = {
        ...forceLatchRef.current,
        wrote: resolvedProjection,
      };
    }
    map.setViewMode(resolvedProjection);
  }, [viewMode, resolvedProjection, blockerKey, preferredViewMode]);

  useEffect(() => {
    return () => {
      const latch = forceLatchRef.current;
      forceLatchRef.current = null;
      if (latch) restoreForcedHeroProjection(latch);
    };
  }, []);

  const hamclockMode = useHamClockStore((s) => s.hamclockMode);

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

  // Apply mode layer transitions when the operator changes product mode.
  // Spot-filter capture/restore for Bands mode is handled by
  // `HamClockBoundModeFilters`, mounted inside `<BoundViewHost>` below, since
  // it must write the bound view's runtime rather than `mapStore`.
  useEffect(() => {
    const prev = prevModeRef.current;
    if (prev === hamclockMode) return;
    applyModeLayers(hamclockMode);
    prevModeRef.current = hamclockMode;
  }, [hamclockMode]);

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
      <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 pointer-events-none">
        {projectionChip && (
          <div
            role="status"
            className="hc-chip"
            style={{ background: "var(--hc-fg)", paddingInline: "0.8vh" }}
          >
            {projectionChip}
          </div>
        )}
        {viewMode === "flat" &&
          display.homeRequest &&
          Math.abs(display.homeRequest.lon) +
            display.homeRequest.longitudeSpan / 2 >
            180 && (
            <div className="rounded bg-void-black/90 p-2 text-xs text-su-text">
              Dateline region · world overview. Use 3D for a centered regional
              view.
            </div>
          )}
      </div>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center font-mono text-xs uppercase tracking-widest text-su-text/80">
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
          <div className="absolute bottom-3 left-3 rounded bg-void-black/85 px-2 py-1 text-xs text-su-text pointer-events-none">
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
    <BoundViewHost slot="hamclock">
      <HamClockBoundFollow />
      <HamClockBoundModeFilters />
      <div
        data-hamclock-root
        data-hamclock-theme={display.theme}
        className="fixed inset-0 z-[200] bg-void-black text-su-text select-none"
      >
        <HamClockWall onOpenSettings={() => setSettingsOpen(true)}>
          {mapStage}
        </HamClockWall>
      </div>
      {settingsDialog}
    </BoundViewHost>
  );
}

export default HamClockView;
