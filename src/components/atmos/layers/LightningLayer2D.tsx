/**
 * LightningLayer2D — Renders lightning strikes as a maplibre symbol layer
 * using the same bolt-glyph icon as the 3D globe's `LightningOverlay3D`
 * (see `src/lib/map/lightningGlyph.ts`), instead of the plain circle markers
 * this layer used to draw. A strike read as a "giant bloomy white dot"
 * before this change (HamClock spec §16 / batch B3, issue #199).
 *
 * The icon is a static image registered per resolved tone/glow and repainted
 * in place (`updateImage`) when colour-blind mode or the HamClock theme
 * changes. Per-strike pulse (fresh strikes) and fade (aging strikes) are
 * driven by a `requestAnimationFrame` loop that re-evaluates
 * `icon-size`/`icon-opacity` data-driven expressions against the strike's
 * `time` property and the current clock — maplibre has no per-frame hook
 * like r3f's `useFrame`, so this is the closest equivalent. The loop runs at
 * ~30fps while any strike is still "fresh" (see LIGHTNING_FRESH_WINDOW_MS),
 * drops to ~2fps (setTimeout-gated rAF) once nothing is fresh but strikes
 * are still easing toward LIGHTNING_FADED_BRIGHTNESS, and stops only once
 * every strike has reached that floor; the next data refresh (or a newly
 * fresh strike) restarts it.
 */

import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useLightning } from "@/hooks/useLightning";
import type { LightningStrike } from "@/lib/api/lightning";
import {
  getLightningGlyphImageData,
  observeLightningTone,
  resolveLightningGlow,
  resolveLightningTone,
  LIGHTNING_BASE_PIXEL_SIZE,
  LIGHTNING_FADED_BRIGHTNESS,
  LIGHTNING_FRESH_WINDOW_MS,
  LIGHTNING_ICON_SIZE,
  LIGHTNING_MAX_AGE_MS,
  LIGHTNING_MAX_CURRENT_KA,
  LIGHTNING_MAX_SIZE_FACTOR,
  LIGHTNING_MIN_SIZE_FACTOR,
  LIGHTNING_PULSE_DURATION_MS,
  LIGHTNING_PULSE_PEAK,
} from "@/lib/map/lightningGlyph";

interface LightningLayer2DProps {
  map: maplibregl.Map;
}

const SOURCE_ID = "lightning-strikes";
const LAYER_ID = "lightning-bolts";
const ICON_ID = "lightning-bolt-icon";

function strikesToGeoJSON(
  strikes: LightningStrike[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: strikes.map((s) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [s.lon, s.lat],
      },
      properties: {
        kA: Math.abs(s.currentKA),
        time: s.time,
      },
    })),
  };
}

/**
 * `icon-size` is a scale factor on the registered icon's natural pixel size,
 * so the base value maps LIGHTNING_BASE_PIXEL_SIZE onto LIGHTNING_ICON_SIZE.
 * Peak-current intensity gives a modest size range; the pulse multiplies on
 * top of that for the first LIGHTNING_PULSE_DURATION_MS of a strike's life.
 */
function buildIconSizeExpression(now: number) {
  const age = ["-", now, ["get", "time"]];
  const intensity = ["max", 0.3, ["min", 1, ["/", ["get", "kA"], LIGHTNING_MAX_CURRENT_KA]]];
  const sizeFactor = [
    "+",
    LIGHTNING_MIN_SIZE_FACTOR,
    ["*", intensity, LIGHTNING_MAX_SIZE_FACTOR - LIGHTNING_MIN_SIZE_FACTOR],
  ];
  const pulseEnvelope = [
    "case",
    ["<", age, LIGHTNING_PULSE_DURATION_MS],
    [
      "+",
      1,
      [
        "*",
        LIGHTNING_PULSE_PEAK,
        ["sin", ["*", Math.PI, ["/", age, LIGHTNING_PULSE_DURATION_MS]]],
      ],
    ],
    1,
  ];
  const baseScale = LIGHTNING_BASE_PIXEL_SIZE / LIGHTNING_ICON_SIZE;
  return ["*", baseScale, sizeFactor, pulseEnvelope];
}

/**
 * Fresh strikes render at full opacity; once a strike ages past the fresh
 * window, opacity eases down toward LIGHTNING_FADED_BRIGHTNESS and holds
 * there rather than disappearing (this layer never drops strikes by age —
 * that stays the data hook's job).
 */
