/**
 * GlobeView Component
 *
 * 3D interactive globe using React Three Fiber.
 * Provides camera controls, lighting, and click-to-select functionality.
 */

import React, {
  Component,
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { useSettingsStore } from "@/stores/settingsStore";
import { getSubsolarPoint } from "@/lib/utils/sun";
import { getPathMetrics, getBearing, getDistance } from "@/lib/utils/path";
import { latLonToGrid } from "@/lib/utils/grid";
import { EarthSphere } from "./EarthSphere";
import { GlobeDepthDome } from "./GlobeDepthDome";
import { TiledGlobe } from "./TiledGlobe";
import { TiledLabels } from "./TiledLabels";
import { selectTileProvider } from "@/lib/tiles/providers";
import { CompassRose } from "./CompassRose";
import { Terminator } from "./Terminator";
import { Greyline } from "./Greyline";
import { NightOverlay } from "./NightOverlay";
import { NightLightsOverlay } from "./NightLightsOverlay";
import { LabelsOverlay } from "./LabelsOverlay";
import { AuroraOverlay } from "./AuroraOverlay";
import { MUFOverlay } from "./MUFOverlay";
import { SatelliteOverlay } from "./SatelliteOverlay";
import { ISSTrackerOverlay } from "./ISSTrackerOverlay";
import { EarthquakeOverlay3D } from "./EarthquakeOverlay3D";
import { WeatherAlerts3D } from "./WeatherAlerts3D";
import { WeatherAlertFlyout } from "./WeatherAlertFlyout";
import { WeatherAlertModal } from "./WeatherAlertModal";
import { FireFlyout } from "./FireFlyout";
import { LightningOverlay3D } from "./LightningOverlay3D";
import { FireOverlay3D } from "./FireOverlay3D";
import { RepeaterOverlay3D } from "./RepeaterOverlay3D";
import { RiverGaugeOverlay3D } from "./RiverGaugeOverlay3D";
import { APRSOverlay3D } from "./APRSOverlay3D";
import { TropicalCycloneOverlay3D } from "./TropicalCycloneOverlay3D";
import { QsoLocationsOverlay3D } from "./QsoLocationsOverlay3D";
import { StationMarker3D } from "./StationMarker3D";
import {
  WeatherRadarOverlay,
  type RadarAnimationState,
} from "./WeatherRadarOverlay";
import { PathArc } from "./PathArc";
import {
  LocationMarker,
  getDifficultyColor,
  type DifficultyLevel,
} from "./LocationMarker";
import { LiveSpotArcs, resolveSpotLocations } from "./LiveSpotArcs";
import { AnimatedSpotTraces } from "./AnimatedSpotTraces";
import { GridGlowOverlay, type GridGlowSpot } from "./GridGlowOverlay";
import { GridPersistOverlay } from "./GridPersistOverlay";
import { IonosphericShells } from "./IonosphericShells";
import { RayPathArc } from "./RayPathArc";
import {
  useGridActivityMap,
  type ActivitySpot,
} from "@/hooks/useGridActivityMap";
import { traceRayPath } from "@/lib/utils/rayTrace";
import { SpotHighlight } from "./SpotHighlight";
import { SelectedSpotArc } from "./SelectedSpotArc";
import { OverlayLayers3D } from "./OverlayLayers3D";
import { PinMarker } from "./PinMarker";
import { PinFlyout } from "./PinFlyout";
import { getCategoryMeta } from "@/types/pin";
import type { MapPin } from "@/types/pin";
import { GlobeClickHandler } from "./GlobeClickHandler";
import { MapTooltip } from "./MapTooltip";
import { MapFlyout, type MapFlyoutAction } from "./MapFlyout";
import { AddPinDialog } from "./AddPinDialog";
import {
  GridResearchPanel,
  type GridResearchAction,
} from "./GridResearchPanel";
import { useMapStore } from "@/stores/mapStore";
import { useProfileStore } from "@/stores/profileStore";
import { useWatchStore } from "@/stores/watchStore";
import { gridToLatLon } from "@/lib/utils/grid";
import {
  useUserStore,
  useCompassRosePrefs,
  useUIInteractionPrefs,
} from "@/stores/userStore";
import { useActiveStationGain } from "@/hooks/useActiveStationGain";
import { usePinStore } from "@/stores/pinStore";
import { useUndoStore } from "@/stores/undoStore";
import { useDXStore } from "@/stores/dxStore";
import { useAuroraData } from "@/hooks/useAuroraData";
import { useCurrentSFI } from "@/hooks/useMUFData";
import { useEarthquakes } from "@/hooks/useEarthquakes";
import { useWeatherAlerts } from "@/hooks/useWeatherAlerts";
import type { WeatherAlert } from "@/lib/api/weather";
import type { FireHotspot } from "@/lib/api/fires";
import { useLightning } from "@/hooks/useLightning";
import { useFires } from "@/hooks/useFires";
import { useRepeaters } from "@/hooks/useRepeaters";
import { useRiverGauges } from "@/hooks/useRiverGauges";
import { useAPRSStations } from "@/hooks/useAPRSStations";
import { useTropicalCyclones } from "@/hooks/useTropicalCyclones";
import { useContestQsoLocations } from "@/hooks/useContestQsoLocations";
import { useLoggedQsoLocations } from "@/hooks/useLoggedQsoLocations";
import { useWeatherRadar } from "@/hooks/useWeatherRadar";
import { useSpotFocus } from "@/hooks/useSpotFocus";
import { useLiveSpots } from "@/hooks/useLiveSpots";
import { useDXCluster } from "@/hooks/useDXCluster";
import {
  getGreylineGlowIntensity,
  getGreylineIntensity,
} from "@/lib/utils/greyline";
import { getSpotColor, type SpotColorMode } from "@/lib/utils/spotColors";
import {
  getGlobeNavigationTuning,
  getMinimumGlobeDistance,
} from "@/lib/map/globeNavigation";
import { qthCameraPosition } from "./lib/globeCoords";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { getEnhancedBandConditions } from "@/lib/utils/bands";
import { getAntennaGainForPath } from "@/lib/data/antennas";
import { pickOptimalBandCondition } from "@/lib/utils/optimalBand";
import type { OrbitControls as OrbitControlsType } from "three-stdlib";
import { TargetHoverTooltip } from "./TargetHoverTooltip";
import { MapSizeSliders } from "./MapSizeSliders";
import { SpotDetailsFlyout, type SpotDetailsData } from "./SpotDetailsFlyout";
import { ClusterDetailPopover } from "./ClusterDetailPopover";
import type { SpotCluster as SpotClusterData } from "@/hooks/useSpotClustering";

// New overlay components (Wave 8A)
import NVISOverlay3D from "./layers/NVISOverlay3D";
import BeaconNetworkOverlay3D from "./layers/BeaconNetworkOverlay3D";
import TimeStationsOverlay3D from "./layers/TimeStationsOverlay3D";
import MeteorShowerOverlay3D from "./layers/MeteorShowerOverlay3D";
import NoiseFloorOverlay3D from "./layers/NoiseFloorOverlay3D";
import DRAPOverlay3D from "./layers/DRAPOverlay3D";
import DuctingOverlay3D from "./layers/DuctingOverlay3D";
import SporadicEOverlay3D from "./layers/SporadicEOverlay3D";
import GeomagneticFieldLines3D from "./layers/GeomagneticFieldLines3D";
import TerminatorEnhancement3D from "./layers/TerminatorEnhancement3D";
import WSPROverlay3D from "./layers/WSPROverlay3D";
import GOESCloudOverlay3D from "./layers/GOESCloudOverlay3D";
import TECOverlay3D from "./layers/TECOverlay3D";
import SSTOverlay3D from "./layers/SSTOverlay3D";
import SpectrumWaterfallRing3D from "./layers/SpectrumWaterfallRing3D";
import SatelliteFootprint3D from "./layers/SatelliteFootprint3D";
import { Ft8SpotterOverlay } from "./layers/Ft8SpotterOverlay";
import { Ft8DecodeLayer3D } from "./layers/Ft8DecodeLayer3D";
import { Ft8SpotterHUD } from "./Ft8SpotterHUD";
import { useFt8SpotterData } from "@/hooks/useFt8SpotterData";
import { useFt8DecodeEnricher } from "@/hooks/useFt8DecodeEnricher";
import { useFt8SessionStore } from "@/stores/ft8SessionStore";

// New hooks (Wave 8A)
import { useBeaconNetwork } from "@/hooks/useBeaconNetwork";
import { useMeteorShowers } from "@/hooks/useMeteorShowers";
import { useNoiseFloor } from "@/hooks/useNoiseFloor";
import { useDRAPOverlay } from "@/hooks/useDRAPOverlay";
import { useWSPRSpots } from "@/hooks/useWSPRSpots";
import { useSporadicE } from "@/hooks/useSporadicE";
import { useDuctingForecast } from "@/hooks/useDuctingForecast";
import { useSatellites } from "@/hooks/useSatellites";
import { calculateNVISAtLocation } from "@/lib/utils/nvisCalculation";
import { getTerminatorPoints } from "@/lib/utils/sun";
import {
  buildBandActivityHistory,
  createBandActivitySnapshot,
  WATERFALL_BAND_NAMES,
  WATERFALL_MAX_ROWS,
  WATERFALL_SAMPLE_INTERVAL_MS,
  type BandActivityRow,
} from "@/lib/map/bandActivityWaterfall";
import { liveSpotsInGrid, mergeGridSpots } from "@/lib/map/gridTooltip";

interface GlobeViewProps {
  /** Current display time (current time + offset) */
  displayTime: Date;
  /** Callback when a location is clicked */
  onLocationClick?: (lat: number, lon: number) => void;
  /** Hide the built-in radar scrubber (when host provides its own) */
  hideRadarScrubber?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Error boundary for catching WebGL/Three.js errors in the Canvas
 */
class GlobeErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/**
 * Loading fallback for 3D content
 */
function GlobeLoader() {
  return (
    <mesh>
      <sphereGeometry args={[1, 32, 32]} />
      <meshBasicMaterial color="#1a1a2e" wireframe />
    </mesh>
  );
}

/**
 * Scene lighting setup - positions sun based on actual subsolar point
 */
function SceneLighting({ displayTime }: { displayTime: Date }) {
  // Calculate sun position from subsolar point
  const sunPosition = useMemo(() => {
    const subsolar = getSubsolarPoint(displayTime);

    // Convert lat/lon to 3D using same coordinate system as globe
    const phi = ((90 - subsolar.lat) * Math.PI) / 180;
    const theta = ((subsolar.lon + 180) * Math.PI) / 180;

    // Position sun far away for directional light effect
    const distance = 10;
    return [
      -distance * Math.sin(phi) * Math.cos(theta),
      distance * Math.cos(phi),
      distance * Math.sin(phi) * Math.sin(theta),
    ] as [number, number, number];
  }, [displayTime]);

  return (
    <>
      {/* Ambient light for base illumination */}
      <ambientLight intensity={0.2} />
      {/* Sun light - positioned based on actual subsolar point */}
      <directionalLight
        position={sunPosition}
        intensity={1.5}
        color="#fff8e8"
      />
      {/* Subtle fill light from opposite side */}
      <directionalLight
        position={[-sunPosition[0], -sunPosition[1], -sunPosition[2]]}
        intensity={0.1}
        color="#4466aa"
      />
    </>
  );
}

/**
 * Convert lat/lon to camera position at a given distance.
 * Returns a clone — the internal scratch vector is reused across calls.
 */
const _camPos = new THREE.Vector3();
function latLonToCameraPosition(
  lat: number,
  lon: number,
  distance: number = 2.5,
): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  _camPos.set(
    -distance * Math.sin(phi) * Math.cos(theta),
    distance * Math.cos(phi),
    distance * Math.sin(phi) * Math.sin(theta),
  );
  return _camPos.clone();
}

/**
 * Camera controller with spot focus and center animations
 * Handles OrbitControls and animates camera when:
 * - A spot is selected (targetPosition from useSpotFocus)
 * - Q2: Double-click centers the view (centerLocation from mapStore)
 */
// Auto-rotate speed is now dynamic, driven by mapStore.autoRotateSpeed (seconds per revolution).
// OrbitControls autoRotateSpeed 2.0 = 30 seconds per orbit at 60 fps.
// Conversion: 2.0 × (30 / secondsPerRevolution)

function CameraController() {
  const controlsRef = useRef<OrbitControlsType>(null);
  const { camera, gl, size } = useThree();
  const { targetPosition, isFocusing } = useSpotFocus();
  const centerLocation = useMapStore((state) => state.centerLocation);
  const clearCenterLocation = useMapStore((state) => state.clearCenterLocation);
  const activePresetId = useMapStore((state) => state.activePresetId);
  const regionPresets = useMapStore((state) => state.regionPresets);
  const autoRotate = useMapStore((state) => state.autoRotate);
  const observatoryMode = useMapStore((state) => state.observatoryMode);
  const autoRotateSpeed = useMapStore((state) => state.autoRotateSpeed);
  const mapStyle = useMapStore((state) => state.mapStyle);
  const subscriptionTier = useProfileStore((state) => state.subscriptionTier);
  const prevPresetIdRef = useRef<string | null>(null);
  const presetEffectRanRef = useRef(false);
  const presetPanRafRef = useRef<number>(0);
  const qthStartupDoneRef = useRef(false);

  const cameraProvider = useMemo(
    () => selectTileProvider(mapStyle, subscriptionTier),
    [mapStyle, subscriptionTier],
  );
  const minimumDistance = useMemo(
    () =>
      getMinimumGlobeDistance({
        maxZoom: cameraProvider.maxZoom,
        tileSize: cameraProvider.tileSize,
        viewportHeight: size.height * gl.getPixelRatio(),
        fieldOfView:
          camera instanceof THREE.PerspectiveCamera ? camera.fov : 45,
      }),
    [camera, cameraProvider, gl, size.height],
  );

  // Dynamic OrbitControls auto-rotate speed from store
  // OrbitControls autoRotateSpeed 2.0 = 30 seconds per orbit at 60 fps
  // Conversion: 2.0 × (30 / secondsPerRevolution)
  const computedRotateSpeed = useMemo(
    () => 2.0 * (30 / Math.max(60, autoRotateSpeed)),
    [autoRotateSpeed],
  );

  // OrbitControls sensitivity is distance-from-target based. Retune it after
  // every camera change so local navigation stays precise near the surface.
  const updateNavigationTuning = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const tuning = getGlobeNavigationTuning(
      camera.position.length(),
      minimumDistance,
    );
    controls.zoomSpeed = tuning.zoomSpeed;
    controls.rotateSpeed = tuning.rotateSpeed;
    controls.autoRotateSpeed = computedRotateSpeed * tuning.autoRotateScale;

    if (
      camera instanceof THREE.PerspectiveCamera &&
      Math.abs(camera.near - tuning.near) / Math.max(camera.near, tuning.near) >
        0.01
    ) {
      camera.near = tuning.near;
      camera.updateProjectionMatrix();
    }
  }, [camera, computedRotateSpeed, minimumDistance]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    updateNavigationTuning();
    controls.addEventListener("change", updateNavigationTuning);
    return () => {
      controls.removeEventListener("change", updateNavigationTuning);
    };
  }, [updateNavigationTuning]);

  // Observatory mode — read station for camera-to-home animation
  const station = useProfileStore((s) => s.station);
  const prevObservatoryModeRef = useRef(false);
  /** Animation frame ID for observatory pan cleanup */
  const observatoryPanRafRef = useRef<number>(0);

  // ─── Watch-based camera auto-pan ───────────────────────────────────────────
  const recentMatches = useWatchStore((s) => s.recentMatches);
  const matchRate = useWatchStore((s) => s.matchRate);
  const autoPan = useWatchStore((s) => s.autoPan);
  const watchEnabled = useWatchStore((s) => s.enabled);

  /** Track how many matches we've already panned to */
  const lastPanMatchCountRef = useRef(0);
  /** Timestamp of the last pan animation start */
  const lastPanTimeRef = useRef(0);
  /** Timestamp of when user last interacted (drag) with the globe */
  const lastUserDragRef = useRef(0);
  /** Whether we paused auto-rotate for a pan animation */
  const pausedAutoRotateRef = useRef(false);
  /** Animation frame ID for cleanup */
  const watchPanRafRef = useRef<number>(0);

  // Detect user drag interactions to suppress auto-pan for 10 seconds
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const onStart = () => {
      lastUserDragRef.current = Date.now();
    };
    controls.addEventListener("start", onStart);
    return () => {
      controls.removeEventListener("start", onStart);
    };
  }, []);

  // Watch-based auto-pan effect
  useEffect(() => {
    if (
      !autoPan ||
      !watchEnabled ||
      recentMatches.length === 0 ||
      observatoryMode
    ) {
      // Reset counter when watch is disabled, cleared, or observatory mode is active
      lastPanMatchCountRef.current = recentMatches.length;
      return;
    }

    // Only act on NEW matches since our last pan
    if (recentMatches.length <= lastPanMatchCountRef.current) {
      return;
    }

    // Rate-based panning strategy
    // > 2/sec → too busy, skip panning entirely
    if (matchRate > 2) {
      lastPanMatchCountRef.current = recentMatches.length;
      return;
    }

    const now = Date.now();

    // Suppress panning for 10 seconds after user drag
    if (now - lastUserDragRef.current < 10_000) {
      lastPanMatchCountRef.current = recentMatches.length;
      return;
    }

    // 0.2–2/sec → debounce: only pan if 5 seconds since last pan
    if (matchRate >= 0.2 && matchRate <= 2) {
      if (now - lastPanTimeRef.current < 5_000) {
        lastPanMatchCountRef.current = recentMatches.length;
        return;
      }
    }

    // < 0.2/sec → pan to each match with 800ms ease-out
    // (For 0.2–2/sec, we already debounced above, so we pan to the latest)

    const controls = controlsRef.current;
    if (!controls) return;

    // Get the latest match
    const latestMatch = recentMatches[recentMatches.length - 1];
    const spot = latestMatch.spot;

    // Determine lat/lon based on which end matched
    let lat: number | undefined;
    let lon: number | undefined;
    if (latestMatch.matchedField === "dx") {
      lat = spot.dxLat;
      lon = spot.dxLon;
    } else {
      lat = spot.spotterLat;
      lon = spot.spotterLon;
    }

    if (lat === undefined || lon === undefined) {
      lastPanMatchCountRef.current = recentMatches.length;
      return;
    }

    // Mark that we're panning
    lastPanMatchCountRef.current = recentMatches.length;
    lastPanTimeRef.current = now;

    // Temporarily pause auto-rotate during animation
    const wasAutoRotating = controls.autoRotate;
    if (wasAutoRotating) {
      controls.autoRotate = false;
      pausedAutoRotateRef.current = true;
    }

    // Cancel any in-flight watch pan animation
    if (watchPanRafRef.current) {
      cancelAnimationFrame(watchPanRafRef.current);
    }

    const startPosition = camera.position.clone();
    const currentDistance = startPosition.length();
    const endPosition = latLonToCameraPosition(lat, lon, currentDistance);

    // Duration depends on rate: < 0.2 → 800ms, 0.2–2 → 800ms
    const duration = 800;
    const startTime = Date.now();

    function animateWatchPan() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);

      camera.position.lerpVectors(startPosition, endPosition, eased);
      camera.lookAt(0, 0, 0);
      controls!.update();

      if (progress < 1) {
        watchPanRafRef.current = requestAnimationFrame(animateWatchPan);
      } else {
        // Restore auto-rotate if we paused it
        if (pausedAutoRotateRef.current && wasAutoRotating) {
          controls!.autoRotate = true;
          pausedAutoRotateRef.current = false;
        }
        watchPanRafRef.current = 0;
      }
    }

    animateWatchPan();

    return () => {
      if (watchPanRafRef.current) {
        cancelAnimationFrame(watchPanRafRef.current);
        watchPanRafRef.current = 0;
      }
      // Restore auto-rotate on cleanup
      if (pausedAutoRotateRef.current && controls) {
        controls.autoRotate = autoRotate;
        pausedAutoRotateRef.current = false;
      }
    };
  }, [
    recentMatches,
    matchRate,
    autoPan,
    watchEnabled,
    camera,
    autoRotate,
    observatoryMode,
  ]);

  // Animate camera to focus on selected spot
  useEffect(() => {
    if (!targetPosition || !controlsRef.current || !isFocusing) {
      return;
    }

    const controls = controlsRef.current;
    const startPosition = camera.position.clone();
    const endPosition = new THREE.Vector3(
      targetPosition.x,
      targetPosition.y,
      targetPosition.z,
    );

    // Animation duration in ms
    const duration = 1000;
    const startTime = Date.now();

    function animate() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);

      // Lerp camera position
      camera.position.lerpVectors(startPosition, endPosition, eased);

      // Always look at center of globe
      camera.lookAt(0, 0, 0);
      controls.update();

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    }

    animate();
  }, [targetPosition, isFocusing, camera]);

  // Q2: Animate camera to center on double-clicked location
  useEffect(() => {
    if (!centerLocation || !controlsRef.current) {
      return;
    }

    const controls = controlsRef.current;
    const startPosition = camera.position.clone();
    const currentDistance = startPosition.length();
    const endPosition = latLonToCameraPosition(
      centerLocation.lat,
      centerLocation.lon,
      currentDistance,
    );

    // Smooth animation duration in ms (300ms for responsive feel)
    const duration = 300;
    const startTime = Date.now();

    function animate() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);

      // Lerp camera position
      camera.position.lerpVectors(startPosition, endPosition, eased);

      // Always look at center of globe
      camera.lookAt(0, 0, 0);
      controls.update();

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Clear the center location after animation completes
        clearCenterLocation();
      }
    }

    animate();
  }, [centerLocation, camera, clearCenterLocation]);

  // Animate camera to region preset when activePresetId changes
  useEffect(() => {
    const isMountRun = !presetEffectRanRef.current;
    presetEffectRanRef.current = true;

    // Skip if preset hasn't actually changed (avoids re-animation on re-renders)
    if (activePresetId === prevPresetIdRef.current) {
      return;
    }
    prevPresetIdRef.current = activePresetId;

    if (!activePresetId || !controlsRef.current) {
      return;
    }

    // Startup precedence: with "Start at My QTH" active, a persisted preset
    // must not drive the initial camera — its 500ms animation would finish
    // after (and overwrite) the QTH orientation applied below.
    const { globeOrientation, observatoryMode: inObservatory } =
      useMapStore.getState();
    if (isMountRun && globeOrientation === "qth" && !inObservatory) {
      return;
    }

    const preset = regionPresets.find((p) => p.id === activePresetId);
    if (!preset) {
      return;
    }

    // An explicit preset selection wins over a still-pending QTH orientation.
    qthStartupDoneRef.current = true;

    const controls = controlsRef.current;
    const startPosition = camera.position.clone();
    const distance = 2.5 / preset.zoom;
    const endPosition = latLonToCameraPosition(
      preset.center.lat,
      preset.center.lon,
      distance,
    );

    // Smooth animation duration (500ms for responsive navigation)
    const duration = 500;
    const startTime = Date.now();

    if (presetPanRafRef.current) {
      cancelAnimationFrame(presetPanRafRef.current);
    }

    function animate() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);

      // Lerp camera position
      camera.position.lerpVectors(startPosition, endPosition, eased);

      // Always look at center of globe
      camera.lookAt(0, 0, 0);
      controls.update();

      if (progress < 1) {
        presetPanRafRef.current = requestAnimationFrame(animate);
      } else {
        presetPanRafRef.current = 0;
      }
    }

    animate();
  }, [activePresetId, regionPresets, camera]);

  // ─── Observatory mode: animate camera to home station on enter ─────────────
  useEffect(() => {
    const wasObservatory = prevObservatoryModeRef.current;
    prevObservatoryModeRef.current = observatoryMode;

    // Only fire on rising edge (false → true)
    if (!observatoryMode || wasObservatory) {
      return;
    }

    // Need a station with coordinates to animate to
    if (!station || station.lat == null || station.lon == null) {
      return;
    }

    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    // Cancel any in-flight observatory pan animation
    if (observatoryPanRafRef.current) {
      cancelAnimationFrame(observatoryPanRafRef.current);
    }

    const startPosition = camera.position.clone();
    const currentDistance = startPosition.length();
    const endPosition = latLonToCameraPosition(
      station.lat,
      station.lon,
      currentDistance,
    );

    const duration = 1500;
    const startTime = Date.now();

    function animateObservatoryPan() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);

      camera.position.lerpVectors(startPosition, endPosition, eased);
      camera.lookAt(0, 0, 0);
      controls!.update();

      if (progress < 1) {
        observatoryPanRafRef.current = requestAnimationFrame(
          animateObservatoryPan,
        );
      } else {
        observatoryPanRafRef.current = 0;
      }
    }

    animateObservatoryPan();

    return () => {
      if (observatoryPanRafRef.current) {
        cancelAnimationFrame(observatoryPanRafRef.current);
        observatoryPanRafRef.current = 0;
      }
    };
  }, [observatoryMode, station, camera]);

  // ─── Initial orientation: center the operator's QTH on mount ───────────────
  // Positions the camera at most once per globe mount. The station can
  // hydrate or profile-sync after mount, so wait for the first station with
  // a configured grid (a callsign-only profile has grid "" at lat/lon 0,0 —
  // not a QTH). The wait ends as soon as the user navigates themselves or
  // picks a preset. Observatory mode has its own home animation, so skip it.
  useEffect(() => {
    const { globeOrientation, observatoryMode: inObservatory } =
      useMapStore.getState();
    if (globeOrientation !== "qth" || inObservatory) {
      qthStartupDoneRef.current = true;
      return;
    }

    const applyIfValid = (
      home: { grid?: string; lat?: number | null; lon?: number | null } | null,
    ): boolean => {
      if (qthStartupDoneRef.current) return true;
      if (!home?.grid || home.lat == null || home.lon == null) return false;
      qthStartupDoneRef.current = true;

      // QTH owns startup: stop a mount-time preset pan that slipped through.
      if (presetPanRafRef.current) {
        cancelAnimationFrame(presetPanRafRef.current);
        presetPanRafRef.current = 0;
      }

      const { rotation, zoom } = useMapStore.getState();
      camera.position.copy(
        qthCameraPosition(home.lat, home.lon, 2.5 / zoom, rotation.x),
      );
      camera.lookAt(0, 0, 0);
      controlsRef.current?.update();
      return true;
    };

    if (applyIfValid(useProfileStore.getState().station)) return;

    const unsubscribe = useProfileStore.subscribe((state) => {
      if (applyIfValid(state.station)) unsubscribe();
    });

    // The user starting their own navigation cancels the pending orientation.
    const controls = controlsRef.current;
    const giveUp = () => {
      qthStartupDoneRef.current = true;
      unsubscribe();
    };
    controls?.addEventListener("start", giveUp);

    return () => {
      unsubscribe();
      controls?.removeEventListener("start", giveUp);
    };
  }, [camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      enableZoom={true}
      enableRotate={!observatoryMode}
      minDistance={minimumDistance}
      maxDistance={4}
      dampingFactor={0.1}
      enableDamping
      autoRotate={autoRotate}
    />
  );
}

