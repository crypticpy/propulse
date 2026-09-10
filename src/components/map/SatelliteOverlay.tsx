/**
 * SatelliteOverlay Component
 *
 * Renders amateur radio satellites on the 3D globe using React Three Fiber.
 * Each satellite appears as a small diamond marker above the globe surface
 * with an Html label. Uses useGlobeOcclusion for far-side fading.
 *
 * Click a satellite to show an inline info popup with key details (name,
 * NORAD ID, category, position, transponders, next pass). Click again or
 * click another satellite to dismiss. Clicking the popup itself opens the
 * full SatelliteDetailModal via mapStore.satelliteModalId for comprehensive
 * details, independent of the popup's own open/closed state.
 *
 * Selected satellites show their orbital ground track.
 */

import { useMemo, useRef, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { formatDistanceToNow } from "date-fns";
import { useGlobeOcclusion } from "@/hooks/useGlobeOcclusion";
import { useSatellites } from "@/hooks/useSatellites";
import { useMapStore } from "@/stores/mapStore";
import type { SatelliteTrackConfig } from "@/stores/mapStore";
import { useSatellitePrefsStore } from "@/stores/satellitePrefsStore";
import { buildOrbitTrack } from "@/lib/api/satellites";
import { getTransponder } from "@/lib/data/satelliteTransponders";
import {
  GLOBE_DOM_LAYER_ORDER,
  GLOBE_LAYER_ORDER,
} from "@/lib/map/globeRenderOrder";
import {
  latLonAltToVector3,
  latLonToSurface,
} from "@/lib/map/satelliteGeometry";
import {
  CATEGORY_META,
  formatFreqMHz,
  formatLatLon,
} from "@/lib/utils/satellite";
import type {
  SatelliteInfoExtended,
  SatelliteCategory,
  PassPrediction,
} from "@/types/satellite";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Size of the diamond marker */
const MARKER_SIZE = 0.012;

/**
 * Category colors for satellite markers.
 * Exported so LayerLegend (src/lib/map/layerLegends.ts) can render a legend
 * that can never drift out of sync with the actual marker colors.
 */
export const CATEGORY_COLORS: Record<SatelliteCategory, string> = {
  iss: "#ffffff",
  fm: "#00ff88",
  linear: "#00ccff",
  digital: "#ff9933",
  weather: "#cc88ff",
  other: "#888888",
};

/**
 * Info popup width range (#832 sweep). Sibling of ISS_INFO_CARD_WIDTH_STYLE
 * in ISSTrackerOverlay.tsx: this card was pinned to a fixed pixel range
 * (roughly two hundred to two hundred sixty pixels) while nearly everything
 * inside it -- the NORAD line, the position/altitude grid, the transponder
 * rows -- is `text-xs`, which follows Settings -> Text Size. Sizing this
 * range in rem instead lets the whole card grow with its own text instead of
 * staying pinned to a box sized for the default scale. Exported so this
 * geometry is unit-testable without rendering the R3F tree this component
 * lives in (`Html`/`useFrame` require a `<Canvas>` context that jsdom +
 * Testing Library cannot provide).
 */
export const SATELLITE_INFO_CARD_WIDTH_STYLE = {
  // Same viewport clamp as ISS_INFO_CARD_WIDTH_STYLE (Codex, PR #839 round
  // 7): at the largest text scale 16.25rem is 357px, wider than a 320px
  // phone, and the drei `Html center` wrapper does no clamping of its own.
  minWidth: "min(12.5rem, calc(100vw - 2rem))",
  maxWidth: "min(16.25rem, calc(100vw - 2rem))",
  // Same viewport-relative height cap as ISS_INFO_CARD_WIDTH_STYLE (round
  // 18): the transponder and pass sections stack at the largest scale.
  maxHeight: "calc(100vh - 2rem)",
  overflowY: "auto",
} as const;

// ---------------------------------------------------------------------------
// Satellite Info Popup (drei Html — appears near marker when selected)
// ---------------------------------------------------------------------------

interface SatelliteInfoPopupProps {
  satellite: SatelliteInfoExtended;
  occlusionOpacity: number;
  nextPasses: PassPrediction[];
  onOpenModal: (noradId: number) => void;
  onDismiss: () => void;
}

function SatelliteInfoPopup({
  satellite,
  occlusionOpacity,
  nextPasses,
  onOpenModal,
  onDismiss,
}: SatelliteInfoPopupProps) {
  const color = CATEGORY_COLORS[satellite.category];
  const { lat, lon, alt, velocity } = satellite.position;
  const catMeta = CATEGORY_META[satellite.category];

  // Static transponder data (not a hook — safe to call here)
  const transponderData = getTransponder(satellite.name, satellite.noradId);
  const primaryXpdr = transponderData?.transponders[0] ?? null;

  // Next upcoming pass
  const now = new Date();
  const nextPass = nextPasses.find((p) => p.los >= now) ?? null;
  const activePass =
    nextPass && nextPass.aos <= now && nextPass.los >= now ? nextPass : null;

  return (
    <Html
      position={[0, MARKER_SIZE * 7, 0]}
      center
      zIndexRange={GLOBE_DOM_LAYER_ORDER.hud}
      style={{
        pointerEvents: "auto",
        opacity: Math.max(occlusionOpacity, 0.25),
      }}
    >
      <div
        className="flex flex-col gap-1 rounded-md px-3 py-2 text-xs font-mono cursor-pointer"
        style={{
          backgroundColor: "rgba(8, 8, 24, 0.94)",
          border: `1px solid ${color}60`,
          boxShadow: `0 0 12px ${color}30`,
          ...SATELLITE_INFO_CARD_WIDTH_STYLE,
          color: "#e0e0e8",
        }}
        onClick={(e) => {
          e.stopPropagation();
          onOpenModal(satellite.noradId);
        }}
        title="Click for full details"
      >
        {/* Header: name + category badge + visibility + close */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="text-[12px] font-bold tracking-wider truncate"
              style={{ color }}
            >
              {satellite.name}
            </span>
            <span
              className={`inline-block flex-shrink-0 px-1 py-0.5 rounded text-xs font-semibold uppercase tracking-wider ${catMeta.color} ${catMeta.bg}`}
            >
              {catMeta.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span
              className={`w-2 h-2 rounded-full ${
                satellite.isVisible
                  ? "bg-green-400 animate-pulse"
                  : "bg-su-line"
              }`}
              title={satellite.isVisible ? "Above horizon" : "Below horizon"}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="w-3.5 h-3.5 flex items-center justify-center rounded text-su-muted hover:text-su-text hover:bg-su-line/20 transition-colors"
              aria-label="Close"
              title="Close"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path
                  d="M1 1L7 7M7 1L1 7"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* NORAD ID */}
        <div className="text-xs" style={{ color: "#777" }}>
          NORAD {satellite.noradId}
          {satellite.isCustom && (
            <span className="ml-1.5 px-1 py-0.5 rounded bg-orange-400/15 text-orange-400 text-xs">
              Custom TLE
            </span>
          )}
        </div>

        {/* Divider */}
        <div
          className="my-0.5"
          style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
        />

        {/* Position & altitude grid */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-x-3 gap-y-0.5">
          <div>
            <span style={{ color: "#888" }}>Pos: </span>
            <span style={{ color: "#ccc" }}>{formatLatLon(lat, lon)}</span>
          </div>
          <div>
            <span style={{ color: "#888" }}>Alt: </span>
            <span style={{ color: "#ccc" }}>{Math.round(alt)} km</span>
          </div>
          <div>
            <span style={{ color: "#888" }}>Vel: </span>
            <span style={{ color: "#ccc" }}>{velocity.toFixed(1)} km/s</span>
          </div>
          <div>
            <span style={{ color: "#888" }}>Status: </span>
            <span
              style={{
                color: satellite.isVisible ? "#4ade80" : "#9ca3af",
              }}
            >
              {satellite.isVisible ? "Visible" : "Below horizon"}
            </span>
          </div>
        </div>

        {/* Transponder info (if available) */}
        {transponderData && transponderData.transponders.length > 0 && (
          <>
            <div
              className="my-0.5"
              style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
            />
            <div className="text-xs text-su-muted uppercase tracking-wider font-semibold">
              Transponders
            </div>
            {transponderData.transponders.slice(0, 2).map((xpdr, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span
                  className="px-1 py-0.5 rounded text-xs font-semibold uppercase"
                  style={{
                    backgroundColor:
                      xpdr.mode === "FM"
                        ? "rgba(74,222,128,0.15)"
                        : xpdr.mode === "linear"
                          ? "rgba(34,211,238,0.15)"
                          : "rgba(251,146,60,0.15)",
                    color:
                      xpdr.mode === "FM"
                        ? "#4ade80"
                        : xpdr.mode === "linear"
                          ? "#22d3ee"
                          : "#fb923c",
                  }}
                >
                  {xpdr.mode}
                </span>
                <span style={{ color: "#aaa" }}>
                  {formatFreqMHz(xpdr.downlinkRangeHz[0])}
                </span>
              </div>
            ))}
            {primaryXpdr && (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-x-3 text-xs">
                <div>
                  <span style={{ color: "#888" }}>UP: </span>
                  <span style={{ color: "#aaa" }}>
                    {formatFreqMHz(primaryXpdr.uplinkRangeHz[0])}
                  </span>
                </div>
                <div>
                  <span style={{ color: "#888" }}>DN: </span>
                  <span style={{ color: "#aaa" }}>
                    {formatFreqMHz(primaryXpdr.downlinkRangeHz[0])}
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Active pass / next pass */}
        {nextPass && (
          <>
            <div
              className="my-0.5"
              style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
            />
            {activePass ? (
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                <span style={{ color: "#4ade80", fontWeight: 600 }}>
                  PASS NOW
                </span>
                <span style={{ color: "#aaa" }}>
                  {Math.round(activePass.maxEl)}&deg; max el
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span style={{ color: "#888" }}>Next pass: </span>
                <span style={{ color: "#ccc" }}>
                  in {formatDistanceToNow(nextPass.aos)}
                </span>
                <span style={{ color: "#aaa" }}>
                  {Math.round(nextPass.maxEl)}&deg; max
                </span>
              </div>
            )}
          </>
        )}

        {/* TLE age indicator */}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
          <span style={{ color: "#555" }}>TLE:</span>
          <span
            className="px-1 py-0.5 rounded text-xs font-medium"
            style={{
              backgroundColor:
                satellite.tleAge === "fresh"
                  ? "rgba(74,222,128,0.12)"
                  : satellite.tleAge === "aging"
                    ? "rgba(250,204,21,0.12)"
                    : "rgba(248,113,113,0.12)",
              color:
                satellite.tleAge === "fresh"
                  ? "#4ade80"
                  : satellite.tleAge === "aging"
                    ? "#facc15"
                    : "#f87171",
            }}
          >
            {satellite.tleAge}
          </span>
        </div>

        {/* Details affordance — a real button so keyboard users can open
            the modal; the surrounding popup is also clickable for pointers */}
        <div
          className="my-0.5"
          style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenModal(satellite.noradId);
          }}
          aria-label={`Open full details for ${satellite.name}`}
          className="flex w-full items-center justify-center gap-1 rounded text-xs font-semibold uppercase tracking-wider hover:bg-su-line/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-su-line/60"
          style={{ color: `${color}aa` }}
        >
          <span>Tap for full details</span>
          <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
            <path
              d="M2 1L6 4L2 7"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </Html>
  );
}

// ---------------------------------------------------------------------------
// Individual Satellite Marker
// ---------------------------------------------------------------------------

interface SatelliteMarkerProps {
  satellite: SatelliteInfoExtended;
  isSelected: boolean;
  onSelect: (noradId: number) => void;
  onOpenModal: (noradId: number) => void;
  nextPasses: PassPrediction[];
}

function SatelliteMarker({
  satellite,
  isSelected,
  onSelect,
  onOpenModal,
  nextPasses,
}: SatelliteMarkerProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const glowMaterialRef = useRef<THREE.MeshBasicMaterial>(null);

  const color = CATEGORY_COLORS[satellite.category];
  const { lat, lon, alt } = satellite.position;

  // Globe occlusion for far-side fading
  const { opacityRef, opacity: occlusionOpacity } = useGlobeOcclusion(lat, lon);

  // 3D position
  const position = useMemo(() => {
    return latLonAltToVector3(lat, lon, alt);
  }, [lat, lon, alt]);

  // Diamond geometry — rotated cube
  const diamondRotation = useMemo(() => {
    return new THREE.Euler(0, 0, Math.PI / 4);
  }, []);

  // Animate pulsing glow and apply occlusion
  useFrame(({ clock }) => {
    const occlusion = opacityRef.current;

    if (materialRef.current) {
      materialRef.current.opacity = (isSelected ? 1.0 : 0.85) * occlusion;
    }

    if (glowMaterialRef.current) {
      const pulse = 0.4 + Math.sin(clock.elapsedTime * 3) * 0.2;
      glowMaterialRef.current.opacity =
        (isSelected ? pulse * 1.5 : pulse) * occlusion;
    }
  });

  const handleClick = useCallback(
    (e: THREE.Event) => {
      if ("stopPropagation" in e && typeof e.stopPropagation === "function") {
        e.stopPropagation();
      }
      onSelect(satellite.noradId);
    },
    [satellite.noradId, onSelect],
  );

  const markerScale = isSelected ? 1.5 : 1.0;

  return (
    <group position={position}>
      {/* Invisible enlarged hit target — a sphere so the projected click
          area stays the same from every camera angle */}
      <mesh onClick={handleClick} renderOrder={GLOBE_LAYER_ORDER.markers}>
        <sphereGeometry args={[MARKER_SIZE * 2.5, 12, 8]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Glow circle behind marker */}
      <mesh rotation={diamondRotation} renderOrder={GLOBE_LAYER_ORDER.markers}>
        <planeGeometry args={[MARKER_SIZE * 3, MARKER_SIZE * 3]} />
        <meshBasicMaterial
          ref={glowMaterialRef}
          color={color}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Diamond marker — small rotated box */}
      <mesh
        ref={meshRef}
        rotation={diamondRotation}
        scale={[markerScale, markerScale, markerScale]}
        onClick={handleClick}
        renderOrder={GLOBE_LAYER_ORDER.markers + 0.1}
      >
        <boxGeometry args={[MARKER_SIZE, MARKER_SIZE, MARKER_SIZE * 0.3]} />
        <meshBasicMaterial
          ref={materialRef}
          color={color}
          transparent
          opacity={0.85}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Selection ring */}
      {isSelected && (
        <mesh renderOrder={GLOBE_LAYER_ORDER.markers}>
          <ringGeometry args={[MARKER_SIZE * 1.8, MARKER_SIZE * 2.2, 32]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.6 * occlusionOpacity}
            side={THREE.DoubleSide}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Html label */}
      <Html
        position={[0, MARKER_SIZE * 4, 0]}
        center
        zIndexRange={GLOBE_DOM_LAYER_ORDER.marker}
        style={{
          pointerEvents: "none",
          transition: "opacity 0.2s ease",
          opacity: (isSelected ? 1.0 : 0.7) * occlusionOpacity,
        }}
      >
        <div
          className="px-1.5 py-0.5 rounded text-xs font-mono whitespace-nowrap"
          style={{
            backgroundColor: "rgba(10, 10, 26, 0.85)",
            color,
            border: `1px solid ${color}50`,
            boxShadow: isSelected ? `0 0 12px ${color}40` : "none",
            transform: isSelected ? "scale(1.1)" : "scale(1)",
            transition: "all 0.2s ease",
          }}
        >
          {satellite.name}
        </div>
      </Html>

      {/* Info popup when selected */}
      {isSelected && (
        <SatelliteInfoPopup
          satellite={satellite}
          occlusionOpacity={occlusionOpacity}
          nextPasses={nextPasses}
          onOpenModal={onOpenModal}
          onDismiss={() => onSelect(satellite.noradId)}
        />
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Ground Track Line — store-driven per-satellite "Map orbit" track (#994)
// ---------------------------------------------------------------------------

interface GroundTrackProps {
  satellite: SatelliteInfoExtended;
  config: SatelliteTrackConfig;
  isSelected: boolean;
}

interface TimeMarkerLabel {
  position: THREE.Vector3;
  minutesFromNow: number;
}

/**
 * One satellite's orbit track, built from the shared `buildOrbitTrack` per
 * that satellite's own `satelliteTracks` config (orbits ahead, whether to
 * show the past 45 minutes). Past/future segments are split the same way
 * `ISSOrbitRing` splits its altitude ring (dim past, bright future), and,
 * like it and `ISSGroundTrack`, split again at antimeridian crossings so a
 * `Line` never draws a spurious wrap-around chord.
 */
function GroundTrack({ satellite, config, isSelected }: GroundTrackProps) {
  const color = CATEGORY_COLORS[satellite.category];
  const lineWidth = isSelected ? 2.5 : 1.5;

  const { pastSegments, futureSegments, tenMinDots, thirtyMinLabels } =
    useMemo(() => {
      const pastMin = config.showPast ? 45 : 0;
      const track = buildOrbitTrack(satellite, new Date(), {
        pastMin,
        orbitsAhead: config.orbitsAhead,
        stepMin: 1,
      });

      const past: THREE.Vector3[][] = [];
      const future: THREE.Vector3[][] = [];
      let currentPast: THREE.Vector3[] = [];
      let currentFuture: THREE.Vector3[] = [];
      const dots: THREE.Vector3[] = [];
      const labels: TimeMarkerLabel[] = [];

      for (let i = 0; i < track.length; i++) {
        const point = track[i];
        const vec = latLonToSurface(point.lat, point.lon);

        if (i > 0) {
          const prevLon = track[i - 1].lon;
          const lonDiff = Math.abs(point.lon - prevLon);
          if (lonDiff > 180) {
            if (currentPast.length > 1) past.push(currentPast);
            if (currentFuture.length > 1) future.push(currentFuture);
            currentPast = [];
            currentFuture = [];
          }
        }

        if (point.minutesFromNow < 0) {
          currentPast.push(vec);
          if (currentFuture.length > 1) {
            future.push(currentFuture);
            currentFuture = [];
          }
        } else if (currentPast.length > 0 && currentFuture.length === 0) {
          // Bridge: carry the last past point into the future segment so the
          // line stays continuous across the "now" boundary.
          currentFuture.push(vec);
          if (currentPast.length > 1) past.push(currentPast);
          currentPast = [];
        } else {
          currentFuture.push(vec);
        }

        if (point.minutesFromNow % 10 === 0) {
          dots.push(vec);
        }
        if (point.minutesFromNow % 30 === 0) {
          labels.push({ position: vec, minutesFromNow: point.minutesFromNow });
        }
      }

      if (currentPast.length > 1) past.push(currentPast);
      if (currentFuture.length > 1) future.push(currentFuture);

      return {
        pastSegments: past,
        futureSegments: future,
        tenMinDots: dots,
        thirtyMinLabels: labels,
      };
    }, [satellite, config.showPast, config.orbitsAhead]);

  return (
    <>
      {pastSegments.map((segment, idx) => (
        <Line
          key={`past-${idx}`}
          points={segment}
          color={color}
          lineWidth={lineWidth}
          transparent
          opacity={0.18}
          depthTest={true}
          depthWrite={false}
          renderOrder={GLOBE_LAYER_ORDER.arcs}
        />
      ))}
      {futureSegments.map((segment, idx) => (
        <Line
          key={`future-${idx}`}
          points={segment}
          color={color}
          lineWidth={lineWidth}
          transparent
          opacity={0.45}
          depthTest={true}
          depthWrite={false}
          renderOrder={GLOBE_LAYER_ORDER.arcs}
        />
      ))}
      {tenMinDots.map((pos, idx) => (
        <mesh key={`dot-${idx}`} position={pos} renderOrder={GLOBE_LAYER_ORDER.markers}>
          <sphereGeometry args={[0.003, 8, 8]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.5}
            depthTest={true}
            depthWrite={false}
          />
        </mesh>
      ))}
      {thirtyMinLabels.map(({ position, minutesFromNow }, idx) => (
        <Html
          key={`label-${idx}`}
          position={position}
          center
          zIndexRange={GLOBE_DOM_LAYER_ORDER.marker}
          style={{ pointerEvents: "none" }}
        >
          <div className="px-1 py-0.5 rounded text-xs font-mono whitespace-nowrap bg-su-panel text-su-text border border-su-line/40">
            {minutesFromNow === 0
              ? "now"
              : `${minutesFromNow > 0 ? "+" : ""}${minutesFromNow}m`}
          </div>
        </Html>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Overlay Component
// ---------------------------------------------------------------------------

/**
 * SatelliteOverlay renders all tracked amateur radio satellites on the globe.
 *
 * Usage inside GlobeScene (within a <Canvas>):
 * ```tsx
 * <SatelliteOverlay />
 * ```
 */
export function SatelliteOverlay() {
  const { satellites, selectedSatellite, selectSatellite, nextPasses } =
    useSatellites();
  const issTrackerActive = useMapStore((s) => s.layers.issTracker);
  const setSatelliteModalId = useMapStore((s) => s.setSatelliteModalId);
  const satelliteTracks = useMapStore((s) => s.satelliteTracks);

  const trackedNoradIds = useSatellitePrefsStore((s) => s.trackedNoradIds);

  // Filter satellites: ISS dedup when dedicated tracker is active + user tracking prefs
  const filteredSatellites = useMemo(() => {
    let sats = satellites;
    // Remove ISS from general overlay when dedicated ISS tracker is active
    if (issTrackerActive) {
      sats = sats.filter((s) => s.noradId !== 25544);
    }
    // Apply user tracking preferences (default "all" = no filter)
    if (trackedNoradIds !== "all") {
      const idSet = new Set(trackedNoradIds);
      sats = sats.filter((s) => idSet.has(s.noradId));
    }
    return sats;
  }, [satellites, issTrackerActive, trackedNoradIds]);

  const handleSelect = useCallback(
    (noradId: number) => {
      // Toggle selection
      if (selectedSatellite?.noradId === noradId) {
        selectSatellite(null);
      } else {
        selectSatellite(noradId);
      }
    },
    [selectedSatellite, selectSatellite],
  );

  // Store-driven "Map orbit" tracks — one per satellite the user has opted
  // into via the SatelliteDetailModal controls, independent of selection
  // and independent of the marker display prefs above (#994).
  const trackedSatellites = useMemo(() => {
    const entries: { satellite: SatelliteInfoExtended; config: SatelliteTrackConfig }[] =
      [];
    for (const [noradIdStr, config] of Object.entries(satelliteTracks)) {
      const noradId = Number(noradIdStr);
      const satellite = satellites.find((s) => s.noradId === noradId);
      if (satellite) {
        entries.push({ satellite, config });
      }
    }
    return entries;
  }, [satelliteTracks, satellites]);

  if (filteredSatellites.length === 0 && trackedSatellites.length === 0) {
    return null;
  }

  return (
    <group>
      {/* Store-driven orbit tracks (#994) */}
      {trackedSatellites.map(({ satellite, config }) => (
        <GroundTrack
          key={satellite.noradId}
          satellite={satellite}
          config={config}
          isSelected={satellite.noradId === selectedSatellite?.noradId}
        />
      ))}

      {/* Satellite markers */}
      {filteredSatellites.map((sat) => (
        <SatelliteMarker
          key={sat.noradId}
          satellite={sat}
          isSelected={sat.noradId === selectedSatellite?.noradId}
          onSelect={handleSelect}
          onOpenModal={setSatelliteModalId}
          nextPasses={
            sat.noradId === selectedSatellite?.noradId ? nextPasses : []
          }
        />
      ))}
    </group>
  );
}

export default SatelliteOverlay;
