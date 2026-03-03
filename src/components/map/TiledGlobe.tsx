/**
 * TiledGlobe Component
 *
 * Renders a tiled Earth globe using 3d-tiles-renderer's XYZTilesPlugin
 * with an ellipsoidal projection, scaled down to unit-sphere radius to
 * match the existing overlay coordinate system (latLonToVector3 at r~1.0).
 *
 * Replaces EarthSphere when the tile engine is active.
 */

import { useRef, useEffect, useCallback, useState } from "react";
import {
  TilesRenderer as TilesRendererR3F,
  TilesPlugin,
} from "3d-tiles-renderer/r3f";
import {
  XYZTilesPlugin,
  TilesFadePlugin,
  UpdateOnChangePlugin,
} from "3d-tiles-renderer/plugins";
import { TilesRenderer as TilesRendererImpl } from "3d-tiles-renderer/three";
import { WGS84_RADIUS } from "3d-tiles-renderer/core";
import type { TileProviderConfig } from "@/lib/tiles/types";
import { getAccessToken } from "@/lib/api/authFetch";

// ---------------------------------------------------------------------------
// Coordinate alignment
// ---------------------------------------------------------------------------
// 3d-tiles-renderer positions tiles on the WGS84 ellipsoid using a geocentric
// frame where the north pole is at +Z. The existing Propulse globe uses a Y-up
// frame where the north pole is at +Y and lat=0/lon=0 maps to +X.
//
// The required rotation from the tiles frame to our frame is:
//   tiles +X  -->  our (0, 0, -1)
//   tiles +Y  -->  our (1, 0, 0)
//   tiles +Z  -->  our (0, 1, 0)
//
// This decomposes to Rx(-PI/2) then Ry(-PI/2) in Three.js Euler 'XYZ' order.
// ---------------------------------------------------------------------------
const ALIGN_ROTATION_X = -Math.PI / 2;
const ALIGN_ROTATION_Y = -Math.PI / 2;

/** Scale factor to bring WGS84 metre-scale geometry down to unit sphere. */
const UNIT_SCALE = 1 / WGS84_RADIUS;

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
  /** Display time (reserved for GIBS date-based URLs in future). */
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
  // We keep a *stable mutable object* so the ImageFormatPlugin's reference
  // (set once during init) always sees fresh headers when tiles are fetched.
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
        // Mutate the existing headers object so the image source's
        // reference to fetchOptions stays valid.
        const headers =
          (fetchOptionsRef.current.headers as Record<string, string>) ?? {};
        headers["Authorization"] = `Bearer ${token}`;
        fetchOptionsRef.current.headers = headers;

        // Also update the live TilesRenderer instance if already mounted,
        // since ImageFormatPlugin.init() copies the reference only once.
        if (tilesRef.current) {
          tilesRef.current.fetchOptions.headers =
            fetchOptionsRef.current.headers;
        }
      }

      if (!authReady) setAuthReady(true);
    };

    // Initial token fetch
    refreshToken();

    // Periodic refresh to keep the token valid across long sessions
    const intervalId = setInterval(refreshToken, AUTH_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable refs, intentional
  }, [requiresAuth]);

  // Scale and orient the tile group to match the unit-sphere overlay system.
  // Runs once after mount — key={provider.id} ensures remount on provider change.
  useEffect(() => {
    if (!tilesRef.current) return;

    const group = tilesRef.current.group;
    group.scale.setScalar(UNIT_SCALE);
    group.rotation.set(ALIGN_ROTATION_X, ALIGN_ROTATION_Y, 0);
    group.updateMatrixWorld(true);
  }, []);

  // Error handler — debounce per-tile errors and only surface after threshold.
  // Tile renderers fire load-error per tile; a single slow CDN can cause dozens
  // of 504s for edge tiles while center tiles load fine.
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

      // Surface error after threshold within window, then reset counter
      // so subsequent bursts can also trigger onError (GlobeView owns retry policy)
      if (errorCountRef.current >= ERROR_THRESHOLD) {
        errorCountRef.current = 0;
        const err =
          event.error ?? new Error(event.message ?? "Tile load error");
        onError?.(err);
      }

      // Reset counter after quiet period
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => {
        errorCountRef.current = 0;
      }, ERROR_WINDOW_MS);
    },
    [onError],
  );

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  // Don't render until the auth token is ready — prevents unauthenticated
  // tile fetches that would 401 and immediately burn through the error budget.
  if (!authReady) return null;

  return (
    <TilesRendererR3F
      key={provider.id}
      ref={tilesRef}
      errorTarget={6}
      fetchOptions={fetchOptionsRef.current}
      onLoadError={handleLoadError}
    >
      <TilesPlugin
        plugin={XYZTilesPlugin}
        args={
          [
            {
              url: provider.url,
              shape: "ellipsoid",
              useRecommendedSettings: true,
            },
          ] as ConstructorParameters<typeof XYZTilesPlugin>
        }
      />
      <TilesPlugin
        plugin={TilesFadePlugin}
        args={
          [{ fadeDuration: 250 }] as ConstructorParameters<
            typeof TilesFadePlugin
          >
        }
      />
      <TilesPlugin plugin={UpdateOnChangePlugin} />
    </TilesRendererR3F>
  );
}
