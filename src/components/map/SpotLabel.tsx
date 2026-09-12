/**
 * SpotLabel Component
 *
 * Renders a callsign label at a spot location on the 3D globe.
 * Uses Html from @react-three/drei for CSS-styled labels that
 * integrate with Three.js transformations.
 *
 * Features:
 * - Mode-based coloring (FT8, CW, SSB, etc.)
 * - Sender vs receiver styling (outline vs filled)
 * - Age-based opacity decay
 * - Compact display optimized for dense spot views
 * - Hover-to-surface: hovered labels pop above the stack with
 *   scale bump + elevated z-index so you can flip through a
 *   crowded pile-up without losing your place.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Html } from "@react-three/drei";
import { getModeColor, getBandColor, inkOnFill } from "@/lib/utils/spotColors";
import type { ScreenAnchor } from "@/lib/map/anchoredOverlay";
import { GLOBE_DOM_LAYER_ORDER } from "@/lib/map/globeRenderOrder";
import { limbAlphaGate } from "@/lib/map/globeOcclusion";

/** Offset from globe surface to prevent z-fighting */
const SURFACE_OFFSET = 1.000002;

/**
 * Minimum globe-occlusion opacity contribution on the visible face. This
 * floors ONLY the limb-occlusion term (`occlusionOpacity`), never the
 * caller-supplied `opacity` prop (age decay / active-band / contact-posture
 * de-emphasis) — those are intentional, shipped dimming semantics and are
 * still allowed to push the occlusion-floored product below `FINAL_ALPHA_
 * FLOOR` (below), which is what backstops the FINAL rendered alpha. See the
 * usage site below for the measured contrast this floor guarantees.
 */
export const TEXT_OCCLUSION_FLOOR = 0.5;

/**
 * Minimum FINAL rendered text/background alpha, i.e. the floor applied
 * AFTER `TEXT_OCCLUSION_FLOOR` and the caller's `opacity` prop are combined
 * (`textOpacity` below) -- restores the readability floor an earlier
 * revision (4619980c/f6dc92f2) applied to the combined product, which the
 * occlusion-only split (round 8, #851) dropped. With de-emphasis multipliers
 * stacked by callers (e.g. LiveSpotArcs' off-band-spotter tag: 0.6 * 0.3
 * active-band * 0.35 contact-posture ~= 0.063), the occlusion-only floor
 * still lets the FINAL alpha collapse toward invisible even fully on the
 * near side (occlusionOpacity === 1, so TEXT_OCCLUSION_FLOOR never engages).
 * Matches the 0.35 value the parent revision used before it was raised to
 * 0.82 and then replaced by the occlusion-only split. This floors only the
 * text/background color ALPHA channel, never the wrapper `<div>`'s own CSS
 * `opacity` (`wrapperOpacity`/`isVisible` below, driven by
 * `occlusionOpacity` alone), which is the other mechanism that hides
 * far-side labels and multiplies with this alpha during compositing.
 * This is a FRONT-SIDE floor (#932): `wrapperOpacity` is gated by
 * `limbAlphaGate`, so a label past the horizon composites to 0 regardless of
 * this floor, and every other channel (underline, shadow, badges, the
 * hover/selected branches) fades with it.
 */
const FINAL_ALPHA_FLOOR = 0.35;

/** Combined opacity below which a label is fully hidden (and non-interactive). */
const HIDE_THRESHOLD = 0.05;
/** Combined opacity at/above which the wrapper fade-in reaches full opacity. */
const FADE_IN_END = 0.25;
/**
 * Occlusion opacity at/above which the *target* for mouse/pointer
 * hit-testing (`receivesPointer`) turns on. Deliberately NOT the same
 * threshold as `isVisible` (`HIDE_THRESHOLD`): at `occlusionOpacity ===
 * HIDE_THRESHOLD`, `isVisible` is already true but `wrapperOpacity` is
 * still exactly 0 -- CSS `opacity` does not remove hit testing, so a label
 * in that window would be invisible yet still clickable/draggable, letting
 * it intercept globe interaction the user is aiming at what's underneath.
 * Reusing `FADE_IN_END` (rather than a separate constant) means this
 * threshold lines up with the exact occlusion value where `wrapperOpacity`
 * reaches 1. That alone isn't sufficient, though: the wrapper also has a
 * `opacity 0.3s ease` CSS transition, so the *computed* opacity can stay
 * below 1 for up to 300ms after `receivesPointer` flips true. See
 * `pointerReady`'s doc comment (in the component body) for how that
 * residual gap is closed.
 */