/**
 * Globe scene content
 */
interface GlobeSceneProps {
  displayTime: Date;
  onLocationClick?: (
    lat: number,
    lon: number,
    screenPos: { x: number; y: number },
  ) => void;
  onDoubleClick?: (
    lat: number,
    lon: number,
    screenPos: { x: number; y: number },
  ) => void;
  onLocationHover?: (
    lat: number,
    lon: number,
    screenPos: { x: number; y: number },
  ) => void;
  onHoverEnd?: () => void;
  onPinHover?: (pin: MapPin, screenPos: { x: number; y: number }) => void;
  onPinLeave?: () => void;
  onTargetHover?: (screenPos: { x: number; y: number }) => void;
  onTargetHoverEnd?: () => void;
  onSpotHover?: (
    data: SpotDetailsData,
    screenPos: { x: number; y: number },
  ) => void;
  onSpotHoverEnd?: () => void;
  onClusterClick?: (
    cluster: SpotClusterData,
    screenPos: { x: number; y: number },
  ) => void;
  onAlertClick?: (
    alert: WeatherAlert,
    screenPos: { x: number; y: number },
  ) => void;
  onFireClick?: (
    hotspot: FireHotspot,
    screenPos: { x: number; y: number },
  ) => void;
  onRadarAnimState?: (state: RadarAnimationState) => void;
}