function buildIconOpacityExpression(now: number) {
  const age = ["-", now, ["get", "time"]];
  const fadeT = [
    "max",
    0,
    [
      "min",
      1,
      [
        "/",
        ["-", age, LIGHTNING_FRESH_WINDOW_MS],
        LIGHTNING_MAX_AGE_MS - LIGHTNING_FRESH_WINDOW_MS,
      ],
    ],
  ];
  return [
    "case",
    ["<", age, LIGHTNING_FRESH_WINDOW_MS],
    1,
    ["-", 1, ["*", fadeT, 1 - LIGHTNING_FADED_BRIGHTNESS]],
  ];
}

/**
 * Register (or repaint) the bolt icon for the given tone/glow. Uses
 * `updateImage` in place when the icon already exists — a colour-blind mode
 * or theme switch shouldn't require removing and re-adding the image (which
 * would also require re-adding the layer that references it).
 */
function ensureLightningIcon(
  map: maplibregl.Map,
  tone: string,
  glow: number,
): void {
  const icon = getLightningGlyphImageData(tone, glow);
  if (!icon) return;

  if (map.hasImage(ICON_ID)) {
    map.updateImage(ICON_ID, icon);
  } else {
    map.addImage(ICON_ID, icon);
  }
}

export function LightningLayer2D({ map }: LightningLayer2DProps) {
  const { strikes } = useLightning();

  useEffect(() => {
    if (!map.getStyle()) return;
    const geojson = strikesToGeoJSON(strikes);

    const source = map.getSource(SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (source) {
      source.setData(geojson);
    } else {
      ensureLightningIcon(map, resolveLightningTone(), resolveLightningGlow());

      map.addSource(SOURCE_ID, { type: "geojson", data: geojson });
      map.addLayer({
        id: LAYER_ID,
        type: "symbol",
        source: SOURCE_ID,
        layout: {
          "icon-image": ICON_ID,
          "icon-size": LIGHTNING_BASE_PIXEL_SIZE / LIGHTNING_ICON_SIZE,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        paint: {
          "icon-opacity": 1,
        },
      });
    }

    // Drive the pulse/fade animation. `icon-size` is a layout property, so
    // changing it re-tessellates the symbol buffers — throttled to ~30fps
    // (still smooth for a ~600ms pulse) rather than every rAF tick. Once
    // nothing in this snapshot of `strikes` is still fresh, opacity is still
    // easing toward LIGHTNING_FADED_BRIGHTNESS for the rest of the fade
    // window (LIGHTNING_MAX_AGE_MS) — dropping to ~30fps->0fps right at the
    // fresh boundary would freeze that ease near full opacity until the next
    // data refresh. So once nothing is fresh but something is still fading,
    // keep going at ~2fps (setTimeout-gated rAF) instead, and only stop once
    // every strike has reached the faded floor. A new fetch (or a newly
    // fresh strike) re-runs this effect and restarts the loop.
    const FRESH_INTERVAL_MS = 33;
    const FADE_INTERVAL_MS = 500;
    let rafId = 0;
    let fadeTimeoutId: ReturnType<typeof setTimeout> | undefined;
    let lastUpdate = 0;

    const anyFresh = (now: number) =>
      strikes.some((s) => now - s.time < LIGHTNING_FRESH_WINDOW_MS);
    const anyStillFading = (now: number) =>
      strikes.some((s) => now - s.time < LIGHTNING_MAX_AGE_MS);

    const tick = () => {
      if (!map.getLayer(LAYER_ID)) return;
      const now = Date.now();

      if (now - lastUpdate >= FRESH_INTERVAL_MS) {
        lastUpdate = now;
        map.setPaintProperty(LAYER_ID, "icon-opacity", buildIconOpacityExpression(now));
        map.setLayoutProperty(LAYER_ID, "icon-size", buildIconSizeExpression(now));
      }

      if (!anyStillFading(now)) return;

      if (anyFresh(now)) {
        rafId = requestAnimationFrame(tick);
      } else {
        fadeTimeoutId = setTimeout(() => {
          rafId = requestAnimationFrame(tick);
        }, FADE_INTERVAL_MS);
      }
    };
    if (strikes.length > 0) {
      tick();
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (fadeTimeoutId) clearTimeout(fadeTimeoutId);
    };
  }, [map, strikes]);

  // Re-resolve tone/glow on colour-blind mode or theme changes and repaint
  // the already-registered icon in place — otherwise an already-rendered
  // strike set would keep the old palette until the next data refresh.
  useEffect(() => {
    return observeLightningTone(() => {
      if (!map.getStyle()) return;
      ensureLightningIcon(map, resolveLightningTone(), resolveLightningGlow());
    });
  }, [map]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        if (map.hasImage(ICON_ID)) map.removeImage(ICON_ID);
      } catch {
        // Map already destroyed
      }
    };
  }, [map]);

  return null;
}