const POINTER_ENABLE_THRESHOLD = FADE_IN_END;

export interface SpotLabelProps {
  /** Latitude in decimal degrees */
  lat: number;
  /** Longitude in decimal degrees */
  lon: number;
  /** Callsign to display */
  callsign: string;
  /** Operating mode for color styling */
  mode?: string;
  /** Whether this is the spotter (sender) vs DX (receiver) */
  isSpotter?: boolean;
  /**
   * Caller-supplied de-emphasis multiplier (0-1): active-band filtering,
   * contact-posture dimming, and the flat 0.6 spotter-tag discount are all
   * folded into this by callers (see `LiveSpotArcs.tsx`). Independent of,
   * and multiplied with, `occlusionOpacity` below. Defaults to 1.0.
   */
  opacity?: number;
  /** Label size variant */
  size?: "sm" | "md";
  /** Optional frequency to display */
  frequency?: number;
  /** Compact source badge shown after the callsign/frequency. */
  badge?: string;
  /** Accessible name when the pill opens or selects something. */
  ariaLabel?: string;
  /** Stack offset index for nearby labels (0 = no offset) */
  stackIndex?: number;
  /** Deterministic viewport-space displacement from the shared layout pass. */
  screenOffset?: { x: number; y: number };
  /** Visual label scale mirrored by the shared collision bounds. */
  labelScale?: number;
  /** Pre-computed color (hex). When provided, used instead of getModeColor(mode). */
  color?: string;
  /**
   * Pre-computed globe occlusion opacity (0-1).
   * When provided, the label skips its internal useGlobeOcclusion hook.
   * Use this when a parent component batches occlusion via useGlobeOcclusionBatch.
   * Defaults to 1.0 (fully visible).
   */
  occlusionOpacity?: number;
  /** Called when mouse enters this label */
  onHover?: (screenPos: ScreenAnchor) => void;
  /** Called when mouse leaves this label */
  onHoverEnd?: () => void;
  /** Selects this spot and opens its canonical detail surface. */
  onSelect?: (screenPos: ScreenAnchor) => void;
  /** Keeps the selected target visually elevated after hover ends. */
  selected?: boolean;
  /** Called when this label is clicked or keyboard-activated. */
  onClick?: () => void;
}

/**
 * Convert lat/lon to 3D position on sphere
 */
function latLonTo3D(
  lat: number,
  lon: number,
  radius: number,
): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

/**
 * Format frequency for compact display (e.g., "14.074" for 14074 kHz)
 */
function formatFrequency(freq: number): string {
  if (freq >= 1000) {
    return (freq / 1000).toFixed(3);
  }
  return freq.toString();
}

/**
 * SpotLabel renders a callsign label at a geographic location
 *
 * @example
 * ```tsx
 * <SpotLabel
 *   lat={45.5}
 *   lon={-122.6}
 *   callsign="W7ABC"
 *   mode="FT8"
 *   isSpotter={false}
 *   opacity={0.9}
 * />
 * ```
 */
