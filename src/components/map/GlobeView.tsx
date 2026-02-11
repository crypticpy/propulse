/**
 * GlobeView Component
 *
 * 3D interactive globe using React Three Fiber.
 * Provides camera controls, lighting, and click-to-select functionality.
 */

import {
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
import { CompassRose } from "./CompassRose";
import { Terminator } from "./Terminator";
import { Greyline } from "./Greyline";
import { NightOverlay } from "./NightOverlay";
import { NightLightsOverlay } from "./NightLightsOverlay";
import { LabelsOverlay } from "./LabelsOverlay";
import { AuroraOverlay } from "./AuroraOverlay";
import { MUFOverlay } from "./MUFOverlay";
import { GrayLineZone } from "./GrayLineZone";
import { SatelliteOverlay } from "./SatelliteOverlay";
import { PathArc } from "./PathArc";
import {
  LocationMarker,
  getDifficultyColor,
  type DifficultyLevel,
} from "./LocationMarker";
import { LiveSpotArcs } from "./LiveSpotArcs";
import { GridGlowOverlay, type GridGlowSpot } from "./GridGlowOverlay";
import { SpotHighlight } from "./SpotHighlight";
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
import { useSpotFocus } from "@/hooks/useSpotFocus";
import { useLiveSpots } from "@/hooks/useLiveSpots";
import { useDXCluster } from "@/hooks/useDXCluster";
import { getGreylineIntensity } from "@/lib/utils/greyline";
import { getSpotColor, type SpotColorMode } from "@/lib/utils/spotColors";
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

interface GlobeViewProps {
  /** Current display time (current time + offset) */
  displayTime: Date;
  /** Callback when a location is clicked */
  onLocationClick?: (lat: number, lon: number) => void;
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
 * Convert lat/lon to camera position at a given distance
 */
function latLonToCameraPosition(
  lat: number,
  lon: number,
  distance: number = 2.5,
): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  return new THREE.Vector3(
    -distance * Math.sin(phi) * Math.cos(theta),
    distance * Math.cos(phi),
    distance * Math.sin(phi) * Math.sin(theta),
  );
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
  const { camera } = useThree();
  const { targetPosition, isFocusing } = useSpotFocus();
  const centerLocation = useMapStore((state) => state.centerLocation);
  const clearCenterLocation = useMapStore((state) => state.clearCenterLocation);
  const activePresetId = useMapStore((state) => state.activePresetId);
  const regionPresets = useMapStore((state) => state.regionPresets);
  const autoRotate = useMapStore((state) => state.autoRotate);
  const observatoryMode = useMapStore((state) => state.observatoryMode);
  const autoRotateSpeed = useMapStore((state) => state.autoRotateSpeed);
  const prevPresetIdRef = useRef<string | null>(null);

  // Dynamic OrbitControls auto-rotate speed from store
  // OrbitControls autoRotateSpeed 2.0 = 30 seconds per orbit at 60 fps
  // Conversion: 2.0 × (30 / secondsPerRevolution)
  const computedRotateSpeed = useMemo(
    () => 2.0 * (30 / Math.max(60, autoRotateSpeed)),
    [autoRotateSpeed],
  );

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
    // Skip if preset hasn't actually changed (avoids re-animation on re-renders)
    if (activePresetId === prevPresetIdRef.current) {
      return;
    }
    prevPresetIdRef.current = activePresetId;

    if (!activePresetId || !controlsRef.current) {
      return;
    }

    const preset = regionPresets.find((p) => p.id === activePresetId);
    if (!preset) {
      return;
    }

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

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      enableZoom={true}
      enableRotate={!observatoryMode}
      zoomSpeed={0.5}
      minDistance={1.5}
      maxDistance={4}
      rotateSpeed={0.5}
      dampingFactor={0.1}
      enableDamping
      autoRotate={autoRotate}
      autoRotateSpeed={computedRotateSpeed}
    />
  );
}

/**
 * Globe scene content
 */
