/**
 * GlobeView Component
 *
 * 3D interactive globe using React Three Fiber.
 * Provides camera controls, lighting, and click-to-select functionality.
 */

import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { globeRegionDistance } from "@/lib/hamclock/displayLayout";
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
import {
  formatBearing,
  formatDistance,
  getBearing,
  getPathMetrics,
} from "@/lib/utils/path";
import { latLonToGrid } from "@/lib/utils/grid";
import { EarthSphere } from "./EarthSphere";
import { GlobeDepthDome } from "./GlobeDepthDome";
import { GlobeUnavailable } from "./GlobeUnavailable";
import { probeWebGLSupport } from "@/lib/webgl/webglSupport";
import { TiledGlobe } from "./TiledGlobe";
import { TiledLabels } from "./TiledLabels";
import { GlobePerformanceDiagnostics } from "./GlobePerformanceDiagnostics";
import { ImageryAttribution } from "./ImageryAttribution";
import {
  NASA_BLUE_MARBLE_SOURCE,
  NATURAL_EARTH_SOURCE,
} from "@/lib/map/imagerySources";
import { CloudImageryAttribution } from "./CloudImageryAttribution";
import type { CloudImageryStatus } from "@/lib/map/cloudImageryStatus";
import { GLOBE_DOM_LAYER_ORDER } from "@/lib/map/globeRenderOrder";
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
import {
  GlobeWeatherAlertFlow,
  type GlobeWeatherAlertSelection,
} from "./GlobeWeatherAlertFlow";
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
import { SpotActivityLayout3D } from "./SpotActivityLayout3D";
import { GridGlowOverlay, type GridGlowSpot } from "./GridGlowOverlay";
import { GridPersistOverlay } from "./GridPersistOverlay";
import { IonosphericShells } from "./IonosphericShells";
import { RayPathArc } from "./RayPathArc";
import { useGridActivitySnapshot } from "@/hooks/useGridActivitySnapshot";
import {
  gridActivityGridForCoordinate,
  gridActivityResolutionForView,
} from "@/lib/map/gridActivityModel";
import { getSpotColor, type SpotColorMode } from "@/lib/utils/spotColors";
import { SpotHighlight } from "./SpotHighlight";
import { SelectedSpotArc } from "./SelectedSpotArc";
import { LoggedPulse } from "./LoggedPulse";
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
  type GridResearchActionSubject,
} from "./GridResearchPanel";
import { useMapStore } from "@/stores/mapStore";
import { useDisplayQualityStore } from "@/stores/displayQualityStore";
import { useResolvedDisplayQuality } from "@/hooks/useResolvedDisplayQuality";
import { useProfileStore } from "@/stores/profileStore";
import { useWatchStore } from "@/stores/watchStore";
import { resolveGridResearchActionIntent } from "@/lib/map/gridResearchActions";
import {
  useUserStore,
  useCompassRosePrefs,
  useUIInteractionPrefs,
} from "@/stores/userStore";
import { usePinStore } from "@/stores/pinStore";
import { useUndoStore } from "@/stores/undoStore";
import { useDXStore } from "@/stores/dxStore";
import { useAuroraData } from "@/hooks/useAuroraData";
import { useCurrentSFI } from "@/hooks/useMUFData";
import type { WeatherAlert } from "@/lib/api/weather";
import type { FireHotspot } from "@/lib/api/fires";
import { useRepeaters } from "@/hooks/useRepeaters";
import { useRiverGauges } from "@/hooks/useRiverGauges";
import { useAPRSStations } from "@/hooks/useAPRSStations";
import { useTropicalCyclones } from "@/hooks/useTropicalCyclones";
import { useContestQsoLocations } from "@/hooks/useContestQsoLocations";
import { useLoggedQsoLocations } from "@/hooks/useLoggedQsoLocations";
import { useWeatherRadar } from "@/hooks/useWeatherRadar";
import { useSpotFocus } from "@/hooks/useSpotFocus";
import { useMapSpotSelection } from "@/hooks/useMapSpotSelection";
import {
  useMapOperationalContext,
  useScopedMapLayers,
} from "@/hooks/useMapOperationalContext";
import { policyAllows } from "@/lib/map/operationalScope";
import { computeContactFrame } from "@/lib/map/contactMapPolicy";
import { useOpsPostureStore } from "@/stores/opsPostureStore";
import {
  useSpotHoverArbitration,
  type SpotHoverInteraction,
} from "@/hooks/useSpotHoverArbitration";
import { useDXCluster } from "@/hooks/useDXCluster";
import {
  getGreylineGlowIntensity,
  getGreylineIntensity,
} from "@/lib/utils/greyline";
import {
  getGlobeNavigationTuning,
  getMinimumGlobeDistance,
} from "@/lib/map/globeNavigation";
import { qthCameraPosition } from "./lib/globeCoords";
import { useTargetPathPresentation } from "@/hooks/useTargetPathPresentation";
import { pathEmphasis } from "@/lib/map/targetPathPresentation";
import { useKIndex } from "@/hooks/useSolarData";
import type { OrbitControls as OrbitControlsType } from "three-stdlib";
import { TargetHoverTooltip } from "./TargetHoverTooltip";
import { MapSizeSliders } from "./MapSizeSliders";
import { SpotHoverPreview } from "./SpotHoverPreview";
import { SelectedSpotCard } from "./SelectedSpotCard";
import { SpotCollectionPopover } from "./SpotCollectionPopover";
import { ClusterDetailPopover } from "./ClusterDetailPopover";
import type { SpotCluster as SpotClusterData } from "@/hooks/useSpotClustering";
import type { LiveSpot, SpotSource } from "@/types/livespot";
import type { ScreenAnchor } from "@/lib/map/anchoredOverlay";
import { collectGridSpots } from "@/lib/map/gridSpotCollection";
import {
  normalizePresentableSpot,
  type PresentableSpot,
} from "@/lib/map/spotPresentation";

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
import { useJustLoggedMarker } from "./hooks/useJustLoggedMarker";
import { useMapHazardData } from "./hooks/useMapHazardData";
import { useOptimalMapSignal } from "./hooks/useOptimalMapSignal";
import { useResolvedMapSpots } from "./hooks/useResolvedMapSpots";
import { LunarSubpointMarker3D } from "./layers/LunarSubpointMarker3D";