export function SpotLabel({
  lat,
  lon,
  callsign,
  mode,
  // isSpotter not used — both label types use unified dark-pill styling
  opacity = 1.0,
  size = "sm",
  frequency,
  badge,
  ariaLabel,
  stackIndex = 0,
  screenOffset,
  labelScale = 1,
  color: colorProp,
  occlusionOpacity = 1.0,
  onHover,
  onHoverEnd,
  onSelect,
  selected = false,
  onClick,
}: SpotLabelProps) {
  const [isHovered, setIsHovered] = useState(false);
  const pointerHoveredRef = useRef(false);
  const keyboardFocusedRef = useRef(false);
  const onHoverEndRef = useRef(onHoverEnd);
  onHoverEndRef.current = onHoverEnd;

  // Labels are dynamically culled and can become part of a cluster while the
  // pointer is still over them. Mouse-leave never fires after that unmount, so
  // explicitly release only hover ownership this label actually acquired.
  // Keeping the latest callback in a ref avoids treating ordinary callback
  // identity changes as an unmount/release event.
  useEffect(
    () => () => {
      if (pointerHoveredRef.current || keyboardFocusedRef.current) {
        onHoverEndRef.current?.();
      }
    },
    [],
  );

  // Validate coordinates
  const hasValidCoords = Number.isFinite(lat) && Number.isFinite(lon);

  // Calculate 3D position
  const position = useMemo(
    () =>
      hasValidCoords
        ? latLonTo3D(lat, lon, SURFACE_OFFSET)
        : ([0, 0, 0] as [number, number, number]),
    [lat, lon, hasValidCoords],
  );

  // Use pre-computed color when provided, otherwise fall back to mode color
  const color = colorProp ?? getModeColor(mode);

  // Band-indicator underline: always derive from frequency so the underline
  // shows which band a spot is on, regardless of the mode/band color setting.
  // Falls back to the general spot color when no frequency is available.
  const underlineColor = frequency ? getBandColor(frequency) : color;

  // Visibility is gated on `occlusionOpacity` alone — the same domain the
  // ramp below runs in. Gating on `opacity * occlusionOpacity` instead (as
  // this used to) desyncs the two: for a de-emphasised caller opacity (e.g.
  // 0.18, a real off-band-spotter value), the combined product doesn't clear
  // HIDE_THRESHOLD until occlusion ~0.278 — past FADE_IN_END (0.25) — so the
  // ramp is already saturated at 1 the instant visibility flips on, and the
  // wrapper pops straight from 0 to a fully-drawn tag instead of fading in.
  const isVisible = occlusionOpacity >= HIDE_THRESHOLD;
  // Gated on POINTER_ENABLE_THRESHOLD, not isVisible/HIDE_THRESHOLD -- see
  // that constant's doc comment.
  const receivesPointer =
    Boolean(onHover || onHoverEnd || onSelect || onClick) &&
    occlusionOpacity >= POINTER_ENABLE_THRESHOLD;
  // Ramp the wrapper in linearly across the last band of OCCLUSION opacity
  // only -- not multiplied by the caller's `opacity` here. The caller's
  // de-emphasis is already applied once, to the text alpha, via
  // `flooredOcclusion * opacity` below; multiplying it into the wrapper too
  // would square it into the rendered result (e.g. opacity=0.18 would yield
  // wrapper 0.18 * text alpha 0.18 = 0.032 effective ink for a fully visible
  // tag) -- exactly the double-dimming the B1 fix (4d812d0) removed. `isVisible`
  // above now shares this ramp's occlusion-only domain, so the two can never
  // desync and the wrapper can't jump further than one ramp step.
  //
  // The linear ramp is then multiplied by the shared `limbAlphaGate` (#932).
  // Gating the wrapper rather than any single channel is what makes a tag
  // past the horizon disappear WHOLE: the wrapper's CSS opacity scales the
  // text, the badge background, the band underline (`borderBottom`), the
  // glow/drop `boxShadow` and every mode/band child chip together, including
  // the hover/selected branches that bypass `textOpacity` entirely. Gating
  // only the text alpha left underlines, badges and selected pills painted
  // over the far side of the globe after the callsign had faded out.
  // A label is not depth-tested, so this band straddles the limb: the tag
  // stays lit up to tangency and fades out just past it. Arcs cannot do that
  // (the depth test rejects them at tangency) and fade on the visible side
  // instead — see `ARC_LIMB_FADE_WINDOW` in `src/lib/map/arcLimbFade.ts`.
  const wrapperOpacity = isVisible
    ? Math.max(
        0,
        Math.min(
          1,
          (occlusionOpacity - HIDE_THRESHOLD) / (FADE_IN_END - HIDE_THRESHOLD),
        ),
      ) * limbAlphaGate(occlusionOpacity)
    : 0;

  // `receivesPointer` flips true the instant occlusionOpacity crosses
  // POINTER_ENABLE_THRESHOLD, but the wrapper's own `opacity 0.3s ease`
  // transition (below) means the *rendered* opacity can still be mid-fade
  // -- possibly starting at 0 -- for up to 300ms after that. CSS opacity
  // never removes hit testing on its own, so without this, a still-fading
  // (or still-fully-transparent) label could intercept globe clicks/drags
  // for that entire window (#851, round 8). `pointerReady` closes it: it
  // only flips true once the wrapper's own opacity transition actually
  // finishes (`onTransitionEnd`, filtered to `propertyName === "opacity"`
  // and to events targeting the wrapper itself, not a bubbled child
  // transition), and flips false immediately -- no transition wait -- the
  // instant `receivesPointer` goes false, so hiding is never delayed.
  // Initialised from `receivesPointer` at mount: a label that mounts
  // already fully visible has no fade-in transition to wait for.
  const [pointerReady, setPointerReady] = useState(receivesPointer);
  const receivesPointerRef = useRef(receivesPointer);
  receivesPointerRef.current = receivesPointer;
  useEffect(() => {
    if (!receivesPointer) {
      setPointerReady(false);
    }
  }, [receivesPointer]);
  const handleWrapperTransitionEnd = useCallback(
    (event: React.TransitionEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.propertyName !== "opacity") return;
      if (receivesPointerRef.current) {
        setPointerReady(true);
      }
    },
    [],
  );
  // Single combined gate for both mouse hit-testing (`pointerEvents`) and
  // keyboard reachability (rendering a `<button>` vs. an inert `<span>`):
  // a label that isn't fully faded in yet must be neither clickable nor
  // tab-focusable, even though `isVisible` (HIDE_THRESHOLD) already true.
  const interactionReady = receivesPointer && pointerReady;
  const isInteractive = Boolean(onSelect || onClick) && interactionReady;

  // Rotating below the interaction threshold swaps the <button> for an
  // inert <span> (via `isInteractive` above) while the component stays
  // mounted. The removed button node doesn't reliably fire its
  // blur/mouseleave -- the span never gets onFocus/onBlur at all, and its
  // onMouseEnter/onMouseLeave are themselves gated on `interactionReady` --
  // so without this, pointerHoveredRef/keyboardFocusedRef/isHovered stay
  // set and onHoverEnd never fires: LiveSpotArcs keeps the hover candidate
  // and preview open, and the occluded label stays promoted in
  // `activeSpotLabel` (#851, round 12). Mirror the real blur/mouseleave
  // release exactly once, only on the falling edge (`wasReady &&
  // !interactionReady`) -- comparing against the previous render's value
  // (not just checking the refs) means this never fires on mount, since
  // the ref is seeded from the initial `interactionReady` before any
  // render runs. A StrictMode replay re-runs this effect with the ref
  // already updated to the current value, so the comparison is false both
  // times; once the refs are cleared here, a later render with the same
  // (still-not-ready) props also compares false and can't re-fire.
  const wasInteractionReadyRef = useRef(interactionReady);
  useEffect(() => {
    const wasReady = wasInteractionReadyRef.current;
    wasInteractionReadyRef.current = interactionReady;
    if (
      wasReady &&
      !interactionReady &&
      (pointerHoveredRef.current || keyboardFocusedRef.current)
    ) {
      pointerHoveredRef.current = false;
      keyboardFocusedRef.current = false;
      setIsHovered(false);
      onHoverEndRef.current?.();
    }
  }, [interactionReady]);

  // Size classes - sized for legibility (target audience 50-70 age range)
  const sizeClasses =
    size === "sm" ? "text-xs px-1.5 py-0.5" : "text-sm px-2 py-1";

  // Hover handlers — always enabled so labels in a stack are navigable,
  // even spotter labels that don't have an onHover detail callback.
  const handleMouseEnter = useCallback(
    (e: React.MouseEvent) => {
      pointerHoveredRef.current = true;
      setIsHovered(true);
      const rect = e.currentTarget.getBoundingClientRect();
      onHover?.({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    },
    [onHover],
  );

  const handleMouseLeave = useCallback(() => {
    pointerHoveredRef.current = false;
    setIsHovered(keyboardFocusedRef.current);
    if (!keyboardFocusedRef.current) onHoverEnd?.();
  }, [onHoverEnd]);

  const handleFocus = useCallback(
    (event: React.FocusEvent<HTMLButtonElement>) => {
      keyboardFocusedRef.current = true;
      setIsHovered(true);
      const rect = event.currentTarget.getBoundingClientRect();
      onHover?.({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    },
    [onHover],
  );

  const handleBlur = useCallback(() => {
    keyboardFocusedRef.current = false;
    setIsHovered(pointerHoveredRef.current);
    if (!pointerHoveredRef.current) onHoverEnd?.();
  }, [onHoverEnd]);

  const stopInteraction = useCallback((event: React.SyntheticEvent) => {
    event.stopPropagation();
  }, []);

  const selectAtElement = useCallback(
    (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      onSelect?.({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
      onClick?.();
    },
    [onClick, onSelect],
  );

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (isInteractive) selectAtElement(event.currentTarget);
    },
    [isInteractive, selectAtElement],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (isInteractive && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        selectAtElement(event.currentTarget);
      }
    },
    [isInteractive, selectAtElement],
  );

  const handleDoubleClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  if (!hasValidCoords) {
    return null;
  }

  // Keep the legacy stack index for non-coordinated callers. Globe activity
  // labels receive a full x/y displacement from the shared screen-space pass.
  const offsetX = screenOffset?.x ?? 0;
  const offsetY = screenOffset?.y ?? stackIndex * -24;
  const wrapperTransform = [
    offsetX || offsetY ? `translate(${offsetX}px, ${offsetY}px)` : "",
    labelScale !== 1 ? `scale(${labelScale})` : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Text opacity fades with age/filter/contact dimming and limb occlusion,
  // but underline stays fully bright. The occlusion term is floored first —
  // flooring the raw product against a single floor (as before) erased
  // legitimate `opacity`-prop de-emphasis (active-band filtering, contact
  // posture, the spotter tag's flat 0.6 discount in `LiveSpotArcs.tsx`).
  // Below the occlusion floor the white text and the dark badge it sits on
  // both wash out toward the globe canvas and converge toward each other
  // faster than either converges toward the canvas. Measured against the
  // real dark canvas backdrop (`--su-canvas` #141827), TEXT_OCCLUSION_FLOOR
  // = 0.5 keeps effective text-vs-badge contrast at 5.300:1 (WCAG floor is
  // 4.5:1; breakeven is ~0.445) at full caller opacity. See `stationContrast`
  // in `src/lib/themes/stationTokens`. That alone isn't sufficient, though:
  // de-emphasis multipliers stack across callers, so the combined product
  // can still collapse well below the occlusion floor even at full occlusion
  // (occlusionOpacity === 1). `FINAL_ALPHA_FLOOR` backstops the combined
  // product itself so contrast never regresses below what shipped before
  // round 8 (#851, round 10) — see its doc comment.
  // Both floors are FRONT-SIDE floors only. What re-couples them to the limb
  // is `wrapperOpacity` above, which multiplies this alpha (and every other
  // channel) during compositing and is itself gated by `limbAlphaGate`, so a
  // label the limb has hidden renders at 0 whatever these floors say (#932).
  // Applying the gate here as well would attenuate the text twice relative to
  // the badge behind it and pull their contrast ratio apart mid-fade.
  const flooredOcclusion = Math.max(occlusionOpacity, TEXT_OCCLUSION_FLOOR);
  const textOpacity = Math.max(flooredOcclusion * opacity, FINAL_ALPHA_FLOOR);
  const labelStyle: React.CSSProperties = {
    cursor: isInteractive
      ? "pointer"
      : interactionReady
        ? "default"
        : "inherit",
    color:
      isHovered || selected
        ? "rgba(255, 255, 255, 1)"
        : `rgba(255, 255, 255, ${textOpacity})`,
    backgroundColor:
      isHovered || selected
        ? "rgba(10, 10, 26, 0.95)"
        : `rgba(10, 10, 26, ${0.88 * textOpacity})`,
    borderBottom: `3px solid ${underlineColor}`,
    borderRadius: "4px 4px 0 0",
    boxShadow:
      isHovered || selected
        ? `0 3px 0 ${underlineColor}, 0 0 12px ${underlineColor}80, 0 6px 16px rgba(0,0,0,0.7)`
        : `0 3px 0 ${underlineColor}, 0 5px 10px rgba(0,0,0,0.5)`,
    textShadow: "0 1px 2px rgba(0,0,0,0.8)",
    letterSpacing: "0.03em",
    lineHeight: 1.2,
    transform: isHovered ? "scale(1.2)" : selected ? "scale(1.15)" : "scale(1)",
    transformOrigin: "center bottom",
    transition:
      "transform 0.15s ease-out, box-shadow 0.15s ease-out, background-color 0.15s ease-out, color 0.15s ease-out",
  };
  const labelContent = (
    <>
      {callsign}
      {frequency && (
        <span
          className="ml-1"
          style={{
            fontSize: "0.9em",
            opacity: isHovered || selected ? 0.9 : 0.75,
          }}
        >
          {formatFrequency(frequency)}
        </span>
      )}
      {badge && (
        <span
          className="ml-1 rounded-sm px-1 py-px"
          style={{
            fontSize: "0.72em",
            color: inkOnFill(underlineColor),
            backgroundColor: underlineColor,
          }}
        >
          {badge}
        </span>
      )}
    </>
  );

  return (
    <Html
      position={position}
      center
      // When hovered or selected, promote to the dedicated activeSpotLabel
      // band -- strictly above pinLabel, not the same band pins use -- so
      // this label renders above every passive tag, cluster chip, marker
      // AND every saved pin in the stack; otherwise it stays in the passive
      // spot-tag band. Sharing pinLabel with saved pins (as before) let
      // drei's per-element camera-distance tie-break put a nearer pin above
      // a farther promoted tag (#851, round 11) -- see activeSpotLabel's
      // doc comment in globeRenderOrder.ts.
      zIndexRange={
        isHovered || selected
          ? GLOBE_DOM_LAYER_ORDER.activeSpotLabel
          : GLOBE_DOM_LAYER_ORDER.passiveSpotLabel
      }
      // drei's Html renders its own outer DOM wrapper (default
      // pointer-events: auto) sized to the label's border box, in addition
      // to the inner div below. Without this, that outer wrapper still
      // hit-tests even when the inner div is pointer-events: none, so a
      // hidden/fading label could still block globe drags underneath it
      // (#851, round 9). Html forwards `style` straight onto that wrapper.
      style={{ pointerEvents: interactionReady ? "auto" : "none" }}
    >
      {/*
        drei's Html overlay component only forwards style/className/children
        to the DOM node it owns, not arbitrary event handlers -- so the
        opacity ramp and its onTransitionEnd listener (needed for
        `pointerReady` above) have to live on a real element this component
        renders itself, not on that overlay's own wrapper. This div is that
        element; it owns exactly the styles the wrapper's style prop used to
        carry before this change.
      */}
      <div
        data-testid="spot-label-wrapper"
        onTransitionEnd={handleWrapperTransitionEnd}
        style={{
          // Hidden far-side labels must not remain hoverable or clickable
          // through the globe. `interactionReady`, not `receivesPointer`
          // alone -- see `pointerReady`'s doc comment above.
          pointerEvents: interactionReady ? "auto" : "none",
          userSelect: "none",
          transition: "opacity 0.3s ease",
          transform: wrapperTransform || undefined,
          transformOrigin: "center bottom",
          // Ramps in across the last band of OCCLUSION opacity and only
          // fully hides once occluded past HIDE_THRESHOLD.
          opacity: wrapperOpacity,
        }}
      >
        {isInteractive ? (
          <button
            type="button"
            className={`appearance-none border-0 font-mono font-bold whitespace-nowrap ${sizeClasses}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onPointerDown={stopInteraction}
            onPointerUp={stopInteraction}
            onTouchStart={stopInteraction}
            onTouchEnd={stopInteraction}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onKeyDown={handleKeyDown}
            onKeyUp={stopInteraction}
            aria-label={
              ariaLabel ??
              (onSelect ? `Select ${callsign} as target` : `${callsign} spot`)
            }
            aria-pressed={onSelect ? selected : undefined}
            style={labelStyle}
          >
            {labelContent}
          </button>
        ) : (
          <span
            className={`block font-mono font-bold whitespace-nowrap ${sizeClasses}`}
            onMouseEnter={interactionReady ? handleMouseEnter : undefined}
            onMouseLeave={interactionReady ? handleMouseLeave : undefined}
            aria-hidden="true"
            style={labelStyle}
          >
            {labelContent}
          </span>
        )}
      </div>
    </Html>
  );
}

export default SpotLabel;