const GlobeScene = React.memo(function GlobeScene({
  displayTime,
  onLocationClick,
  onDoubleClick,
  onLocationHover,
  onHoverEnd,
  onPinHover,
  onPinLeave,
  onTargetHover,
  onTargetHoverEnd,
  onSpotHover,
  onSpotHoverEnd,
  onClusterClick,
  onAlertClick,
  onFireClick,
  onRadarAnimState,
}: GlobeSceneProps) {
  const layers = useMapStore((s) => s.layers);
  const target = useMapStore((s) => s.target);
  const pathMode = useMapStore((s) => s.pathMode);
  const mapStyle = useMapStore((s) => s.mapStyle);
  const rotation = useMapStore((s) => s.rotation);
  const labelOptions = useMapStore((s) => s.labelOptions);
  const selectedSatelliteId = useMapStore((s) => s.selectedSatelliteId);
  const isStandard = mapStyle === "standard";
  const subscriptionTier = useProfileStore((s) => s.subscriptionTier);
  const tileProvider = useMemo(
    () => selectTileProvider(mapStyle, subscriptionTier),
    [mapStyle, subscriptionTier],
  );
  const [tileFailCount, setTileFailCount] = useState(0);
  const MAX_TILE_RETRIES = 3;
  const useTileFallback = tileFailCount >= MAX_TILE_RETRIES;

  // Reset error state when tile provider changes (style switch or tier upgrade)
  useEffect(() => {
    setTileFailCount(0);
  }, [tileProvider.id]);

  const station = useUserStore((s) => s.station);
  const pins = usePinStore((s) => s.pins);
  const { data: auroraData } = useAuroraData(layers.aurora);
  const currentSFI = useCurrentSFI();
  const { earthquakes: earthquakeData } = useEarthquakes(layers.earthquakes);
  const { alerts: weatherAlerts } = useWeatherAlerts(layers.weather);
  const { strikes: lightningStrikes } = useLightning(layers.lightning);
  const { hotspots: fireHotspots } = useFires(layers.fires);
  const { repeaters } = useRepeaters(layers.repeaters);
  const { gauges: riverGauges } = useRiverGauges(layers.riverGauges);
  const { stations: aprsStations } = useAPRSStations(layers.aprs);
  const { cyclones: tropicalCyclones } = useTropicalCyclones(layers.tropical);
  const contestQsoData = useContestQsoLocations(layers.contestQsos);
  const loggedQsoData = useLoggedQsoLocations(layers.loggedQsos);
  const { manifest: radarManifest } = useWeatherRadar(layers.radar);
  // ── New layer data hooks (Wave 8A) ─────────────────────────────────────
  const { beacons, currentBeacon, activeTransmissions } = useBeaconNetwork();
  const { activeShowers } = useMeteorShowers();
  const meteorShowerProps = useMemo(
    () =>
      activeShowers?.map((s) => ({
        name: s.name,
        lat: s.radiantLat,
        lon: s.radiantLon,
        zhr: s.zhr,
        bestFor6m: s.is6mFavorable,
        daysUntilPeak: s.daysUntilPeak,
      })) ?? [],
    [activeShowers],
  );
  const { grid: noiseFloorGrid } = useNoiseFloor(14); // 14 MHz (20m band default)
  const { data: drapData } = useDRAPOverlay();
  const { spots: wsprSpotsRaw } = useWSPRSpots("all");
  const wsprSpots = useMemo(
    () =>
      wsprSpotsRaw.map((s) => ({
        txCallsign: s.callsign,
        txGrid: s.grid,
        rxCallsign: s.rxCallsign,
        rxGrid: s.rxGrid,
        txLat: s.txLat,
        txLon: s.txLon,
        rxLat: s.rxLat,
        rxLon: s.rxLon,
        frequencyMHz: s.frequency,
        snr: s.snr,
        distanceKm: s.distance,
      })),
    [wsprSpotsRaw],
  );
  const { regions: sporadicERegions } = useSporadicE();
  const { regions: ductingRegions } = useDuctingForecast();
  const { satellites: satelliteData } = useSatellites(
    layers.satellites || layers.satelliteFootprints,
  );

  // FT8 enriched decodes for Ft8DecodeLayer3D (Zustand works in R3F reconciler)
  const ft8MyCallsign = useFt8SessionStore((s) => s.myCallsign);
  const ft8MyGrid = useFt8SessionStore((s) => s.myGrid);
  const ft8EnrichedDecodes = useFt8DecodeEnricher({
    myCallsign: ft8MyCallsign || undefined,
    myGrid: ft8MyGrid || undefined,
  });

  const compassRosePrefs = useCompassRosePrefs();
  const holdDurationMs = useSettingsStore(
    (s) => s.uiInteraction?.holdDurationMs ?? 500,
  );
  const uiPrefs = useUIInteractionPrefs();
  const mapPinScale = uiPrefs.mapPinScale ?? 1.0;

  // Fetch live spots for the grid glow overlay
  const { spots: liveSpots } = useLiveSpots({
    grid: station?.grid,
    enabled:
      layers.spots ||
      layers.spotTraces ||
      layers.gridActivity ||
      layers.spectrumRing,
  });

  // Resolve spot locations so glow positions match where arcs land
  const resolvedGlowSpots = useMemo(() => {
    if (!layers.spots && !layers.spotTraces && !layers.gridActivity) return [];
    return resolveSpotLocations(liveSpots);
  }, [liveSpots, layers.spots, layers.spotTraces, layers.gridActivity]);

  // Track which spot IDs have already triggered glows (avoid re-firing on every render)
  const prevGlowSpotIdsRef = useRef<Set<string>>(new Set());

  // Glow spots state — updated by effect, consumed by GridGlowOverlay
  const [glowSpots, setGlowSpots] = useState<GridGlowSpot[]>([]);

  // Feed new resolved spots into glowSpots via effect (NOT useMemo — refs must
  // only be mutated in effects to avoid double-firing in React strict mode).
  useEffect(() => {
    if (!layers.spots && !layers.spotTraces && !layers.gridActivity) return;
    const colorMode: SpotColorMode = uiPrefs.spotColorMode ?? "mode";
    const prevIds = prevGlowSpotIdsRef.current;
    const currentIds = new Set<string>();
    const newSpots: GridGlowSpot[] = [];
    const isInitialLoad = prevIds.size === 0 && resolvedGlowSpots.length > 0;

    for (const spot of resolvedGlowSpots) {
      currentIds.add(spot.id);
      if (prevIds.has(spot.id)) continue;

      const color = getSpotColor(spot, colorMode);
      const staggerOffset = isInitialLoad ? Math.random() * 1000 : 0;
      const ts = Date.now() - staggerOffset;

      // Derive 2-char grid field from resolved lat/lon so glow matches dot
      // position. Skip prefix-centroid fallbacks — a country centroid can sit
      // in open ocean or the wrong field, so only real locators light grids.
      if (!spot.dxLocApprox) {
        try {
          const grid4 = latLonToGrid(spot.dxLat, spot.dxLon, 4);
          newSpots.push({
            gridField: grid4.slice(0, 2),
            color,
            timestamp: ts,
          });
        } catch {
          // Skip if coordinates out of range
        }
      }

      if (!spot.spotterLocApprox) {
        try {
          const grid4 = latLonToGrid(spot.spotterLat, spot.spotterLon, 4);
          const field = grid4.slice(0, 2);
          if (
            !newSpots.some((r) => r.gridField === field && r.color === color)
          ) {
            newSpots.push({ gridField: field, color, timestamp: ts });
          }
        } catch {
          // Skip if coordinates out of range
        }
      }
    }

    prevGlowSpotIdsRef.current = currentIds;

    if (newSpots.length > 0) {
      setGlowSpots(newSpots);
    }
  }, [
    resolvedGlowSpots,
    layers.spots,
    layers.spotTraces,
    layers.gridActivity,
    uiPrefs.spotColorMode,
  ]);

  // ── Grid activity persistence overlay ────────────────────────────────────
  // Convert resolved glow spots to ActivitySpot[] for the grid activity hook.
  // Each spot produces up to two activity entries (spotter + DX positions).
  // Prefix-centroid fallbacks are excluded — 4-char squares demand a real
  // locator, or country centroids light mid-ocean squares.
  const activitySpots = useMemo((): ActivitySpot[] => {
    if (!layers.gridActivity) return [];
    const out: ActivitySpot[] = [];
    for (const s of resolvedGlowSpots) {
      const ts = s.time.getTime();
      if (!s.dxLocApprox) {
        out.push({ lat: s.dxLat, lon: s.dxLon, timestamp: ts });
      }
      if (!s.spotterLocApprox) {
        out.push({ lat: s.spotterLat, lon: s.spotterLon, timestamp: ts });
      }
    }
    return out;
  }, [resolvedGlowSpots, layers.gridActivity]);

  const gridActivityMap = useGridActivityMap(activitySpots);

  // ── Ionospheric ray path computation ────────────────────────────────────
  const kIndexData = useKIndex();
  const currentKp = useMemo(() => {
    const last = kIndexData.data?.[kIndexData.data.length - 1];
    return last?.kp_index ?? 2;
  }, [kIndexData.data]);

  const rayTraceResult = useMemo(() => {
    if (!layers.rayPath || !station || !target || !currentSFI) return null;
    try {
      return traceRayPath({
        startLat: station.lat,
        startLon: station.lon,
        endLat: target.lat,
        endLon: target.lon,
        frequencyMHz: 14.074,
        date: displayTime,
        sfi: currentSFI,
        kp: currentKp,
      });
    } catch {
      return null;
    }
  }, [layers.rayPath, station, target, currentSFI, currentKp, displayTime]);

  // Calculate path difficulty when station and target are set
  const pathDifficulty = useMemo((): DifficultyLevel | undefined => {
    if (!station || !target) {
      return undefined;
    }
    const metrics = getPathMetrics(
      station.lat,
      station.lon,
      target.lat,
      target.lon,
    );
    return metrics.difficulty;
  }, [station, target]);

  // Calculate target bearing when station and target are set
  const targetBearing = useMemo((): number | undefined => {
    if (!station || !target) {
      return undefined;
    }
    return getBearing(station.lat, station.lon, target.lat, target.lon);
  }, [station, target]);

  // Calculate greyline intensity based on station location
  const greylineIntensity = useMemo(() => {
    if (!station) {
      return "normal" as const;
    }
    return getGreylineIntensity(station.lat, station.lon, displayTime);
  }, [station, displayTime]);

  // Subsolar point for night-side border enhancement
  const subsolar = useMemo(() => getSubsolarPoint(displayTime), [displayTime]);

  // ── NVIS coverage data ────────────────────────────────────────────────
  const nvisData = useMemo(() => {
    if (!layers.nvis || !station || !currentSFI) return null;
    const now = displayTime;
    const utcHour = now.getUTCHours();
    const month = now.getUTCMonth() + 1;
    const result = calculateNVISAtLocation(
      currentSFI,
      currentKp,
      station.lat,
      station.lon,
      utcHour,
      month,
    );
    if (result.quality === "none") return null;
    return {
      center: { lat: station.lat, lon: station.lon },
      radiusKm: result.radiusKm,
      usableBands: result.usableBands,
      quality: result.quality,
      criticalFreqMHz: result.criticalFreqMHz,
      maxUsableFreqMHz: result.maxUsableFreqMHz,
    };
  }, [layers.nvis, station, currentSFI, currentKp, displayTime]);

  // ── Terminator enhancement points ─────────────────────────────────────
  const terminatorPoints = useMemo(() => {
    if (!layers.greyline) return [];
    return getTerminatorPoints(displayTime, 180);
  }, [layers.greyline, displayTime]);

  // ── Spectrum waterfall band activity accumulator ──────────────────────
  // Samples live spot counts per band every 30 seconds, keeps last 20 rows
  const waterfallRowsRef = useRef<BandActivityRow[]>([]);
  const [waterfallRows, setWaterfallRows] = useState<BandActivityRow[]>([]);

  // Use ref for liveSpots to avoid restarting the interval on every spot update
  const liveSpotsRef = useRef(liveSpots);
  liveSpotsRef.current = liveSpots;

  useEffect(() => {
    if (!layers.spectrumRing) {
      waterfallRowsRef.current = [];
      setWaterfallRows([]);
      return;
    }

    if (waterfallRowsRef.current.length > 0 || liveSpots.length === 0) return;
    const history = buildBandActivityHistory(liveSpots);
    waterfallRowsRef.current = history;
    setWaterfallRows(history);
  }, [layers.spectrumRing, liveSpots]);

  useEffect(() => {
    if (!layers.spectrumRing) return;

    const sampleBandCounts = () => {
      const row = createBandActivitySnapshot(liveSpotsRef.current);
      if (!row) return;
      const rows = [...waterfallRowsRef.current, row].slice(
        -WATERFALL_MAX_ROWS,
      );
      waterfallRowsRef.current = rows;
      setWaterfallRows(rows);
    };

    const intervalId = setInterval(
      sampleBandCounts,
      WATERFALL_SAMPLE_INTERVAL_MS,
    );
    return () => clearInterval(intervalId);
  }, [layers.spectrumRing]);

  // ── Satellite footprints (derived from satellite positions) ───────────
  const satelliteFootprints = useMemo(() => {
    if (
      !layers.satelliteFootprints ||
      !satelliteData ||
      satelliteData.length === 0
    )
      return [];
    // Category color map (mirrors SatelliteOverlay)
    const catColors: Record<string, string> = {
      iss: "#ffffff",
      fm: "#00ff88",
      linear: "#00ccff",
      digital: "#ff9933",
      weather: "#cc88ff",
    };
    // Only show visible satellites with valid positions, limit to 5
    return satelliteData
      .filter((s) => s.isVisible && s.position)
      .slice(0, 5)
      .map((s) => ({
        satelliteId: String(s.noradId),
        lat: s.position.lat,
        lon: s.position.lon,
        altitudeKm: s.position.alt,
        color: catColors[s.category] ?? "#aaaaaa",
      }));
  }, [layers.satelliteFootprints, satelliteData]);

  // Handle click on globe surface
  const handleGlobeClick = useCallback(
    (lat: number, lon: number, screenPos: { x: number; y: number }) => {
      onLocationClick?.(lat, lon, screenPos);
    },
    [onLocationClick],
  );

  // Handle hover on globe surface
  const handleGlobeHover = useCallback(
    (lat: number, lon: number, screenPos: { x: number; y: number }) => {
      onLocationHover?.(lat, lon, screenPos);
    },
    [onLocationHover],
  );

  const targetHoverPosition = useMemo(() => {
    if (!target) {
      return null;
    }
    const phi = (90 - target.lat) * (Math.PI / 180);
    const theta = (target.lon + 180) * (Math.PI / 180);
    const r = 1.02;
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta),
    );
  }, [target]);

  return (
    <>
      <SceneLighting displayTime={displayTime} />

      {/* Starfield background */}
      <Stars
        radius={100}
        depth={50}
        count={3000}
        factor={4}
        saturation={0}
        fade
        speed={0.5}
      />

      {/* Earth tilt group — rotates the globe and all surface overlays */}
      <group rotation={[0, 0, (rotation.x * Math.PI) / 180]}>
        {/* Depth-only occlusion sphere — gives depth-tested overlays a clean
            analytic surface so the far side clips correctly (see
            globeRenderOrder.ts) */}
        <GlobeDepthDome />

        {/* Globe click/hover handler wrapping the Earth */}
        <GlobeClickHandler
          onLocationClick={handleGlobeClick}
          onDoubleClick={onDoubleClick}
          onLocationHover={handleGlobeHover}
          onHoverEnd={onHoverEnd}
          holdDurationMs={holdDurationMs}
        >
          {/* Earth sphere — tiled globe with static fallback */}
          {useTileFallback ? (
            <EarthSphere grayscale={isStandard} />
          ) : (
            <TiledGlobe
              provider={tileProvider}
              displayTime={displayTime}
              requiresAuth={tileProvider.requiresAuth}
              onError={() => setTileFailCount((c) => c + 1)}
            />
          )}
        </GlobeClickHandler>

        {/* Night side darkening overlay */}
        {layers.terminator && (
          <NightOverlay date={displayTime} opacity={isStandard ? 0.75 : 0.6} />
        )}

        {/* Day/night terminator line */}
        {layers.terminator && (
          <Terminator date={displayTime} standardMode={isStandard} />
        )}

        {/* Greyline band with intensity-based visualization.
            This is the ONLY static greyline band. GrayLineZone used to draw a
            second fixed ±5° ribbon in the same amber under the same toggle,
            which just stacked a brighter stripe inside this one. */}
        {layers.greyline && (
          <Greyline date={displayTime} intensity={greylineIntensity} />
        )}

        {/* Aurora overlay */}
        {layers.aurora && auroraData && (
          <AuroraOverlay auroraData={auroraData} minProbability={10} />
        )}

        {/* Night lights overlay - city lights on dark side */}
        {!isStandard && layers.nightLights && (
          <NightLightsOverlay date={displayTime} />
        )}

        {/* Tile-based OSM labels overlay — zoom-dependent boundaries and names */}
        {labelOptions.tileLabels && !useTileFallback && <TiledLabels />}

        {/* Country borders + labels overlay */}
        <LabelsOverlay
          showLabels={layers.labels}
          subsolarLat={subsolar.lat}
          subsolarLon={subsolar.lon}
        />

        {/* MUF overlay */}
        {layers.muf && currentSFI && (
          <MUFOverlay date={displayTime} sfi={currentSFI} opacity={0.45} />
        )}

        {/* Satellite overlay */}
        {layers.satellites && <SatelliteOverlay />}

        {/* ISS Tracker overlay */}
        {layers.issTracker && <ISSTrackerOverlay />}

        {/* Hazard overlays */}
        {layers.earthquakes && earthquakeData.length > 0 && (
          <EarthquakeOverlay3D earthquakes={earthquakeData} />
        )}
        {layers.weather && weatherAlerts.length > 0 && (
          <WeatherAlerts3D alerts={weatherAlerts} onAlertClick={onAlertClick} />
        )}
        {layers.lightning && lightningStrikes.length > 0 && (
          <LightningOverlay3D strikes={lightningStrikes} />
        )}
        {layers.fires && fireHotspots.length > 0 && (
          <FireOverlay3D hotspots={fireHotspots} onFireClick={onFireClick} />
        )}
        {layers.repeaters && repeaters.length > 0 && (
          <RepeaterOverlay3D repeaters={repeaters} />
        )}
        {layers.riverGauges && riverGauges.length > 0 && (
          <RiverGaugeOverlay3D gauges={riverGauges} />
        )}
        {layers.aprs && aprsStations.length > 0 && (
          <APRSOverlay3D stations={aprsStations} />
        )}
        {layers.tropical && tropicalCyclones.length > 0 && (
          <TropicalCycloneOverlay3D cyclones={tropicalCyclones} />
        )}

        {/* Station QTH marker - always visible in AtmosPulse mode */}
        {station?.lat != null && station?.lon != null && (
          <StationMarker3D
            lat={station.lat}
            lon={station.lon}
            callsign={station.callsign ?? ""}
          />
        )}

        {layers.radar && radarManifest && (
          <WeatherRadarOverlay
            manifest={radarManifest}
            onAnimationState={onRadarAnimState}
          />
        )}
        {layers.goesCloud && <GOESCloudOverlay3D />}
        {layers.tec && <TECOverlay3D />}
        {layers.sst && <SSTOverlay3D />}

        {/* === Propagation Layers === */}
        {layers.nvis && nvisData && (
          <NVISOverlay3D
            center={nvisData.center}
            radiusKm={nvisData.radiusKm}
            usableBands={nvisData.usableBands}
            quality={nvisData.quality}
            criticalFreqMHz={nvisData.criticalFreqMHz}
            maxUsableFreqMHz={nvisData.maxUsableFreqMHz}
          />
        )}

        {layers.sporadicE &&
          sporadicERegions &&
          sporadicERegions.length > 0 && (
            <SporadicEOverlay3D regions={sporadicERegions} />
          )}

        {layers.drap && drapData && <DRAPOverlay3D data={drapData} />}

        {layers.ducting && ductingRegions && ductingRegions.length > 0 && (
          <DuctingOverlay3D regions={ductingRegions} />
        )}

        {layers.noiseFloor && noiseFloorGrid && (
          <NoiseFloorOverlay3D grid={noiseFloorGrid} />
        )}

        {layers.geomagField && (
          <GeomagneticFieldLines3D kpIndex={currentKp ?? 2} />
        )}

        {/* Animated glow riding the terminator. Driven by the station-local
            greyline intensity so it appears while greyline propagation is
            actually happening and returns 0 (renders nothing) otherwise --
            it used to be hardcoded to 0.5, painting a permanent second
            amber band over the static Greyline ribbon.

            Gated on `station` as well: greylineIntensity falls back to
            "normal" when no QTH is set (that fallback is for the static band,
            which has to look like something regardless). "Greyline is peaking
            at your location" is a claim we cannot make without a location, so
            an unconfigured user gets the static band only. */}
        {layers.greyline &&
          station &&
          terminatorPoints &&
          terminatorPoints.length > 0 && (
            <TerminatorEnhancement3D
              terminatorPoints={terminatorPoints}
              intensity={getGreylineGlowIntensity(greylineIntensity)}
            />
          )}

        {/* === Activity Layers === */}
        {layers.wspr && wsprSpots.length > 0 && (
          <WSPROverlay3D spots={wsprSpots} />
        )}

        {/* QSO location markers -- contest + logbook, mirrors FlatMapView's
            drawContestQsos/drawLoggedQsos band-color dot semantics */}
        {((layers.contestQsos && contestQsoData) ||
          (layers.loggedQsos && loggedQsoData)) && (
          <QsoLocationsOverlay3D
            contestQsos={contestQsoData?.qsos ?? []}
            loggedQsos={loggedQsoData?.qsos ?? []}
          />
        )}

        {layers.beacons && beacons && beacons.length > 0 && (
          <BeaconNetworkOverlay3D
            beacons={beacons}
            currentBeaconIndex={currentBeacon?.slotInCycle ?? 0}
            activeFrequencyMHz={
              activeTransmissions?.[0]?.frequencyKHz
                ? activeTransmissions[0].frequencyKHz / 1000
                : 14.1
            }
          />
        )}

        {layers.meteorShowers && activeShowers && activeShowers.length > 0 && (
          <MeteorShowerOverlay3D showers={meteorShowerProps} />
        )}

        {layers.timeStations && <TimeStationsOverlay3D />}

        {layers.spectrumRing && (
          <SpectrumWaterfallRing3D
            bandActivity={waterfallRows}
            bandNames={WATERFALL_BAND_NAMES}
          />
        )}

        {/* === Satellite Layers === */}
        {layers.satelliteFootprints &&
          satelliteFootprints &&
          satelliteFootprints.length > 0 && (
            <SatelliteFootprint3D
              footprints={satelliteFootprints}
              selectedSatelliteId={
                selectedSatelliteId != null ? String(selectedSatelliteId) : null
              }
            />
          )}

        {/* Ionospheric shell layers — translucent D/E/F1/F2 spheres */}
        {layers.ionosphere && <IonosphericShells displayTime={displayTime} />}

        {/* Live spot arcs */}
        {layers.spots && (
          <LiveSpotArcs
            grid={station?.grid}
            onSpotHover={onSpotHover}
            onSpotHoverEnd={onSpotHoverEnd}
            onClusterClick={onClusterClick}
          />
        )}

        {/* Animated spot trace lines — "missile command" style */}
        {layers.spotTraces && (
          <AnimatedSpotTraces grid={station?.grid} maxTraces={40} />
        )}

        {/* FT8 Spotter — burst traces, grid heatmap, cycle radar */}
        {layers.ft8Spotter && <Ft8SpotterOverlay station={station} />}

        {/* FT8 Decode Layer — instanced markers + great-circle arcs for enriched decodes */}
        {layers.ft8Spotter && (
          <Ft8DecodeLayer3D
            decodes={ft8EnrichedDecodes}
            myLat={station?.lat}
            myLon={station?.lon}
          />
        )}

        {/* Persistent grid activity overlay — density-colored steady glow */}
        {layers.gridActivity && (
          <GridPersistOverlay activityMap={gridActivityMap} />
        )}

        {/* Grid glow overlay — pulsing glow on Maidenhead grid fields for recent spots */}
        {(layers.spots || layers.spotTraces || layers.gridActivity) && (
          <GridGlowOverlay spots={glowSpots} />
        )}

        {/* Pin markers from saved locations - distinctive pushpin style */}
        {pins.map((pin) => {
          const catMeta = getCategoryMeta(pin.category);
          return (
            <PinMarker
              key={pin.id}
              pinId={pin.id}
              lat={pin.lat}
              lon={pin.lon}
              color={pin.color || catMeta.color}
              label={pin.name || pin.grid}
              emoji={catMeta.icon}
              size={0.02}
              sizeScale={mapPinScale}
              onHover={(isHovered, screenPos) => {
                if (isHovered && onPinHover) {
                  onPinHover(pin, screenPos);
                } else if (!isHovered && onPinLeave) {
                  onPinLeave();
                }
              }}
            />
          );
        })}

        {/* Home station marker - House emoji, hover/click shows info tooltip */}
        {station && (
          <LocationMarker
            lat={station.lat}
            lon={station.lon}
            color="#4488FF"
            label={station.callsign}
            type="home"
            sizeScale={mapPinScale}
          />
        )}

        {/* Target location marker - Color based on difficulty */}
        {target && (
          <>
            {/* Hover hit area for the selected target marker */}
            {targetHoverPosition && (
              <mesh
                position={targetHoverPosition}
                onPointerEnter={(event) => {
                  event.stopPropagation();
                  onTargetHover?.({
                    x: event.nativeEvent.clientX,
                    y: event.nativeEvent.clientY,
                  });
                }}
                onPointerMove={(event) => {
                  event.stopPropagation();
                  onTargetHover?.({
                    x: event.nativeEvent.clientX,
                    y: event.nativeEvent.clientY,
                  });
                }}
                onPointerLeave={() => {
                  onTargetHoverEnd?.();
                }}
              >
                <sphereGeometry args={[0.055, 8, 8]} />
                <meshBasicMaterial
                  transparent
                  opacity={0}
                  depthTest={false}
                  depthWrite={false}
                />
              </mesh>
            )}

            <LocationMarker
              lat={target.lat}
              lon={target.lon}
              label={target.name || target.grid}
              type="target"
              difficulty={pathDifficulty}
              showDifficultyTag={true}
              sizeScale={mapPinScale}
            />

            {/* Path arc between home and target — ray path (bounces) or flat arc */}
            {station &&
              ((layers.rayPath || (uiPrefs.bandHeightArcs ?? true)) &&
              rayTraceResult ? (
                <RayPathArc
                  result={rayTraceResult}
                  startLat={station.lat}
                  startLon={station.lon}
                  endLat={target.lat}
                  endLon={target.lon}
                  pathMode={pathMode}
                  showIonosphereHighlights={layers.ionosphere}
                  displayTime={displayTime}
                />
              ) : (
                <PathArc
                  startLat={station.lat}
                  startLon={station.lon}
                  endLat={target.lat}
                  endLon={target.lon}
                  color={
                    pathDifficulty
                      ? getDifficultyColor(pathDifficulty)
                      : "#ff6b35"
                  }
                  pathMode={pathMode}
                />
              ))}
          </>
        )}

        {/* Highlighted arc for DX cluster selected spot */}
        <SelectedSpotArc />

        {/* Spot highlight effect */}
        <SpotHighlight />

        {/* Renderer-agnostic overlay layers (contest overlays, etc.) */}
        <OverlayLayers3D />

        {/* Compass rose overlay at operator's QTH */}
        {station && compassRosePrefs.enabled && (
          <CompassRose
            qthLat={station.lat}
            qthLon={station.lon}
            targetBearing={targetBearing}
            beamWidth={
              compassRosePrefs.showBeamWidth
                ? compassRosePrefs.beamWidth
                : undefined
            }
            visible={true}
            radius={1.01}
          />
        )}
      </group>
      {/* end Earth tilt group */}

      {/* Camera controls with spot focus */}
      <CameraController />
    </>
  );
});