interface GlobeViewProps {
  /** Current display time (current time + offset) */
  displayTime: Date;
  /** Callback when a location is clicked */
  onLocationClick?: (lat: number, lon: number) => void;
  /** Hide the built-in radar scrubber (when host provides its own) */
  hideRadarScrubber?: boolean;
  /** Hide the local size panel when the host docks it with other controls */
  hideSizeSliders?: boolean;
  /** Host override for the fallback's "Use flat map" action (defaults to switching the map store to flat) */
  onUseFlatMap?: () => void;
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
  const homeRequest = useHamClockDisplayStore((s) => s.homeRequest);
  const layoutMode = useMapStore((s) => s.layoutMode);
  const appliedHome = useRef(0);
  const hamclockObservatoryCamera = useRef<THREE.Vector3 | null>(null);
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
  const contactPanRafRef = useRef(0);
  const posture = useOpsPostureStore((s) => s.posture);
  const frameGeneration = useOpsPostureStore((s) => s.frameGeneration);
  const captureCameraSnapshot = useOpsPostureStore(
    (s) => s.captureCameraSnapshot,
  );
  const markUserPanned = useOpsPostureStore((s) => s.markUserPanned);
  const clearCameraSnapshot = useOpsPostureStore((s) => s.clearCameraSnapshot);
  const contactTarget = useMapStore((s) => s.target);
  const prevContactPostureRef = useRef(posture);

  // Detect user drag interactions to suppress auto-pan for 10 seconds
  // and cancel Contact framing if the operator takes the camera.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const onStart = () => {
      lastUserDragRef.current = Date.now();
      if (useOpsPostureStore.getState().posture === "contact") {
        markUserPanned();
        if (contactPanRafRef.current) {
          cancelAnimationFrame(contactPanRafRef.current);
          contactPanRafRef.current = 0;
        }
      }
    };
    controls.addEventListener("start", onStart);
    return () => {
      controls.removeEventListener("start", onStart);
    };
  }, [markUserPanned]);

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

  // Contact posture: pause rotate, frame QTH+DX once, restore unless the
  // operator panned (GridTracker Fit-to-QRZ lesson).
  useEffect(() => {
    if (posture !== "contact") return;
    if (useOpsPostureStore.getState().userPanned) return;
    const controls = controlsRef.current;
    if (!controls) return;
    if (
      !station ||
      !contactTarget ||
      !Number.isFinite(station.lat) ||
      !Number.isFinite(station.lon) ||
      !Number.isFinite(contactTarget.lat) ||
      !Number.isFinite(contactTarget.lon)
    ) {
      return;
    }

    captureCameraSnapshot({
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    });

    if (contactPanRafRef.current) {
      cancelAnimationFrame(contactPanRafRef.current);
    }

    const frame = computeContactFrame(
      { lat: station.lat, lon: station.lon },
      { lat: contactTarget.lat, lon: contactTarget.lon },
    );
    const startPosition = camera.position.clone();
    const endPosition = latLonToCameraPosition(
      frame.lat,
      frame.lon,
      frame.distance,
    );
    const duration = 600;
    const startTime = Date.now();

    function animateContactFrame() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      camera.position.lerpVectors(startPosition, endPosition, eased);
      camera.lookAt(0, 0, 0);
      controls!.update();
      if (progress < 1) {
        contactPanRafRef.current = requestAnimationFrame(animateContactFrame);
      } else {
        contactPanRafRef.current = 0;
      }
    }

    animateContactFrame();
    return () => {
      if (contactPanRafRef.current) {
        cancelAnimationFrame(contactPanRafRef.current);
        contactPanRafRef.current = 0;
      }
    };
  }, [
    camera,
    captureCameraSnapshot,
    contactTarget,
    frameGeneration,
    posture,
    station,
  ]);

  useEffect(() => {
    const wasContact = prevContactPostureRef.current === "contact";
    prevContactPostureRef.current = posture;
    if (!wasContact || posture === "contact") return;

    const snapshot = useOpsPostureStore.getState().cameraSnapshot;
    const panned = useOpsPostureStore.getState().userPanned;
    const controls = controlsRef.current;
    if (snapshot && !panned && controls) {
      if (contactPanRafRef.current) {
        cancelAnimationFrame(contactPanRafRef.current);
      }
      const startPosition = camera.position.clone();
      const endPosition = new THREE.Vector3(snapshot.x, snapshot.y, snapshot.z);
      const duration = 500;
      const startTime = Date.now();
      function animateRestore() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        camera.position.lerpVectors(startPosition, endPosition, eased);
        camera.lookAt(0, 0, 0);
        controls!.update();
        if (progress < 1) {
          contactPanRafRef.current = requestAnimationFrame(animateRestore);
        } else {
          contactPanRafRef.current = 0;
        }
      }
      animateRestore();
    }
    clearCameraSnapshot();
  }, [camera, clearCameraSnapshot, posture]);

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

  useEffect(() => {
    if (layoutMode !== "hamclock") return;
    if (observatoryMode && !hamclockObservatoryCamera.current) {
      hamclockObservatoryCamera.current = camera.position.clone();
    } else if (!observatoryMode && hamclockObservatoryCamera.current) {
      camera.position.copy(hamclockObservatoryCamera.current);
      hamclockObservatoryCamera.current = null;
      camera.lookAt(0, 0, 0);
      controlsRef.current?.update();
    }
  }, [camera, layoutMode, observatoryMode]);

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
    const currentDistance = layoutMode === "hamclock" ? 3.5 : startPosition.length();
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
  }, [observatoryMode, station, camera, layoutMode]);

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

  useEffect(() => {
    if (layoutMode !== "hamclock" || !homeRequest || appliedHome.current === homeRequest.revision) return;
    appliedHome.current = homeRequest.revision;
    qthStartupDoneRef.current = true;
    cancelAnimationFrame(presetPanRafRef.current);
    const distance = globeRegionDistance(homeRequest, (camera as THREE.PerspectiveCamera).fov || 45, size.width / size.height);
    camera.position.copy(qthCameraPosition(homeRequest.lat, homeRequest.lon, distance, useMapStore.getState().rotation.x));
    camera.lookAt(0, 0, 0);
    controlsRef.current?.update();
  }, [camera, homeRequest, layoutMode, size.width, size.height]);


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
      autoRotate={autoRotate && posture !== "contact"}
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
  onQuickClick?: (
    lat: number,
    lon: number,
    screenPos: { x: number; y: number },
  ) => boolean;
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
    spot: PresentableSpot,
    screenPos: ScreenAnchor,
    interaction: SpotHoverInteraction,
  ) => void;
  onSpotHoverEnd?: (
    spot?: PresentableSpot,
    interaction?: SpotHoverInteraction,
  ) => void;
  onSpotSelect?: (spot: PresentableSpot, screenPos: ScreenAnchor) => void;
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
  onTileFallbackChange?: (active: boolean) => void;
  onCloudImageryStatusChange?: (status: CloudImageryStatus) => void;
}