function GlobeScene({
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
}: {
  displayTime: Date;
  onLocationClick?: (
    lat: number,
    lon: number,
    screenPos: { x: number; y: number },
  ) => void;
  /** Q2: Called when double-clicking - centers view without setting target */
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
  /** Called when hovering over a pin - shows pin-specific flyout */
  onPinHover?: (pin: MapPin, screenPos: { x: number; y: number }) => void;
  /** Called when leaving a pin hover */
  onPinLeave?: () => void;
  /** Called when hovering over the selected target marker */
  onTargetHover?: (screenPos: { x: number; y: number }) => void;
  /** Called when leaving the selected target marker */
  onTargetHoverEnd?: () => void;
  /** Called when hovering over a spot label or endpoint */
  onSpotHover?: (
    data: SpotDetailsData,
    screenPos: { x: number; y: number },
  ) => void;
  /** Called when spot hover ends */
  onSpotHoverEnd?: () => void;
  /** Called when a cluster is clicked */
  onClusterClick?: (
    cluster: SpotClusterData,
    screenPos: { x: number; y: number },
  ) => void;
}) {
  const { layers, target, pathMode, mapStyle } = useMapStore();
  const isStandard = mapStyle === "standard";
  const { station } = useUserStore();
  const { pins } = usePinStore();
  const { data: auroraData } = useAuroraData();
  const currentSFI = useCurrentSFI();
  const compassRosePrefs = useCompassRosePrefs();
  const holdDurationMs = useSettingsStore(
    (s) => s.uiInteraction?.holdDurationMs ?? 500,
  );
  const uiPrefs = useUIInteractionPrefs();
  const mapPinScale = uiPrefs.mapPinScale ?? 1.0;

  // Fetch live spots for the grid glow overlay
  const { spots: liveSpots } = useLiveSpots({
    grid: station?.grid,
    enabled: layers.spots,
  });

  // Transform recent live spots into GridGlowSpot[] for the glow overlay.
  // Only include spots from the last 5 seconds to avoid flooding on initial load.
  const glowSpots = useMemo((): GridGlowSpot[] => {
    const cutoff = Date.now() - 5_000;
    const colorMode: SpotColorMode = uiPrefs.spotColorMode ?? "mode";
    const result: GridGlowSpot[] = [];

    for (const spot of liveSpots) {
      // Only include spots arriving within the last 5 seconds
      const spotTime =
        spot.time instanceof Date ? spot.time.getTime() : Number(spot.time);
      if (spotTime < cutoff) continue;

      // Extract 2-char Maidenhead prefix from DX grid or spotter grid
      const grids: string[] = [];
      if (spot.dxGrid && spot.dxGrid.length >= 2) {
        grids.push(spot.dxGrid.slice(0, 2).toUpperCase());
      }
      if (spot.spotterGrid && spot.spotterGrid.length >= 2) {
        const prefix = spot.spotterGrid.slice(0, 2).toUpperCase();
        if (!grids.includes(prefix)) {
          grids.push(prefix);
        }
      }

      const color = getSpotColor(spot, colorMode);

      for (const gridField of grids) {
        result.push({ gridField, color, timestamp: spotTime });
      }
    }

    return result;
  }, [liveSpots, uiPrefs.spotColorMode]);

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

      {/* Globe click/hover handler wrapping the Earth */}
      <GlobeClickHandler
        onLocationClick={handleGlobeClick}
        onDoubleClick={onDoubleClick}
        onLocationHover={handleGlobeHover}
        onHoverEnd={onHoverEnd}
        holdDurationMs={holdDurationMs}
      >
        {/* Earth sphere */}
        <EarthSphere grayscale={isStandard} />
      </GlobeClickHandler>

      {/* Night side darkening overlay */}
      {layers.terminator && (
        <NightOverlay date={displayTime} opacity={isStandard ? 0.75 : 0.6} />
      )}

      {/* Day/night terminator line */}
      {layers.terminator && (
        <Terminator date={displayTime} standardMode={isStandard} />
      )}

      {/* Greyline band with intensity-based visualization */}
      {layers.greyline && (
        <Greyline date={displayTime} intensity={greylineIntensity} />
      )}

      {/* Gray line propagation zone (±5° from terminator) */}
      {layers.greyline && <GrayLineZone date={displayTime} />}

      {/* Aurora overlay */}
      {layers.aurora && auroraData && (
        <AuroraOverlay auroraData={auroraData} minProbability={10} />
      )}

      {/* Night lights overlay - city lights on dark side */}
      {!isStandard && layers.nightLights && (
        <NightLightsOverlay date={displayTime} />
      )}

      {/* Country borders + labels overlay */}
      <LabelsOverlay
        showLabels={layers.labels || isStandard}
        subsolarLat={subsolar.lat}
        subsolarLon={subsolar.lon}
      />

      {/* MUF overlay */}
      {layers.muf && currentSFI && (
        <MUFOverlay date={displayTime} sfi={currentSFI} opacity={0.45} />
      )}

      {/* Satellite overlay */}
      {layers.satellites && <SatelliteOverlay />}

      {/* Live spot arcs */}
      {layers.spots && (
        <LiveSpotArcs
          grid={station?.grid}
          maxArcs={50}
          onSpotHover={onSpotHover}
          onSpotHoverEnd={onSpotHoverEnd}
          onClusterClick={onClusterClick}
        />
      )}

      {/* Grid glow overlay — pulsing glow on Maidenhead grid fields for recent spots */}
      {layers.spots && <GridGlowOverlay spots={glowSpots} />}

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

      {/* Home station marker - Blue color */}
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

          {/* Path arc between home and target - Color based on difficulty */}
          {station && (
            <PathArc
              startLat={station.lat}
              startLon={station.lon}
              endLat={target.lat}
              endLon={target.lon}
              color={
                pathDifficulty ? getDifficultyColor(pathDifficulty) : "#ff6b35"
              }
              pathMode={pathMode}
            />
          )}
        </>
      )}

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

      {/* Camera controls with spot focus */}
      <CameraController />
    </>
  );
}

