/**
 * Flat-map (2D canvas) draw call for satellite orbit tracks (#994 PR B).
 *
 * Companion to `satelliteTrack2D.ts`'s pure geometry builder, kept in its own
 * module next to it rather than embedded in `FlatMapView.tsx` (6800+ lines) --
 * the same split `flatSpotClusterGlyphs.ts`/`flatSpotPath.ts` use for the
 * spot-cluster glyphs (#994 PR B round 2 item 8).
 */

import type { SatelliteCategory, SatelliteInfo } from "@/types/satellite";
import type { FlatSatelliteTrackGeometry } from "@/lib/map/satelliteTrack2D";

/** Fallback panel/text colors (mirror the `:root` defaults in
 * globals.css/hamclock-themes.css) for a document-less test environment. */
const SAT_TRACK_LABEL_FALLBACK_PANEL = "#191e2e";
const SAT_TRACK_LABEL_FALLBACK_TEXT = "#cad2dc";

export interface SatelliteTrackLabelColors {
  panel: string;
  text: string;
}

/**
 * The element whose computed style carries the resolved `--su-panel`/
 * `--su-text` tokens for the active theme. Both are re-declared on
 * `[data-hamclock-theme]` (and `.su-fixed-dark`), and the light theme inverts
 * them, so resolving against a bare `document.documentElement` paints the
 * wrong contrast pair whenever the map sits inside a themed HamClock wall
 * (#994 PR B round 2 finding 2). Mirrors `lightningGlyph.ts`'s
 * `themedElement()`.
 */
function themedElement(): Element {
  return (
    document.querySelector("[data-hamclock-theme]") ??
    document.documentElement
  );
}

/** The last resolved colors, kept so `resolveSatelliteTrackLabelColors` can
 * return the *same object reference* when nothing actually changed --
 * otherwise every call (including spurious ones from an unrelated DOM
 * mutation) allocates a fresh object, which propagates into React state and
 * forces a re-render even though the colors are identical (#994 PR B round
 * 4 Codex thread 1 P1 perf regression). */
let lastResolvedColors: SatelliteTrackLabelColors | null = null;

/**
 * Resolve the orbit-track time-marker label chip colors from the
 * `--su-panel` / `--su-text` design tokens (never a hardcoded near-white --
 * legibility standard) at call time, against the themed element rather than
 * `document.documentElement` -- see `themedElement` above. Returns the
 * previous return value's reference (not a fresh object) when both fields
 * are unchanged, so callers that key a re-render off this value (React
 * state, `useMemo` deps) see no change to react to.
 */
export function resolveSatelliteTrackLabelColors(): SatelliteTrackLabelColors {
  const next: SatelliteTrackLabelColors =
    typeof document === "undefined"
      ? {
          panel: SAT_TRACK_LABEL_FALLBACK_PANEL,
          text: SAT_TRACK_LABEL_FALLBACK_TEXT,
        }
      : (() => {
          const root = getComputedStyle(themedElement());
          const panel = root.getPropertyValue("--su-panel").trim();
          const text = root.getPropertyValue("--su-text").trim();
          return {
            panel: panel || SAT_TRACK_LABEL_FALLBACK_PANEL,
            text: text || SAT_TRACK_LABEL_FALLBACK_TEXT,
          };
        })();
  if (
    lastResolvedColors &&
    lastResolvedColors.panel === next.panel &&
    lastResolvedColors.text === next.text
  ) {
    return lastResolvedColors;
  }
  lastResolvedColors = next;
  return next;
}

/**
 * Re-resolve the label colors whenever the active theme changes. Unlike
 * `lightningGlyph.ts`'s `observeLightningTone` (scoped to just
 * `data-hamclock-theme`/`data-color-blind`, both set as plain attributes),
 * `--su-panel`/`--su-text` also change on the ordinary PropSphere page:
 * `applyThemeToDocument` writes them via `document.documentElement.style`
 * (`style.setProperty`) and toggles the `dark`/`light` class -- so a theme
 * switch outside a HamClock wall left the label chips on the old colors
 * until something else happened to re-resolve them (#994 PR B round 3
 * Codex thread 1).
 *
 * A single `subtree: true` observer watching `style`/`class`/
 * `data-hamclock-theme` together (the round-3 fix) fired on *every*
 * `style` mutation anywhere under `<html>` -- including `FlatMapView`'s own
 * pan/zoom `previewNavigation`, which writes `style.transform` on a
 * descendant element on every animation frame. That defeated the
 * retained-canvas navigation path even with no orbit track active (#994 PR
 * B round 4 Codex thread 1 P1 perf regression). Fixed by splitting into two
 * scoped observers instead of widening `attributeFilter` on one:
 *
 * 1. `style`/`class` only ever change *on the root itself* here
 *    (`applyThemeToDocument` writes `document.documentElement.style`/
 *    `.classList` directly) -- no `subtree` needed, so descendant
 *    `style`/`class` writes (pan/zoom transforms, anything else) are never
 *    observed at all.
 * 2. `data-hamclock-theme` is set on a div *inside* the view
 *    (`HamClockView.tsx`), never on `<html>`, so that one still needs
 *    `subtree: true` -- but scoped to just this attribute, which never
 *    changes during navigation.
 */