const GlobeScene = React.memo(function GlobeScene({
  displayTime,
  onLocationClick,
  onDoubleClick,
  onQuickClick,
  onLocationHover,
  onHoverEnd,
  onPinHover,
  onPinLeave,
  onTargetHover,
  onTargetHoverEnd,
  onSpotHover,
  onSpotHoverEnd,
  onSpotSelect,
  onClusterClick,
  onAlertClick,
  onFireClick,
  onRadarAnimState,
  onTileFallbackChange,
  onCloudImageryStatusChange,
}: GlobeSceneProps) {
  const layoutMode = useMapStore((s) => s.layoutMode);
  const layers = useScopedMapLayers();
  const target = useMapStore((s) => s.target);
  const selectedSpot = useDXStore((s) => s.selectedSpot);
  const mapStyle = useMapStore((s) => s.mapStyle);
  const nightDarkness = useMapStore((s) => s.nightDarkness);
  const rotation = useMapStore((s) => s.rotation);
  const labelOptions = useMapStore((s) => s.labelOptions);
  const displayDensity = useMapStore((s) => s.displayDensity);
  const spotFilters = useMapStore((s) => s.spotFilters);
  const gridActivityEndpoint = useMapStore((s) => s.gridActivityEndpoint);
  const globeZoom = useMapStore((s) => s.zoom);
  const spotSourceFilters = useDXStore(
    (s) => s.filters.sources as SpotSource[] | undefined,
  );
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

  useEffect(() => {
    onTileFallbackChange?.(useTileFallback);
  }, [onTileFallbackChange, useTileFallback]);

  const station = useUserStore((s) => s.station);
  const selectedSpotMatchesTarget = useMemo(() => {
    if (!selectedSpot || !target) return false;
    if (
      !Number.isFinite(selectedSpot.dxLat) ||
      !Number.isFinite(selectedSpot.dxLon)
    ) {
      return false;
    }
    return (
      Math.abs(selectedSpot.dxLat! - target.lat) < 1e-6 &&
      Math.abs(selectedSpot.dxLon! - target.lon) < 1e-6
    );
  }, [selectedSpot, target]);
  const pins = usePinStore((s) => s.pins);
  const { data: auroraData } = useAuroraData(layers.aurora);
  const currentSFI = useCurrentSFI();
  const {
    earthquakeData,
    weatherAlerts,
    lightningStrikes,
    fireHotspots,
  } = useMapHazardData(layers);
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

  // The spectrum ring consumes raw spots, while arcs/traces/activity also need
  // resolved coordinates. Keep those two gates explicit in the shared hook.
  const resolvedSpotLayersEnabled =
    layers.spots || layers.spotTraces || layers.gridActivity;
  const {
    spots: liveSpots,
    candidateSpots,
    resolvedSpots,
    allResolvedSpots,
    activationSpots,
    isLoading: liveSpotsLoading,
    isFeedReady: liveSpotsFeedReady,
    feedScopeKey: liveSpotsFeedScopeKey,
  } = useResolvedMapSpots({
    grid: station?.grid,
    enabled: resolvedSpotLayersEnabled || layers.spectrumRing,
    resolveEnabled: resolvedSpotLayersEnabled,
    activationsEnabled: layers.activations,
    maxSpots: displayDensity,
    sources: spotSourceFilters,
    spotFilters,
  });

  // Grid facts are built from the complete eligible feed before the renderer's
  // spot-density cap. All projections consume the same model and endpoint
  // semantics; zoom changes only the selectable Maidenhead resolution.
  const gridActivityResolution = gridActivityResolutionForView(
    "globe",
    globeZoom,
  );
  const gridActivity = useGridActivitySnapshot(
    allResolvedSpots,
    gridActivityResolution,
    gridActivityEndpoint,
    layers.gridActivity,
  );

  // Arrival pulses are intentionally separate from the persistent activity
  // cells. They preserve the existing short "new report" heartbeat whenever
  // Spots or Spot Traces is visible without the Grid Activity layer.
  const previousArrivalIdsRef = useRef<Set<string>>(new Set());
  const [arrivalGlows, setArrivalGlows] = useState<GridGlowSpot[]>([]);
  useEffect(() => {
    const previousIds = previousArrivalIdsRef.current;
    const currentIds = new Set(resolvedSpots.map((spot) => spot.id));
    previousArrivalIdsRef.current = currentIds;
    if (
      layers.gridActivity ||
      (!layers.spots && !layers.spotTraces) ||
      resolvedSpots.length === 0
    ) {
      // The pulse renderer unmounts while hidden. Drop the last batch so
      // remounting cannot replay stale arrivals as if they were new.
      setArrivalGlows([]);
      return;
    }

    const colorMode: SpotColorMode = uiPrefs.spotColorMode ?? "mode";
    const initialLoad = previousIds.size === 0;
    const arrivals: GridGlowSpot[] = [];
    for (const spot of resolvedSpots) {
      if (previousIds.has(spot.id)) continue;
      const color = getSpotColor(spot, colorMode);
      const timestamp = Date.now() - (initialLoad ? Math.random() * 1_000 : 0);
      const fields = new Set<string>();

      const addExactSquare = (
        lat: number,
        lon: number,
        approximate: boolean,
      ) => {
        if (approximate) return;
        try {
          // 4-char Maidenhead square (2°×1°). Clamp inclusive 90/180 API
          // bounds into RR99 — raw latLonToGrid can emit an invalid S field.
          fields.add(gridActivityGridForCoordinate(lat, lon, 4));
        } catch {
          // A malformed feed coordinate must not interrupt the map render.
        }
      };

      // Prefix-centroid fallbacks are too imprecise for a square pulse. Exact
      // endpoints only — country centroids can sit in open ocean.
      addExactSquare(spot.dxLat, spot.dxLon, spot.dxLocApprox);
      addExactSquare(
        spot.spotterLat,
        spot.spotterLon,
        spot.spotterLocApprox,
      );
      for (const gridSquare of fields) {
        arrivals.push({ gridSquare, color, timestamp });
      }
    }
    if (arrivals.length > 0) setArrivalGlows(arrivals);
  }, [
    layers.gridActivity,
    layers.spots,
    layers.spotTraces,
    resolvedSpots,
    uiPrefs.spotColorMode,
  ]);

  // ── Ionospheric ray path computation ────────────────────────────────────
  const kIndexData = useKIndex();
  const currentKp = useMemo(() => {
    const last = kIndexData.data?.[kIndexData.data.length - 1];
    return last?.kp_index ?? 2;
  }, [kIndexData.data]);

  const pathPresentation = useTargetPathPresentation(displayTime);

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
          onQuickClick={onQuickClick}
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
          <NightOverlay
            date={displayTime}
            opacity={(isStandard ? 0.75 : 0.6) * nightDarkness}
          />
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
        {layers.labels && labelOptions.tileLabels && !useTileFallback && (
          <TiledLabels />
        )}

        {/* Country borders + labels overlay */}
        <LabelsOverlay
          showLabels={layers.labels}
          subsolarLat={subsolar.lat}
          subsolarLon={subsolar.lon}
        />

        {/* MUF overlay */}
        {layers.muf && currentSFI && (
          <MUFOverlay date={displayTime} sfi={currentSFI} opacity={layoutMode === "hamclock" ? 0.22 : 0.45} />
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
        {layers.goesCloud && (
          <GOESCloudOverlay3D
            onStatusChange={onCloudImageryStatusChange}
          />
        )}
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

        {/* One projected layout coordinates live endpoints, DX/spotter labels,
            activation labels, and their shared aggregate beacons. */}
        {(layers.spots || layers.activations || layers.spotTraces) &&
          !pathPresentation.hideOtherPaths && (
          <SpotActivityLayout3D
            showLiveSpots={layers.spots}
            showSpotTraces={layers.spotTraces}
            showActivations={layers.activations}
            traceFeedSpots={liveSpots}
            liveSpots={candidateSpots}
            resolvedLiveSpots={resolvedSpots}
            liveSpotsLoading={liveSpotsLoading}
            liveSpotsFeedReady={liveSpotsFeedReady}
            liveSpotsFeedScopeKey={liveSpotsFeedScopeKey}
            activationSpots={activationSpots}
            stationGrid={station?.grid}
            onSpotHover={onSpotHover}
            onSpotHoverEnd={onSpotHoverEnd}
            onSpotSelect={onSpotSelect}
            onClusterClick={onClusterClick}
          />
        )}

        {layers.lunarSubpoint && (
          <LunarSubpointMarker3D displayTime={displayTime} />
        )}

        {/* FT8 Spotter — burst traces, grid heatmap, cycle radar */}
        {layers.ft8Spotter && !pathPresentation.hideOtherPaths && (
          <Ft8SpotterOverlay station={station} />
        )}

        {layers.ft8Spotter && !pathPresentation.hideOtherPaths && (
          <Ft8DecodeLayer3D
            decodes={ft8EnrichedDecodes}
            myLat={station?.lat}
            myLon={station?.lon}
          />
        )}

        {/* Persistent grid activity overlay — density-colored steady glow */}
        {layers.gridActivity && !pathPresentation.hideOtherPaths && (
          <GridPersistOverlay cells={gridActivity.cells} />
        )}

        {!layers.gridActivity &&
          (layers.spots || layers.spotTraces) &&
          !pathPresentation.hideOtherPaths && (
          <GridGlowOverlay spots={arrivalGlows} />
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
            {targetHoverPosition && !selectedSpotMatchesTarget && (
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
              label={
                selectedSpotMatchesTarget
                  ? undefined
                  : target.name || target.grid
              }
              type="target"
              difficulty={pathDifficulty}
              showDifficultyTag={!selectedSpotMatchesTarget}
              sizeScale={mapPinScale}
            />

            {/* Path arc between home and target — ray path (bounces) or flat arc */}
            {station &&
              pathPresentation.modes.map((mode) => {
                const result = pathPresentation.resultFor(mode);
                const emphasis = pathEmphasis(pathPresentation.pathMode, mode);
                if (pathPresentation.showRayPath && result) {
                  return (
                    <RayPathArc
                      key={mode}
                      result={result}
                      startLat={station.lat}
                      startLon={station.lon}
                      endLat={target.lat}
                      endLon={target.lon}
                      pathMode={mode}
                      emphasis={emphasis}
                      showIonosphereHighlights={
                        layers.ionosphere || pathPresentation.isolateTargetPath
                      }
                      displayTime={displayTime}
                    />
                  );
                }
                return (
                  <PathArc
                    key={mode}
                    startLat={station.lat}
                    startLon={station.lon}
                    endLat={target.lat}
                    endLon={target.lon}
                    color={
                      pathDifficulty
                        ? getDifficultyColor(pathDifficulty)
                        : "#ff6b35"
                    }
                    pathMode={mode}
                  />
                );
              })}
          </>
        )}

        {/* Highlighted arc for DX cluster selected spot */}
        {!selectedSpotMatchesTarget &&
          !pathPresentation.hideOtherPaths && <SelectedSpotArc />}

        {/* Momentary pulse where a QSO was just logged (WSJT-X or manual) */}
        <LoggedPulse />

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
  hideSizeSliders = false,
  onUseFlatMap,
}: GlobeViewProps) {
  const scopedLayers = useScopedMapLayers();
  const { policy: operationalPolicy } = useMapOperationalContext();
  const publicDxEnabled = policyAllows(
    operationalPolicy,
    "liveSpots",
    "public",
  );
  const zoom = useMapStore((s) => s.zoom);
  const displayQuality = useDisplayQualityStore((s) => s.displayQuality);
  const qualitySettings = useResolvedDisplayQuality(displayQuality);
  const target = useMapStore((s) => s.target);
  const tooltipPosition = useMapStore((s) => s.tooltipPosition);
  const setTooltipPosition = useMapStore((s) => s.setTooltipPosition);
  const flyoutPosition = useMapStore((s) => s.flyoutPosition);
  const setFlyoutPosition = useMapStore((s) => s.setFlyoutPosition);
  const justLogged = useJustLoggedMarker();
  const setTarget = useMapStore((s) => s.setTarget);
  const setCenterLocation = useMapStore((s) => s.setCenterLocation);
  const mapStyle = useMapStore((s) => s.mapStyle);
  const gridActivityEnabled = scopedLayers.gridActivity;
  const gridActivityEndpoint = useMapStore((s) => s.gridActivityEndpoint);
  const spotFilters = useMapStore((s) => s.spotFilters);
  const spotSourceFilters = useDXStore(
    (s) => s.filters.sources as SpotSource[] | undefined,
  );
  const station = useUserStore((s) => s.station);
  const opsPosture = useOpsPostureStore((s) => s.posture);
  const subscriptionTier = useProfileStore((s) => s.subscriptionTier);
  const tileProvider = useMemo(
    () => selectTileProvider(mapStyle, subscriptionTier),
    [mapStyle, subscriptionTier],
  );
  const tileLabelsEnabled = useMapStore(
    (state) => state.layers.labels && state.labelOptions.tileLabels,
  );
  // WebGL preflight — probed once lazily so a disabled GPU process never
  // reaches Three.js context creation. `attempt` is bumped on retry and
  // doubles as the GlobeErrorBoundary key to force a remount after a
  // runtime (post-mount) failure.
  const [webgl, setWebgl] = useState(() => probeWebGLSupport());
  const [attempt, setAttempt] = useState(0);
  const retryWebGL = useCallback(() => {
    setWebgl(probeWebGLSupport());
    setAttempt((prev) => prev + 1);
  }, []);
  const useFlatMap = useCallback(() => {
    if (onUseFlatMap) onUseFlatMap();
    else useMapStore.getState().setViewMode("flat");
  }, [onUseFlatMap]);
  const [tileFallbackActive, setTileFallbackActive] = useState(false);
  const [cloudImageryStatus, setCloudImageryStatus] =
    useState<CloudImageryStatus>("loading");
  const addPin = usePinStore((s) => s.addPin);
  const removePin = usePinStore((s) => s.removePin);
  const getPinById = usePinStore((s) => s.getPinById);
  const { pushAction } = useUndoStore();
  const updateFilter = useDXStore((s) => s.updateFilter);
  const selectMapSpot = useMapSpotSelection();
  const {
    hoveredSpotData,
    handleSpotHover,
    handleSpotHoverEnd,
    holdSpotHoverForPreview,
    releaseSpotHoverFromPreview,
    clearSpotHover,
  } = useSpotHoverArbitration();
  const [mapOverlayPortal, setMapOverlayPortal] =
    useState<HTMLDivElement | null>(null);
  // Use allSpots (unfiltered) for tooltip matching to show all activity in an area
  const { allSpots } = useDXCluster(undefined, { enabled: publicDxEnabled });

  // React Query dedupes this with the scene request. Keeping the canonical
  // activity snapshot outside the R3F reconciler lets DOM tooltips and clicks
  // expose the exact same contributing reports the GPU layer represents.
  const {
    spots: tooltipLiveSpots,
    allResolvedSpots: tooltipResolvedSpots,
  } = useResolvedMapSpots({
    grid: station?.grid,
    // Grid hover existed before the activity layer and must remain available
    // when that visualization is disabled. React Query dedupes this observer
    // with the scene request, so keeping it live does not duplicate polling.
    enabled: true,
    sources: spotSourceFilters,
    spotFilters,
  });
  const tooltipActivity = useGridActivitySnapshot(
    tooltipResolvedSpots,
    gridActivityResolutionForView("globe", zoom),
    gridActivityEndpoint,
    gridActivityEnabled,
  );

  // Watch store v2 — grid watch action for flyout
  const setWatch = useWatchStore((s) => s.setWatch);

  // FT8 Spotter HUD data (outside Canvas, gated by layer toggle).
  // Note: useFt8SpotterData() is also called inside Ft8SpotterOverlay (R3F tree).
  // This is intentional — R3F Canvas uses a separate React reconciler, so hooks
  // cannot be shared across the boundary. The merge logic is cheap (~500 items).
  const ft8SpotterEnabled = scopedLayers.ft8Spotter;
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
  const [researchCallsign, setResearchCallsign] = useState<string | null>(null);

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

  // State for cluster click popover
  const [selectedCluster, setSelectedCluster] =
    useState<SpotClusterData | null>(null);
  const [clusterScreenPos, setClusterScreenPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [selectedMapSpotData, setSelectedMapSpotData] = useState<{
    spot: PresentableSpot;
    screenPos: ScreenAnchor;
  } | null>(null);
  const [selectedGridCollection, setSelectedGridCollection] = useState<{
    grid: string;
    spots: LiveSpot[];
    screenPos: ScreenAnchor;
  } | null>(null);

  // State for weather alert flyout and modal
  const [clickedAlertData, setClickedAlertData] =
    useState<GlobeWeatherAlertSelection | null>(null);

  // State for fire hotspot flyout
  const [clickedFireData, setClickedFireData] = useState<{
    hotspot: FireHotspot;
    screenPos: { x: number; y: number };
  } | null>(null);

  // While canonical activity is visible, hover and click membership comes
  // directly from the rendered cell. Otherwise preserve the generic grid
  // inspection behavior that also includes DX-cluster-only reports.
  const tooltipSpots = useMemo(() => {
    if (!tooltipPosition?.grid) return [];
    const grid = tooltipPosition.grid
      .slice(0, tooltipActivity.resolution)
      .toUpperCase();
    const activityCell = gridActivityEnabled
      ? tooltipActivity.cellsByGrid.get(grid)
      : undefined;
    if (activityCell) return [...activityCell.reports];
    if (gridActivityEnabled) return [];
    return collectGridSpots(
      tooltipPosition.grid.slice(0, 4),
      allSpots,
      tooltipLiveSpots,
      tooltipResolvedSpots,
    ).tooltipSpots;
  }, [
    allSpots,
    gridActivityEnabled,
    tooltipActivity,
    tooltipLiveSpots,
    tooltipPosition?.grid,
    tooltipResolvedSpots,
  ]);

  const getGridCollectionSpots = useCallback(
    (grid: string): LiveSpot[] => {
      const activityCell = gridActivityEnabled
        ? tooltipActivity.cellsByGrid.get(grid.toUpperCase())
        : undefined;
      if (activityCell) return [...activityCell.reports];
      if (gridActivityEnabled) return [];
      return collectGridSpots(
        grid,
        allSpots,
        tooltipLiveSpots,
        tooltipResolvedSpots,
      ).spots;
    },
    [
      allSpots,
      gridActivityEnabled,
      tooltipActivity.cellsByGrid,
      tooltipLiveSpots,
      tooltipResolvedSpots,
    ],
  );

  const targetDifficulty = useMemo(() => {
    if (!station || !target) {
      return undefined;
    }
    return getPathMetrics(station.lat, station.lon, target.lat, target.lon)
      .difficulty;
  }, [station, target]);

  const contactPath = useMemo(() => {
    if (opsPosture !== "contact" || !station || !target) return null;
    try {
      return getPathMetrics(station.lat, station.lon, target.lat, target.lon);
    } catch {
      return null;
    }
  }, [opsPosture, station, target]);

  const optimalSignal = useOptimalMapSignal({
    station,
    target,
    displayTime,
    // GlobeView keeps grid and target-hover tooltips in separate state. The
    // target tooltip explicitly clears tooltipPosition when it opens, so gate
    // this supplementary calculation on the state that actually consumes it.
    enabled: Boolean(hoveredTargetPos || selectedMapSpotData),
  });

  // Handle globe click - show flyout only (no target commit — that only
  // happens when the user picks "Set Target" from the flyout, below)
  const handleGlobeClick = useCallback(
    (lat: number, lon: number, screenPos: { x: number; y: number }) => {
      const grid = latLonToGrid(lat, lon);
      setSelectedGridCollection(null);
      setFlyoutPosition({ x: screenPos.x, y: screenPos.y, lat, lon, grid });
      setTooltipPosition(null); // Hide tooltip when flyout opens
      setHoveredPinData(null); // Clear pin flyout
      setHoveredTargetPos(null); // Clear target hover
      setSelectedCluster(null); // Close cluster popover
      setClusterScreenPos(null);
      setSelectedMapSpotData(null);
      setClickedAlertData(null); // Clear weather alert flyout
    },
    [setFlyoutPosition, setTooltipPosition],
  );

  const handleGlobeQuickClick = useCallback(
    (lat: number, lon: number, screenPos: { x: number; y: number }) => {
      if (!gridActivityEnabled) return false;
      const grid = gridActivityGridForCoordinate(
        lat,
        lon,
        tooltipActivity.resolution,
      );
      const gridMembers = getGridCollectionSpots(grid);
      if (gridMembers.length === 0) return false;
      setSelectedGridCollection({ grid, spots: gridMembers, screenPos });
      setFlyoutPosition(null);
      setTooltipPosition(null);
      setSelectedCluster(null);
      setSelectedMapSpotData(null);
      return true;
    },
    [
      getGridCollectionSpots,
      gridActivityEnabled,
      tooltipActivity.resolution,
      setFlyoutPosition,
      setTooltipPosition,
    ],
  );

  // Q2: Handle double-click - center view without setting target
  const handleDoubleClick = useCallback(
    (lat: number, lon: number) => {
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        lat < -90 ||
        lat > 90 ||
        lon < -180 ||
        lon > 180
      ) {
        return;
      }
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

  // Handle cluster click from LiveSpotArcs → SpotCluster
  const handleClusterClick = useCallback(
    (cluster: SpotClusterData, screenPos: { x: number; y: number }) => {
      setSelectedCluster(cluster);
      setClusterScreenPos(screenPos);
      setSelectedMapSpotData(null);
      setSelectedGridCollection(null);
    },
    [],
  );

  const handleClusterClose = useCallback(() => {
    setSelectedCluster(null);
    setClusterScreenPos(null);
  }, []);

  const handleMapSpotSelect = useCallback(
    (spot: PresentableSpot, screenPos: ScreenAnchor) => {
      const selection = selectMapSpot(spot);
      const selectedPresentableSpot = {
        ...spot,
        ...(selection?.spot ?? {}),
      };
      clearSpotHover();
      setHoveredTargetPos(null);
      setFlyoutPosition(null);
      setTooltipPosition(null);
      setSelectedCluster(null);
      setClusterScreenPos(null);
      setSelectedGridCollection(null);
      setSelectedMapSpotData({ spot: selectedPresentableSpot, screenPos });
    },
    [
      clearSpotHover,
      selectMapSpot,
      setFlyoutPosition,
      setTooltipPosition,
    ],
  );

  const handleClusterSpotSelect = useCallback(
    (spot: LiveSpot) => {
      handleMapSpotSelect(spot, clusterScreenPos || { x: 0, y: 0 });
    },
    [clusterScreenPos, handleMapSpotSelect],
  );

  // Handle weather alert click - show alert flyout
  const handleAlertClick = useCallback(
    (alert: WeatherAlert, screenPos: { x: number; y: number }) => {
      // Clear all other flyouts (mutual exclusion)
      setHoveredPinData(null);
      clearSpotHover();
      setSelectedCluster(null);
      setClusterScreenPos(null);
      setSelectedMapSpotData(null);
      setSelectedGridCollection(null);
      setFlyoutPosition(null);
      setTooltipPosition(null);
      setHoveredTargetPos(null);
      setClickedFireData(null);
      setClickedAlertData({ alert, screenPos });
    },
    [clearSpotHover, setFlyoutPosition, setTooltipPosition],
  );

  const handleAlertFlyoutClose = useCallback(() => {
    setClickedAlertData(null);
  }, []);

  // Handle fire hotspot click - show fire flyout
  const handleFireClick = useCallback(
    (hotspot: FireHotspot, screenPos: { x: number; y: number }) => {
      // Clear all other flyouts (mutual exclusion)
      setHoveredPinData(null);
      clearSpotHover();
      setSelectedCluster(null);
      setClusterScreenPos(null);
      setSelectedMapSpotData(null);
      setSelectedGridCollection(null);
      setFlyoutPosition(null);
      setTooltipPosition(null);
      setHoveredTargetPos(null);
      setClickedAlertData(null);
      setClickedFireData({ hotspot, screenPos });
    },
    [clearSpotHover, setFlyoutPosition, setTooltipPosition],
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
      setResearchCallsign(null);
      setResearchGrid(grid);
      setResearchPanelOpen(true);
      setFlyoutPosition(null);
    },
    [setFlyoutPosition],
  );

  const handleOpenOperatorPanel = useCallback(() => {
    if (!selectedMapSpotData) return;
    const selected = selectedMapSpotData.spot;
    let grid = selected.dxGrid || "";
    if (
      !grid &&
      Number.isFinite(selected.dxLat) &&
      Number.isFinite(selected.dxLon)
    ) {
      try {
        grid = latLonToGrid(selected.dxLat!, selected.dxLon!);
      } catch {
        // Operator lookup remains useful even without a derivable grid.
      }
    }
    setResearchCallsign(selected.dx);
    setResearchGrid(grid);
    setResearchPanelOpen(true);
    setSelectedMapSpotData(null);
  }, [selectedMapSpotData]);

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
    (action: GridResearchAction, subject: GridResearchActionSubject) => {
      const intent = resolveGridResearchActionIntent(action, subject);
      switch (intent.kind) {
        case "watch":
          setWatch(intent.criteria);
          break;
        case "pin":
          handleOpenAddPinDialog(
            intent.location.lat,
            intent.location.lon,
            intent.location.grid,
          );
          break;
        case "setTarget":
          setTarget(intent.target);
          setResearchPanelOpen(false);
          break;
        case "close":
          setResearchPanelOpen(false);
          break;
        case "invalid":
          // Keep the panel open so the operator can choose a valid action.
          break;
      }
    },
    [handleOpenAddPinDialog, setTarget, setWatch],
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
      {webgl.supported ? (
        <GlobeErrorBoundary
          key={attempt}
          fallback={
            <GlobeUnavailable
              reason={webgl.reason ?? undefined}
              onRetry={retryWebGL}
              onUseFlatMap={useFlatMap}
            />
          }
        >
          <Canvas dpr={qualitySettings.renderDevicePixelRatio}>
            {import.meta.env.DEV && (
              <GlobePerformanceDiagnostics
                settleDelayMs={qualitySettings.settleDelayMs}
              />
            )}
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
                onQuickClick={handleGlobeQuickClick}
                onLocationHover={handleGlobeHover}
                onHoverEnd={handleHoverEnd}
                onPinHover={handlePinHover}
                onPinLeave={handlePinLeave}
                onTargetHover={handleTargetHover}
                onTargetHoverEnd={handleTargetHoverEnd}
                onSpotHover={handleSpotHover}
                onSpotHoverEnd={handleSpotHoverEnd}
                onSpotSelect={handleMapSpotSelect}
                onClusterClick={handleClusterClick}
                onAlertClick={handleAlertClick}
                onFireClick={handleFireClick}
                onRadarAnimState={setRadarAnimState}
                onTileFallbackChange={setTileFallbackActive}
                onCloudImageryStatusChange={setCloudImageryStatus}
              />
            </Suspense>
          </Canvas>
        </GlobeErrorBoundary>
      ) : (
        <GlobeUnavailable
          reason={webgl.reason ?? undefined}
          onRetry={retryWebGL}
          onUseFlatMap={useFlatMap}
        />
      )}

      {/* Map-owned DOM portal. Drei Html labels reserve z-index values through
          9000 while hovered/selected, so this sibling stacking layer must sit
          above that entire range for previews to remain completely opaque. */}
      <div
        ref={setMapOverlayPortal}
        className="pointer-events-none absolute inset-0"
        style={{ zIndex: GLOBE_DOM_LAYER_ORDER.mapOverlayPortal }}
      />

      {(contactPath || justLogged) && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 flex -translate-x-1/2 flex-col items-center gap-1">
          {contactPath && (
            <div
              className="rounded-full border border-plasma-orange/40 bg-void-black/80 px-3 py-1 font-mono text-[11px] text-plasma-orange backdrop-blur-sm"
              data-contact-path-chip
            >
              {Math.round(contactPath.shortPath.bearing)
                .toString()
                .padStart(3, "0")}
              ° {formatBearing(contactPath.shortPath.bearing)}
              {" · "}
              {formatDistance(contactPath.shortPath.distance)}
              {" · RX "}
              {Math.round(contactPath.shortPath.reciprocal)}°
            </div>
          )}

          {justLogged && (
            <div
              key={justLogged.at}
              className="animate-pulse rounded-full border border-signal-green/40 bg-void-black/80 px-3 py-1 font-mono text-[11px] text-signal-green backdrop-blur-sm"
              data-logged-chip
            >
              Logged {justLogged.callsign}
            </div>
          )}
        </div>
      )}

      <div className="absolute bottom-1 right-1 z-20 flex flex-col items-end gap-1">
        <CloudImageryAttribution status={cloudImageryStatus} />
        <ImageryAttribution
          baseSource={
            tileFallbackActive
              ? mapStyle === "standard"
                ? NATURAL_EARTH_SOURCE
                : NASA_BLUE_MARBLE_SOURCE
              : undefined
          }
          provider={tileFallbackActive ? undefined : tileProvider}
          includeCartoLabels={tileLabelsEnabled && !tileFallbackActive}
        />
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
          !selectedGridCollection &&
          !selectedMapSpotData &&
          !clickedAlertData &&
          !clickedFireData
        }
        position={tooltipPosition || { x: 0, y: 0 }}
        grid={tooltipPosition?.grid || ""}
        spots={tooltipSpots}
      />

      <TargetHoverTooltip
        visible={!!hoveredTargetPos && !selectedMapSpotData}
        portalTarget={mapOverlayPortal}
        position={hoveredTargetPos || { x: 0, y: 0 }}
        label={target?.name || target?.grid || "Target"}
        grid={target?.grid}
        difficulty={targetDifficulty}
        optimalSignal={optimalSignal}
        signalUnavailableReason={
          station ? undefined : "Set your QTH to see optimal-band signal"
        }
      />

      {/* Canonical propagation preview for every spot label and endpoint. */}
      <SpotHoverPreview
        visible={
          !!hoveredSpotData &&
          !flyoutPosition &&
          !hoveredPinData &&
          !selectedCluster &&
          !selectedGridCollection &&
          !selectedMapSpotData &&
          !clickedAlertData &&
          !clickedFireData
        }
        position={hoveredSpotData?.screenPos || { x: 0, y: 0 }}
        portalTarget={mapOverlayPortal}
        displayTime={displayTime}
        spot={hoveredSpotData?.spot ?? null}
        onInteractStart={holdSpotHoverForPreview}
        onInteractEnd={releaseSpotHoverFromPreview}
        onActivate={() => {
          if (hoveredSpotData) {
            handleMapSpotSelect(
              hoveredSpotData.spot,
              hoveredSpotData.screenPos,
            );
          }
        }}
      />

      {/* Cluster detail popover - shown when clicking a spot cluster */}
      <ClusterDetailPopover
        visible={!!selectedCluster}
        position={clusterScreenPos || { x: 0, y: 0 }}
        cluster={selectedCluster}
        onClose={handleClusterClose}
        onSpotSelect={handleClusterSpotSelect}
      />

      {selectedGridCollection && (
        <SpotCollectionPopover
          visible
          position={selectedGridCollection.screenPos}
          title={`${selectedGridCollection.grid} active spots`}
          subtitle={`${selectedGridCollection.spots.length} report${selectedGridCollection.spots.length === 1 ? "" : "s"} in this highlighted grid`}
          spots={selectedGridCollection.spots}
          onClose={() => setSelectedGridCollection(null)}
          onSpotSelect={(spot) =>
            handleMapSpotSelect(spot, selectedGridCollection.screenPos)
          }
        />
      )}

      {selectedMapSpotData && (
        <SelectedSpotCard
          spot={selectedMapSpotData.spot}
          position={selectedMapSpotData.screenPos}
          difficulty={targetDifficulty}
          optimalSignal={optimalSignal}
          signalUnavailableReason={
            station ? undefined : "Set your QTH to model this path"
          }
          onOperator={handleOpenOperatorPanel}
          onViewPath={() => setSelectedMapSpotData(null)}
          onClose={() => setSelectedMapSpotData(null)}
        />
      )}

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
          onSpotSelect={(spot, screenPos) =>
            handleMapSpotSelect(normalizePresentableSpot(spot), screenPos)
          }
          onEditPin={handleEditPinFromFlyout}
          onDeletePin={handleDeletePinFromFlyout}
          onClose={handlePinFlyoutClose}
        />
      )}

      {/* Weather alert detail flow keeps the compact flyout mounted behind
          the modal so keyboard focus can return to its originating button. */}
      <GlobeWeatherAlertFlow
        selection={clickedAlertData}
        onFlyoutClose={handleAlertFlyoutClose}
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

      {!hideSizeSliders && <MapSizeSliders />}

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
        initialCallsign={researchCallsign}
        onAction={handleResearchAction}
        onClose={() => {
          setResearchPanelOpen(false);
          setResearchCallsign(null);
        }}
      />
    </div>
  );
}