export function GlobeView({
  displayTime,
  onLocationClick,
  hideRadarScrubber,
}: GlobeViewProps) {
  const zoom = useMapStore((s) => s.zoom);
  const target = useMapStore((s) => s.target);
  const tooltipPosition = useMapStore((s) => s.tooltipPosition);
  const setTooltipPosition = useMapStore((s) => s.setTooltipPosition);
  const flyoutPosition = useMapStore((s) => s.flyoutPosition);
  const setFlyoutPosition = useMapStore((s) => s.setFlyoutPosition);
  const setTarget = useMapStore((s) => s.setTarget);
  const setCenterLocation = useMapStore((s) => s.setCenterLocation);
  const mapStyle = useMapStore((s) => s.mapStyle);
  const station = useUserStore((s) => s.station);
  const subscriptionTier = useProfileStore((s) => s.subscriptionTier);
  const tileAttribution = useMemo(
    () => selectTileProvider(mapStyle, subscriptionTier).attribution,
    [mapStyle, subscriptionTier],
  );
  const { antennaType } = useActiveStationGain();
  const noiseEnvironment = useSettingsStore((s) => s.noiseEnvironment);
  const addPin = usePinStore((s) => s.addPin);
  const removePin = usePinStore((s) => s.removePin);
  const getPinById = usePinStore((s) => s.getPinById);
  const { pushAction } = useUndoStore();
  const updateFilter = useDXStore((s) => s.updateFilter);
  // Use allSpots (unfiltered) for tooltip matching to show all activity in an area
  const { allSpots } = useDXCluster();

  // The live feed that lights the grid-activity squares. React Query dedupes
  // on the query key, so this shares the scene component's cache entry rather
  // than issuing a second fetch.
  const { spots: tooltipLiveSpots } = useLiveSpots({
    grid: station?.grid,
    enabled: true,
  });

  // Watch store v2 — grid watch action for flyout
  const setWatch = useWatchStore((s) => s.setWatch);

  // FT8 Spotter HUD data (outside Canvas, gated by layer toggle).
  // Note: useFt8SpotterData() is also called inside Ft8SpotterOverlay (R3F tree).
  // This is intentional — R3F Canvas uses a separate React reconciler, so hooks
  // cannot be shared across the boundary. The merge logic is cheap (~500 items).
  const ft8SpotterEnabled = useMapStore((s) => s.layers.ft8Spotter);
  const ft8SpotterData = useFt8SpotterData();

  // Radar animation state — lifted from WeatherRadarOverlay (inside Canvas)
  // to the outer GlobeView so the scrubber UI can render outside the R3F tree.
  const radarLayerEnabled = useMapStore((s) => s.layers.radar);
  const [radarAnimState, setRadarAnimState] =
    useState<RadarAnimationState | null>(null);

  // State for AddPinDialog
  const [addPinDialogOpen, setAddPinDialogOpen] = useState(false);
  const [addPinData, setAddPinData] = useState<{
    lat: number;
    lon: number;
    grid: string;
  } | null>(null);

  // State for GridResearchPanel
  const [researchPanelOpen, setResearchPanelOpen] = useState(false);
  const [researchGrid, setResearchGrid] = useState<string | null>(null);

  // State for pin-specific hover flyout
  const [hoveredPinData, setHoveredPinData] = useState<{
    pin: MapPin;
    screenPos: { x: number; y: number };
  } | null>(null);

  // State for editing an existing pin
  const [editingPin, setEditingPin] = useState<MapPin | null>(null);

  // State for target hover tooltip
  const [hoveredTargetPos, setHoveredTargetPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // State for spot hover tooltip (SpotDetailsFlyout)
  const [hoveredSpotData, setHoveredSpotData] =
    useState<SpotDetailsData | null>(null);
  const [hoveredSpotPos, setHoveredSpotPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // State for cluster click popover
  const [selectedCluster, setSelectedCluster] =
    useState<SpotClusterData | null>(null);
  const [clusterScreenPos, setClusterScreenPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // State for weather alert flyout and modal
  const [clickedAlertData, setClickedAlertData] = useState<{
    alert: WeatherAlert;
    screenPos: { x: number; y: number };
  } | null>(null);
  const [alertModalData, setAlertModalData] = useState<WeatherAlert | null>(
    null,
  );

  // State for fire hotspot flyout
  const [clickedFireData, setClickedFireData] = useState<{
    hotspot: FireHotspot;
    screenPos: { x: number; y: number };
  } | null>(null);

  // Get spots in the hovered grid for tooltip
  // Matches if either DX or spotter grid starts with the hovered 4-char prefix
  // Use ref for allSpots to avoid re-filtering on every DX cluster update
  const allSpotsRef = useRef(allSpots);
  allSpotsRef.current = allSpots;
  // Live spots are what light the grid-activity squares, so the tooltip has to
  // consult them too — cluster spots rarely carry a grid, which is why
  // hovering a lit square used to report "No active spots".
  const glowSpotsForTooltipRef = useRef(tooltipLiveSpots);
  glowSpotsForTooltipRef.current = tooltipLiveSpots;
  const tooltipSpots = useMemo(() => {
    if (!tooltipPosition?.grid) {
      return [];
    }
    const gridPrefix = tooltipPosition.grid.toUpperCase().slice(0, 4);
    const clusterMatches = allSpotsRef.current.filter((spot) => {
      const dxGrid = (spot.dxGrid || "").toUpperCase();
      const spotterGrid = (spot.spotterGrid || "").toUpperCase();
      return (
        dxGrid.startsWith(gridPrefix) || spotterGrid.startsWith(gridPrefix)
      );
    });
    // Resolved lazily: only a tooltip opening on a new grid pays for it.
    return mergeGridSpots(
      clusterMatches,
      liveSpotsInGrid(
        resolveSpotLocations(glowSpotsForTooltipRef.current),
        gridPrefix,
      ),
    );
  }, [tooltipPosition?.grid]);

  // Fetch solar conditions for optimal-band signal estimate
  const kIndexQuery = useKIndex();
  const solarFluxQuery = useSolarFlux();

  const currentKp = useMemo(() => {
    const last = kIndexQuery.data?.[kIndexQuery.data.length - 1];
    return last?.kp_index ?? 3;
  }, [kIndexQuery.data]);

  const currentSfi = useMemo(() => {
    const last = solarFluxQuery.data?.[solarFluxQuery.data.length - 1];
    return last?.flux ?? 100;
  }, [solarFluxQuery.data]);

  const isEstimatedConditions =
    kIndexQuery.isPlaceholderData ||
    solarFluxQuery.isPlaceholderData ||
    !kIndexQuery.data?.length ||
    !solarFluxQuery.data?.length;

  const targetDifficulty = useMemo(() => {
    if (!station || !target) {
      return undefined;
    }
    return getPathMetrics(station.lat, station.lon, target.lat, target.lon)
      .difficulty;
  }, [station, target]);

  const optimalSignal = useMemo(() => {
    if (!station || !target || !tooltipPosition) {
      return null;
    }
    try {
      const distance = getDistance(
        station.lat,
        station.lon,
        target.lat,
        target.lon,
      );
      const antennaGainDbi = getAntennaGainForPath(antennaType, distance);
      const conditions = getEnhancedBandConditions(
        station.lat,
        station.lon,
        target.lat,
        target.lon,
        currentKp,
        currentSfi,
        displayTime,
        100,
        "FT8",
        antennaGainDbi,
        noiseEnvironment,
      );
      const best = pickOptimalBandCondition(conditions);
      if (!best) {
        return null;
      }
      return {
        band: best.band,
        status: best.status,
        sUnit: best.sUnit,
        snrEstimate: best.snrEstimate,
        confidence: best.signalPrediction?.confidence,
        notes: best.notes,
        isEstimated: isEstimatedConditions,
      };
    } catch {
      return null;
    }
  }, [
    station,
    target,
    tooltipPosition,
    currentKp,
    currentSfi,
    displayTime,
    isEstimatedConditions,
    antennaType,
    noiseEnvironment,
  ]);

  // Handle globe click - show flyout only (no target commit — that only
  // happens when the user picks "Set Target" from the flyout, below)
  const handleGlobeClick = useCallback(
    (lat: number, lon: number, screenPos: { x: number; y: number }) => {
      const grid = latLonToGrid(lat, lon);
      setFlyoutPosition({ x: screenPos.x, y: screenPos.y, lat, lon, grid });
      setTooltipPosition(null); // Hide tooltip when flyout opens
      setHoveredPinData(null); // Clear pin flyout
      setHoveredTargetPos(null); // Clear target hover
      setSelectedCluster(null); // Close cluster popover
      setClusterScreenPos(null);
      setClickedAlertData(null); // Clear weather alert flyout
    },
    [setFlyoutPosition, setTooltipPosition],
  );

  // Q2: Handle double-click - center view without setting target
  const handleDoubleClick = useCallback(
    (lat: number, lon: number) => {
      // Close any open flyout/tooltip
      setFlyoutPosition(null);
      setTooltipPosition(null);
      setHoveredTargetPos(null);
      // Center the view on this location (smooth animation in CameraController)
      setCenterLocation(lat, lon);
    },
    [setFlyoutPosition, setTooltipPosition, setCenterLocation],
  );

  // Handle globe hover - show tooltip
  const handleGlobeHover = useCallback(
    (lat: number, lon: number, screenPos: { x: number; y: number }) => {
      // Don't show tooltip if flyout is open
      if (flyoutPosition) {
        return;
      }
      const grid = latLonToGrid(lat, lon);
      setTooltipPosition({ x: screenPos.x, y: screenPos.y, grid });
    },
    [flyoutPosition, setTooltipPosition],
  );

  // Handle hover end
  const handleHoverEnd = useCallback(() => {
    setTooltipPosition(null);
  }, [setTooltipPosition]);

  // Handle pin hover - show pin-specific flyout
  const handlePinHover = useCallback(
    (pin: MapPin, screenPos: { x: number; y: number }) => {
      setHoveredPinData({ pin, screenPos });
      setFlyoutPosition(null); // Close generic flyout
      setTooltipPosition(null); // Close tooltip
      setHoveredTargetPos(null); // Close target hover
      setClickedAlertData(null); // Close weather alert flyout
    },
    [setFlyoutPosition, setTooltipPosition],
  );

  // Handle pin hover leave
  const handlePinLeave = useCallback(() => {
    // Don't immediately clear - let auto-dismiss handle it
    // PinFlyout manages its own proximity-based dismissal
  }, []);

  // Handle pin flyout close
  const handlePinFlyoutClose = useCallback(() => {
    setHoveredPinData(null);
  }, []);

  const handleTargetHover = useCallback(
    (screenPos: { x: number; y: number }) => {
      // Target hover takes precedence over generic grid tooltip
      setHoveredTargetPos(screenPos);
      setTooltipPosition(null);
    },
    [setTooltipPosition],
  );

  const handleTargetHoverEnd = useCallback(() => {
    setHoveredTargetPos(null);
  }, []);

  // Handle spot hover from LiveSpotArcs (via SpotLabel or SpotEndpointHitArea)
  const handleSpotHover = useCallback(
    (data: SpotDetailsData, screenPos: { x: number; y: number }) => {
      setHoveredSpotData(data);
      setHoveredSpotPos(screenPos);
    },
    [],
  );

  const handleSpotHoverEnd = useCallback(() => {
    setHoveredSpotData(null);
    setHoveredSpotPos(null);
  }, []);

  // Handle cluster click from LiveSpotArcs → SpotCluster
  const handleClusterClick = useCallback(
    (cluster: SpotClusterData, screenPos: { x: number; y: number }) => {
      setSelectedCluster(cluster);
      setClusterScreenPos(screenPos);
    },
    [],
  );

  const handleClusterClose = useCallback(() => {
    setSelectedCluster(null);
    setClusterScreenPos(null);
  }, []);

  // Handle weather alert click - show alert flyout
  const handleAlertClick = useCallback(
    (alert: WeatherAlert, screenPos: { x: number; y: number }) => {
      // Clear all other flyouts (mutual exclusion)
      setHoveredPinData(null);
      setHoveredSpotData(null);
      setHoveredSpotPos(null);
      setSelectedCluster(null);
      setClusterScreenPos(null);
      setFlyoutPosition(null);
      setTooltipPosition(null);
      setHoveredTargetPos(null);
      setClickedFireData(null);
      setClickedAlertData({ alert, screenPos });
    },
    [setFlyoutPosition, setTooltipPosition],
  );

  const handleAlertViewDetails = useCallback((alert: WeatherAlert) => {
    setClickedAlertData(null);
    setAlertModalData(alert);
  }, []);

  const handleAlertModalClose = useCallback(() => {
    setAlertModalData(null);
  }, []);

  const handleAlertFlyoutClose = useCallback(() => {
    setClickedAlertData(null);
  }, []);

  // Handle fire hotspot click - show fire flyout
  const handleFireClick = useCallback(
    (hotspot: FireHotspot, screenPos: { x: number; y: number }) => {
      // Clear all other flyouts (mutual exclusion)
      setHoveredPinData(null);
      setHoveredSpotData(null);
      setHoveredSpotPos(null);
      setSelectedCluster(null);
      setClusterScreenPos(null);
      setFlyoutPosition(null);
      setTooltipPosition(null);
      setHoveredTargetPos(null);
      setClickedAlertData(null);
      setClickedFireData({ hotspot, screenPos });
    },
    [setFlyoutPosition, setTooltipPosition],
  );

  const handleFireFlyoutClose = useCallback(() => {
    setClickedFireData(null);
  }, []);

  // Handle edit pin from PinFlyout
  const handleEditPinFromFlyout = useCallback((pin: MapPin) => {
    setEditingPin(pin);
    setAddPinDialogOpen(true);
    setAddPinData({ lat: pin.lat, lon: pin.lon, grid: pin.grid });
    setHoveredPinData(null);
  }, []);

  // Handle delete pin from PinFlyout
  const handleDeletePinFromFlyout = useCallback(() => {
    if (!hoveredPinData) return;
    const pin = getPinById(hoveredPinData.pin.id);
    if (pin) {
      pushAction({
        type: "DELETE_PIN",
        pinId: pin.id,
        pinData: pin,
        description: `Deleted pin "${pin.name || pin.grid}"`,
      });
      removePin(pin.id);
    }
    setHoveredPinData(null);
  }, [hoveredPinData, getPinById, pushAction, removePin]);

  // Handle set target from PinFlyout
  const handleSetTargetFromFlyout = useCallback(
    (lat: number, lon: number, grid: string) => {
      setTarget({ lat, lon, grid });
      setHoveredPinData(null);
    },
    [setTarget],
  );

  // Handle flyout close
  const handleFlyoutClose = useCallback(() => {
    setFlyoutPosition(null);
  }, [setFlyoutPosition]);

  // Handle opening AddPinDialog from flyout
  const handleOpenAddPinDialog = useCallback(
    (lat: number, lon: number, grid: string) => {
      setAddPinData({ lat, lon, grid });
      setAddPinDialogOpen(true);
      setFlyoutPosition(null);
    },
    [setFlyoutPosition],
  );

  // Handle opening GridResearchPanel from flyout
  const handleOpenResearchPanel = useCallback(
    (grid: string) => {
      setResearchGrid(grid);
      setResearchPanelOpen(true);
      setFlyoutPosition(null);
    },
    [setFlyoutPosition],
  );

  // Handle adding a grid to watch list (v2: setWatch with WatchCriteria)
  const handleWatchGrid = useCallback(
    (grid: string) => {
      // Watch the 4-char grid prefix for broader matching
      const gridPrefix = grid.slice(0, 4).toUpperCase();
      setWatch({ gridPrefix, txOrRx: "either" });
      setFlyoutPosition(null);
    },
    [setWatch, setFlyoutPosition],
  );

  // Handle GridResearchPanel actions
  const handleResearchAction = useCallback(
    (action: GridResearchAction, grid: string) => {
      switch (action) {
        case "watch":
          handleWatchGrid(grid);
          break;
        case "pin": {
          // Need to compute lat/lon from grid
          try {
            const { lat, lon } = gridToLatLon(grid);
            handleOpenAddPinDialog(lat, lon, grid);
          } catch {
            // Grid conversion failed, ignore
          }
          break;
        }
        case "setTarget": {
          try {
            const { lat, lon } = gridToLatLon(grid);
            setTarget({ lat, lon, grid });
            setResearchPanelOpen(false);
          } catch {
            // Grid conversion failed, ignore
          }
          break;
        }
        case "close":
          setResearchPanelOpen(false);
          break;
      }
    },
    [handleWatchGrid, handleOpenAddPinDialog, setTarget],
  );

  // Handle flyout actions (fallback for unhandled actions)
  const handleFlyoutAction = useCallback(
    (action: MapFlyoutAction) => {
      if (!flyoutPosition) {
        return;
      }

      switch (action) {
        case "setTarget":
          setTarget({
            lat: flyoutPosition.lat,
            lon: flyoutPosition.lon,
            grid: flyoutPosition.grid,
          });
          // Explicit target commit — this is the only place a long-press
          // location should notify the host page (e.g. for contest-entry
          // focus), not the initial flyout open.
          onLocationClick?.(flyoutPosition.lat, flyoutPosition.lon);
          break;
        case "addPin":
          // Fallback to simple add (dialog callback should handle this)
          addPin(flyoutPosition.lat, flyoutPosition.lon, flyoutPosition.grid);
          break;
        case "researchGrid":
          // Fallback to filter (panel callback should handle this)
          updateFilter("gridFilter", flyoutPosition.grid);
          break;
        case "watchGrid":
          // Fallback - should be handled by callback
          handleWatchGrid(flyoutPosition.grid);
          break;
      }
    },
    [
      flyoutPosition,
      setTarget,
      addPin,
      updateFilter,
      handleWatchGrid,
      onLocationClick,
    ],
  );

  return (
    <div className="w-full h-full min-h-[400px] bg-deep-space rounded-xl overflow-hidden relative isolate select-none">
      <GlobeErrorBoundary
        fallback={
          <div className="w-full h-full flex items-center justify-center bg-deep-space text-gray-500">
            <div className="text-center">
              <p>3D globe unavailable</p>
              <p className="text-sm mt-1">
                Try switching to Flat or Azimuthal view
              </p>
            </div>
          </div>
        }
      >
        <Canvas>
          <PerspectiveCamera
            makeDefault
            position={[0, 0, 2.5 / zoom]}
            fov={45}
            near={0.01}
            far={200}
          />
          <Suspense fallback={<GlobeLoader />}>
            <GlobeScene
              displayTime={displayTime}
              onLocationClick={handleGlobeClick}
              onDoubleClick={handleDoubleClick}
              onLocationHover={handleGlobeHover}
              onHoverEnd={handleHoverEnd}
              onPinHover={handlePinHover}
              onPinLeave={handlePinLeave}
              onTargetHover={handleTargetHover}
              onTargetHoverEnd={handleTargetHoverEnd}
              onSpotHover={handleSpotHover}
              onSpotHoverEnd={handleSpotHoverEnd}
              onClusterClick={handleClusterClick}
              onAlertClick={handleAlertClick}
              onFireClick={handleFireClick}
              onRadarAnimState={setRadarAnimState}
            />
          </Suspense>
        </Canvas>
      </GlobeErrorBoundary>

      {/* Tile attribution overlay */}
      <div className="absolute bottom-1 right-1 text-[10px] text-white/40 pointer-events-none select-none">
        {tileAttribution}
      </div>

      {/* Weather Radar Timeline Scrubber (hidden when host provides its own) */}
      {!hideRadarScrubber &&
        radarLayerEnabled &&
        radarAnimState &&
        radarAnimState.frameCount > 1 && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10">
            <div className="flex items-center gap-1.5 bg-void-black/85 backdrop-blur-sm rounded-full px-3 py-1.5 border border-white/10">
              {/* Play/Pause */}
              <button
                type="button"
                onClick={radarAnimState.togglePlay}
                className="text-white/70 hover:text-white transition-colors text-xs w-4 h-4 flex items-center justify-center"
              >
                {radarAnimState.isPlaying ? "\u23F8" : "\u25B6"}
              </button>
              {/* Frame dots */}
              <div className="flex gap-0.5 items-center">
                {radarAnimState.timestamps.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => radarAnimState.setFrame(i)}
                    className={`rounded-full transition-all ${
                      i === radarAnimState.activeIndex
                        ? "w-2 h-2 bg-plasma-orange shadow-[0_0_4px_rgba(255,107,53,0.6)]"
                        : radarAnimState.isNowcast[i]
                          ? "w-1.5 h-1.5 bg-blue-400/50 hover:bg-blue-400/80"
                          : "w-1.5 h-1.5 bg-white/30 hover:bg-white/60"
                    }`}
                  />
                ))}
              </div>
              {/* Timestamp */}
              <span className="text-[9px] text-white/50 font-mono ml-1 min-w-[40px] text-right">
                {radarAnimState.activeIndex >= 0 &&
                radarAnimState.timestamps[radarAnimState.activeIndex]
                  ? new Date(
                      radarAnimState.timestamps[radarAnimState.activeIndex] *
                        1000,
                    ).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })
                  : "--:--"}
              </span>
              {/* Nowcast indicator */}
              {radarAnimState.activeIndex >= 0 &&
                radarAnimState.isNowcast[radarAnimState.activeIndex] && (
                  <span className="text-[8px] text-blue-400 font-medium">
                    FCST
                  </span>
                )}
            </div>
          </div>
        )}

      {/* Tooltip overlay - rendered outside Canvas */}
      <MapTooltip
        visible={
          !!tooltipPosition &&
          !flyoutPosition &&
          !hoveredPinData &&
          !hoveredTargetPos &&
          !hoveredSpotData &&
          !selectedCluster &&
          !clickedAlertData &&
          !clickedFireData
        }
        position={tooltipPosition || { x: 0, y: 0 }}
        grid={tooltipPosition?.grid || ""}
        spots={tooltipSpots}
      />

      <TargetHoverTooltip
        visible={!!hoveredTargetPos}
        position={hoveredTargetPos || { x: 0, y: 0 }}
        label={target?.name || target?.grid || "Target"}
        grid={target?.grid}
        difficulty={targetDifficulty}
        optimalSignal={optimalSignal}
        signalUnavailableReason={
          station ? undefined : "Set your QTH to see optimal-band signal"
        }
      />

      {/* Spot detail flyout - shown when hovering over a spot label or endpoint */}
      <SpotDetailsFlyout
        visible={
          !!hoveredSpotData &&
          !flyoutPosition &&
          !hoveredPinData &&
          !selectedCluster &&
          !clickedAlertData &&
          !clickedFireData
        }
        position={hoveredSpotPos || { x: 0, y: 0 }}
        spot={hoveredSpotData}
      />

      {/* Cluster detail popover - shown when clicking a spot cluster */}
      <ClusterDetailPopover
        visible={!!selectedCluster}
        position={clusterScreenPos || { x: 0, y: 0 }}
        cluster={selectedCluster}
        onClose={handleClusterClose}
      />

      {/* Flyout menu overlay - rendered outside Canvas */}
      <MapFlyout
        visible={!!flyoutPosition && !hoveredPinData}
        position={flyoutPosition || { x: 0, y: 0 }}
        lat={flyoutPosition?.lat || 0}
        lon={flyoutPosition?.lon || 0}
        grid={flyoutPosition?.grid || ""}
        onAction={handleFlyoutAction}
        onClose={handleFlyoutClose}
        onOpenAddPinDialog={handleOpenAddPinDialog}
        onOpenResearchPanel={handleOpenResearchPanel}
        onWatchGrid={handleWatchGrid}
      />

      {/* Pin flyout - shown when hovering over an existing pin */}
      {hoveredPinData && (
        <PinFlyout
          visible
          position={hoveredPinData.screenPos}
          pin={hoveredPinData.pin}
          spots={allSpots}
          currentTargetGrid={target?.grid}
          onSetTarget={handleSetTargetFromFlyout}
          onEditPin={handleEditPinFromFlyout}
          onDeletePin={handleDeletePinFromFlyout}
          onClose={handlePinFlyoutClose}
        />
      )}

      {/* Weather alert flyout - shown when clicking a weather alert marker */}
      <WeatherAlertFlyout
        visible={!!clickedAlertData}
        position={clickedAlertData?.screenPos ?? { x: 0, y: 0 }}
        alert={clickedAlertData?.alert ?? null}
        onClose={handleAlertFlyoutClose}
        onViewDetails={handleAlertViewDetails}
      />

      {/* Weather alert modal - shown when clicking "View Full Alert" */}
      <WeatherAlertModal
        alert={alertModalData}
        onClose={handleAlertModalClose}
      />

      {/* Fire hotspot flyout - shown when clicking a fire marker */}
      <FireFlyout
        visible={!!clickedFireData}
        position={clickedFireData?.screenPos ?? { x: 0, y: 0 }}
        hotspot={clickedFireData?.hotspot ?? null}
        onClose={handleFireFlyoutClose}
      />

      {/* FT8 Spotter HUD — cycle timer, decode count, stats */}
      {ft8SpotterEnabled && (
        <Ft8SpotterHUD
          cycleProgress={ft8SpotterData.cycleProgress}
          totalDecodes={ft8SpotterData.totalDecodes}
          uniqueStations={ft8SpotterData.uniqueStations}
          currentBand={ft8SpotterData.currentBand}
          currentMode={ft8SpotterData.currentMode}
          isNewCycle={ft8SpotterData.isNewCycle}
          currentCycleCount={ft8SpotterData.currentCycleDecodes.length}
        />
      )}

      {/* Spot & pin size sliders - bottom left corner */}
      <MapSizeSliders />

      {/* AddPinDialog modal */}
      <AddPinDialog
        visible={addPinDialogOpen}
        mode={editingPin ? "edit" : "add"}
        pin={editingPin || undefined}
        location={addPinData || undefined}
        onClose={() => {
          setAddPinDialogOpen(false);
          setAddPinData(null);
          setEditingPin(null);
        }}
        onSave={() => {
          setAddPinDialogOpen(false);
          setAddPinData(null);
          setEditingPin(null);
        }}
      />

      {/* GridResearchPanel slide-out */}
      <GridResearchPanel
        visible={researchPanelOpen}
        grid={researchGrid || ""}
        onAction={handleResearchAction}
        onClose={() => setResearchPanelOpen(false)}
      />
    </div>
  );
}