export function observeSatelliteTrackLabelColors(
  callback: () => void,
): () => void {
  if (
    typeof document === "undefined" ||
    typeof MutationObserver === "undefined"
  ) {
    return () => {};
  }
  const rootStyleObserver = new MutationObserver(() => callback());
  rootStyleObserver.observe(document.documentElement, {
    attributes: true,
    subtree: false,
    attributeFilter: ["style", "class"],
  });
  const themeAttrObserver = new MutationObserver(() => callback());
  themeAttrObserver.observe(document.documentElement, {
    attributes: true,
    subtree: true,
    attributeFilter: ["data-hamclock-theme"],
  });
  return () => {
    rootStyleObserver.disconnect();
    themeAttrObserver.disconnect();
  };
}

export interface FlatSatelliteTrackEntry {
  satellite: SatelliteInfo;
  geometry: FlatSatelliteTrackGeometry;
  isSelected: boolean;
}

/**
 * Draw store-driven "Map orbit" tracks (#994 PR B) on the 2D flat map.
 * Companion to `SatelliteOverlay`'s globe `GroundTrack`: same past/future
 * alpha (0.18 / 0.45) and per-satellite category color, same 10-minute dot
 * markers and time-marker labels, built from the shared geometry in
 * `satelliteTrack2D.ts` so the two views agree on point selection. Draw
 * order: after `drawSatelliteFootprints`, before `drawSatellites`, so the
 * track lines sit under the diamond markers.
 */
export function drawSatelliteTracks(
  ctx: CanvasRenderingContext2D,
  tracks: FlatSatelliteTrackEntry[],
  categoryColors: Record<SatelliteCategory, string>,
  labelColors: SatelliteTrackLabelColors,
  zoomScale = 1.0,
  labelScale = 1.0,
) {
  if (tracks.length === 0) return;
  const zoomDamp = Math.max(1, zoomScale);
  const { panel, text } = labelColors;

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (const { satellite, geometry, isSelected } of tracks) {
    const color = categoryColors[satellite.category] ?? "#aaaaaa";
    ctx.strokeStyle = color;
    ctx.lineWidth = (isSelected ? 3 : 2) / zoomDamp;

    ctx.globalAlpha = 0.18;
    for (const segment of geometry.pastSegments) {
      ctx.beginPath();
      segment.forEach((p, i) =>
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
      );
      ctx.stroke();
    }

    ctx.globalAlpha = 0.45;
    for (const segment of geometry.futureSegments) {
      ctx.beginPath();
      segment.forEach((p, i) =>
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
      );
      ctx.stroke();
    }

    ctx.globalAlpha = 0.5;
    ctx.fillStyle = color;
    const dotRadius = 2 / zoomDamp;
    for (const dot of geometry.dots) {
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    const fontSize = Math.max(1, Math.round((10 * labelScale) / zoomDamp));
    ctx.font = `${fontSize}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const label of geometry.labels) {
      const labelText =
        label.minutesFromNow === 0
          ? "now"
          : `${label.minutesFromNow > 0 ? "+" : ""}${label.minutesFromNow}m`;
      const padX = 3 / zoomDamp;
      const padY = 1.5 / zoomDamp;
      const chipW = ctx.measureText(labelText).width + padX * 2;
      const chipH = fontSize + padY * 2;
      const chipRadius = 2 / zoomDamp;

      ctx.fillStyle = panel;
      ctx.beginPath();
      ctx.roundRect(
        label.x - chipW / 2,
        label.y - chipH / 2,
        chipW,
        chipH,
        chipRadius,
      );
      ctx.fill();

      ctx.fillStyle = text;
      ctx.fillText(labelText, label.x, label.y + 0.5 / zoomDamp);
    }
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}