export function GlobeView({ displayTime, onLocationClick }: GlobeViewProps) {
  const {
    zoom,
    target,
    tooltipPosition,
    setTooltipPosition,
    flyoutPosition,
    setFlyoutPosition,
    setTarget,
    setCenterLocation,
  } = useMapStore();
  const { station } = useUserStore();
  const { antennaType } = useActiveStationGain();
  const noiseEnvironment = useSettingsStore((s) => s.noiseEnvironment);
  const { addPin, removePin, getPinById } = usePinStore();
  const { pushAction } = useUndoStore();
  const { updateFilter } = useDXStore();
  // Use allSpots (unfiltered) for tooltip matching to show all activity in an area
  const { allSpots } = useDXCluster();

  // Watch store v2 — grid watch action for flyout
  const setWatch = useWatchStore((s) => s.setWatch);

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

  // Get spots in the hovered grid for tooltip
  // Matches if either DX or spotter grid starts with the hovered 4-char prefix
  const tooltipSpots = useMemo(() => {
    if (!tooltipPosition?.grid) {
      return [];
    }
    const gridPrefix = tooltipPosition.grid.toUpperCase().slice(0, 4);
    return allSpots.filter((spot) => {
      const dxGrid = (spot.dxGrid || "").toUpperCase();
      const spotterGrid = (spot.spotterGrid || "").toUpperCase();
      return (
        dxGrid.startsWith(gridPrefix) || spotterGrid.startsWith(gridPrefix)
      );
    });
  }, [tooltipPosition?.grid, allSpots]);

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
    if (!station || !target) {
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
    currentKp,
    currentSfi,
    displayTime,
    isEstimatedConditions,
    antennaType,
    noiseEnvironment,
  ]);

  // Handle globe click - show flyout
  const handleGlobeClick = useCallback(
    (lat: number, lon: number, screenPos: { x: number; y: number }) => {
      const grid = latLonToGrid(lat, lon);
      setFlyoutPosition({ x: screenPos.x, y: screenPos.y, lat, lon, grid });
      setTooltipPosition(null); // Hide tooltip when flyout opens
      setHoveredPinData(null); // Clear pin flyout
      setHoveredTargetPos(null); // Clear target hover
      setSelectedCluster(null); // Close cluster popover
      setClusterScreenPos(null);
      onLocationClick?.(lat, lon);
    },
    [setFlyoutPosition, setTooltipPosition, onLocationClick],
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
    [flyoutPosition, setTarget, addPin, updateFilter, handleWatchGrid],
  );

  return (
    <div className="w-full h-full min-h-[400px] bg-deep-space rounded-xl overflow-hidden relative isolate">
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
            near={0.1}
            far={1000}
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
            />
          </Suspense>
        </Canvas>
      </GlobeErrorBoundary>

      {/* Tooltip overlay - rendered outside Canvas */}
      <MapTooltip
        visible={
          !!tooltipPosition &&
          !flyoutPosition &&
          !hoveredPinData &&
          !hoveredTargetPos &&
          !hoveredSpotData &&
          !selectedCluster
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
          !selectedCluster
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
