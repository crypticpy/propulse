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
import { getSubsolarPoint } from "@/lib/utils/sun";
import { getPathMetrics, getBearing } from "@/lib/utils/path";
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
import { SpotHighlight } from "./SpotHighlight";
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
import { WatchListPanel } from "./WatchListPanel";
import { WatchIndicator } from "./WatchIndicator";
import { useMapStore } from "@/stores/mapStore";
import { useWatchStore } from "@/stores/watchStore";
import { gridToLatLon } from "@/lib/utils/grid";
import { useUserStore, useCompassRosePrefs } from "@/stores/userStore";
import { usePinStore } from "@/stores/pinStore";
import { useDXStore } from "@/stores/dxStore";
import { useAuroraData } from "@/hooks/useAuroraData";
import { useCurrentSFI } from "@/hooks/useMUFData";
import { useSpotFocus } from "@/hooks/useSpotFocus";
import { useDXCluster } from "@/hooks/useDXCluster";
import { getGreylineIntensity } from "@/lib/utils/greyline";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { getEnhancedBandConditions } from "@/lib/utils/bands";
import { pickOptimalBandCondition } from "@/lib/utils/optimalBand";
import type { OrbitControls as OrbitControlsType } from "three-stdlib";
import { TargetHoverTooltip } from "./TargetHoverTooltip";

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
function CameraController() {
  const controlsRef = useRef<OrbitControlsType>(null);
  const { camera } = useThree();
  const { targetPosition, isFocusing } = useSpotFocus();
  const centerLocation = useMapStore((state) => state.centerLocation);
  const clearCenterLocation = useMapStore((state) => state.clearCenterLocation);
  const activePresetId = useMapStore((state) => state.activePresetId);
  const regionPresets = useMapStore((state) => state.regionPresets);
  const prevPresetIdRef = useRef<string | null>(null);

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

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      enableZoom={true}
      zoomSpeed={0.5}
      minDistance={1.5}
      maxDistance={4}
      rotateSpeed={0.5}
      dampingFactor={0.1}
      enableDamping
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
}) {
  const { layers, target, autoRotate, pathMode } = useMapStore();
  const { station } = useUserStore();
  const { pins } = usePinStore();
  const { data: auroraData } = useAuroraData();
  const currentSFI = useCurrentSFI();
  const compassRosePrefs = useCompassRosePrefs();

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
      >
        {/* Earth sphere */}
        <EarthSphere autoRotate={autoRotate} rotationSpeed={0.0005} />
      </GlobeClickHandler>

      {/* Night side darkening overlay */}
      {layers.terminator && <NightOverlay date={displayTime} opacity={0.6} />}

      {/* Day/night terminator line */}
      {layers.terminator && <Terminator date={displayTime} />}

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
      {layers.nightLights && <NightLightsOverlay date={displayTime} />}

      {/* Labels overlay - country borders and city names */}
      {layers.labels && <LabelsOverlay />}

      {/* MUF overlay */}
      {layers.muf && currentSFI && (
        <MUFOverlay date={displayTime} sfi={currentSFI} opacity={0.45} />
      )}

      {/* Satellite overlay */}
      {layers.satellites && <SatelliteOverlay />}

      {/* Live spot arcs */}
      {layers.spots && <LiveSpotArcs grid={station?.grid} maxArcs={50} />}

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
  const { addPin } = usePinStore();
  const { updateFilter } = useDXStore();
  // Use allSpots (unfiltered) for tooltip matching to show all activity in an area
  const { allSpots } = useDXCluster();

  // Watch store for activity checking
  const addWatch = useWatchStore((state) => state.addWatch);
  const checkForActivity = useWatchStore((state) => state.checkForActivity);

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

  // State for WatchListPanel
  const [watchListOpen, setWatchListOpen] = useState(false);

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

  // Check watch activity when spots change
  useEffect(() => {
    if (allSpots.length > 0) {
      checkForActivity(allSpots);
    }
  }, [allSpots, checkForActivity]);

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
  }, [station, target, currentKp, currentSfi, displayTime, isEstimatedConditions]);

  // Handle globe click - show flyout
  const handleGlobeClick = useCallback(
    (lat: number, lon: number, screenPos: { x: number; y: number }) => {
      const grid = latLonToGrid(lat, lon);
      setFlyoutPosition({ x: screenPos.x, y: screenPos.y, lat, lon, grid });
      setTooltipPosition(null); // Hide tooltip when flyout opens
      setHoveredPinData(null); // Clear pin flyout
      setHoveredTargetPos(null); // Clear target hover
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

  // Handle edit pin from PinFlyout
  const handleEditPinFromFlyout = useCallback((pin: MapPin) => {
    setEditingPin(pin);
    setAddPinDialogOpen(true);
    setAddPinData({ lat: pin.lat, lon: pin.lon, grid: pin.grid });
    setHoveredPinData(null);
  }, []);

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

  // Handle adding a grid to watch list
  const handleWatchGrid = useCallback(
    (grid: string) => {
      // Watch the 4-char grid prefix for broader matching
      const gridPrefix = grid.slice(0, 4).toUpperCase();
      addWatch("grid", gridPrefix);
      setFlyoutPosition(null);
    },
    [addWatch, setFlyoutPosition],
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
    <div className="w-full h-full min-h-[400px] bg-deep-space rounded-xl overflow-hidden relative">
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
            />
          </Suspense>
        </Canvas>
      </GlobeErrorBoundary>

      {/* Tooltip overlay - rendered outside Canvas */}
      <MapTooltip
        visible={
          !!tooltipPosition && !flyoutPosition && !hoveredPinData && !hoveredTargetPos
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
          onClose={handlePinFlyoutClose}
        />
      )}

      {/* Watch activity indicator - top right corner */}
      <div className="absolute top-3 right-3 z-10">
        <WatchIndicator onClick={() => setWatchListOpen(true)} />
      </div>

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

      {/* WatchListPanel slide-out */}
      <WatchListPanel
        visible={watchListOpen}
        onClose={() => setWatchListOpen(false)}
      />
    </div>
  );
}
