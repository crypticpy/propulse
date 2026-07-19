/**
 * TiledGlobe Component
 *
 * Renders a tiled Earth globe using 3d-tiles-renderer's XYZTilesPlugin
 * with an ellipsoidal projection, scaled down to unit-sphere radius to
 * match the existing overlay coordinate system (latLonToVector3 at r~1.0).
 *
 * Replaces EarthSphere when the tile engine is active.
 */

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import {
  TilesRenderer as TilesRendererR3F,
  TilesPlugin,
} from "3d-tiles-renderer/r3f";
import {
  TilesFadePlugin,
  UpdateOnChangePlugin,
} from "3d-tiles-renderer/plugins";
import { TilesRenderer as TilesRendererImpl } from "3d-tiles-renderer/three";
import { WGS84_HEIGHT, WGS84_RADIUS } from "3d-tiles-renderer/core";
import type { TileProviderConfig } from "@/lib/tiles/types";
import { CompatibleXYZTilesPlugin } from "@/lib/tiles/CompatibleXYZTilesPlugin";
import { getXYZTilePluginOptions } from "@/lib/tiles/xyzOptions";
import { getUnitSphereScale } from "@/lib/map/globeGeometry";
import { getAccessToken } from "@/lib/api/authFetch";

// ---------------------------------------------------------------------------
// Coordinate alignment
// ---------------------------------------------------------------------------
// 3d-tiles-renderer positions tiles on the WGS84 ellipsoid using a geocentric
// frame where the north pole is at +Z. The existing Propulse globe uses a Y-up
// frame where the north pole is at +Y and lat=0/lon=0 maps to +X.
//
// The required rotation from the tiles frame to our frame is:
//   tiles +X (0°N,0°E)   -->  our +X  (no change)
//   tiles +Y (0°N,90°E)  -->  our -Z
//   tiles +Z (north pole) -->  our +Y
//
// This is a single Rx(-PI/2) rotation in Three.js Euler 'XYZ' order.
// ---------------------------------------------------------------------------
const ALIGN_ROTATION_X = -Math.PI / 2;
const ALIGN_ROTATION_Y = 0;

/**
 * Scale WGS84 metre geometry onto the unit sphere used by every Propulse
 * overlay and by OrbitControls. Correcting the polar axis separately removes
 * the ellipsoid/sphere altitude error that becomes kilometers at local zoom.
 */
const UNIT_GLOBE_SCALE = getUnitSphereScale(WGS84_RADIUS, WGS84_HEIGHT);

/** Number of tile-load errors within ERROR_WINDOW_MS that triggers onError. */
const ERROR_THRESHOLD = 5;
/** Time window (ms) for error burst detection. */
const ERROR_WINDOW_MS = 10_000;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TiledGlobeProps {
  /** Active tile provider configuration. */
  provider: TileProviderConfig;
  /** Display time (reserved for future time-based tile sources). */
  displayTime: Date;
  /** Whether this provider requires authenticated tile fetches (Pro tier). */
  requiresAuth?: boolean;
  /** Called when tile loading encounters an unrecoverable error. */
  onError?: (error: Error) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// How often to refresh the auth token (ms). Supabase tokens last ~1h;
// refreshing every 15 min keeps us well within that window.
const AUTH_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export function TiledGlobe({
  provider,
  displayTime: _displayTime,
  requiresAuth = false,
  onError,
}: TiledGlobeProps) {
  const tilesRef = useRef<TilesRendererImpl>(null);

  // ---------------------------------------------------------------------------
  // Authenticated fetch options
  // ---------------------------------------------------------------------------
  const fetchOptionsRef = useRef<RequestInit>({});
  const [authReady, setAuthReady] = useState(!requiresAuth);

  useEffect(() => {
    if (!requiresAuth) {
      fetchOptionsRef.current = {};
      setAuthReady(true);
      return;
    }

    let cancelled = false;

    const refreshToken = async () => {
      const token = await getAccessToken();
      if (cancelled) return;

      if (token) {
        const headers =
          (fetchOptionsRef.current.headers as Record<string, string>) ?? {};
        headers["Authorization"] = `Bearer ${token}`;
        fetchOptionsRef.current.headers = headers;

        if (tilesRef.current) {
          tilesRef.current.fetchOptions.headers =
            fetchOptionsRef.current.headers;
        }
      }

      if (!authReady) setAuthReady(true);
    };

    refreshToken();
    const intervalId = setInterval(refreshToken, AUTH_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable refs, intentional
  }, [requiresAuth]);

  // ---------------------------------------------------------------------------
  // Group transform — applied via R3F `group` prop (not useEffect)
  // ---------------------------------------------------------------------------
  const groupProps = useMemo(
    () => ({
      scale: UNIT_GLOBE_SCALE,
      rotation: [ALIGN_ROTATION_X, ALIGN_ROTATION_Y, 0] as [
        number,
        number,
        number,
      ],
    }),
    [],
  );

  // ---------------------------------------------------------------------------
  // Error handler
  // ---------------------------------------------------------------------------
  const errorCountRef = useRef(0);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleLoadError = useCallback(
    (event: { error?: Error; message?: string }) => {
      errorCountRef.current += 1;
      if (errorCountRef.current <= 3) {
        console.warn(
          "[TiledGlobe] tile load error:",
          event.error?.message ?? event.message,
        );
      }

      if (errorCountRef.current >= ERROR_THRESHOLD) {
        errorCountRef.current = 0;
        const err =
          event.error ?? new Error(event.message ?? "Tile load error");
        onError?.(err);
      }

      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => {
        errorCountRef.current = 0;
      }, ERROR_WINDOW_MS);
    },
    [onError],
  );

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  // Don't render until the auth token is ready
  if (!authReady) return null;

  return (
    <TilesRendererR3F
      key={provider.id}
      ref={tilesRef}
      errorTarget={2}
      fetchOptions={fetchOptionsRef.current}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- R3F spreads partial props onto <primitive>
      group={groupProps as any}
      onLoadError={handleLoadError}
    >
      <TilesPlugin
        plugin={CompatibleXYZTilesPlugin}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- R3F types args as an array although this plugin accepts an options object
        args={getXYZTilePluginOptions(provider) as any}
      />
      <TilesPlugin
        plugin={TilesFadePlugin}
        args={{ fadeDuration: 250 } as any} // eslint-disable-line @typescript-eslint/no-explicit-any
      />
      <TilesPlugin plugin={UpdateOnChangePlugin} />
    </TilesRendererR3F>
  );
}
