/**
 * Ft8DecodeLayerFlat -- React component wrapper for FT8 decode Canvas 2D layer
 *
 * Renders decoded FT8/FT4 stations on the flat equirectangular map as colored
 * circle markers with great-circle arcs from the operator's position.
 *
 * This component manages its own overlay canvas and calls the pure draw
 * function from ft8DecodeLayerFlatDraw.ts on each animation frame.
 *
 * For direct integration into FlatMapView's render loop, import and call
 * drawFt8DecodeLayerFlat() from ft8DecodeLayerFlatDraw.ts instead.
 */

import { useRef, useEffect, useCallback } from "react";
import type { Ft8EnrichedDecode } from "@/lib/ft8/ft8EnrichedDecode";
import { drawFt8DecodeLayerFlat } from "./ft8DecodeLayerFlatDraw";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface Ft8DecodeLayerFlatProps {
  decodes: Ft8EnrichedDecode[];
  myLat?: number;
  myLon?: number;
  width: number;
  height: number;
  showArcs?: boolean;
  showLabels?: boolean;
  /** Maximum age in ms before markers fully fade (default 5 minutes) */
  ageMaxMs?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Ft8DecodeLayerFlat -- React component that manages its own overlay canvas.
 *
 * This can be absolutely positioned over the FlatMapView if the view does not
 * directly integrate the draw function into its render loop. The canvas is
 * transparent except for the drawn markers and arcs.
 */
export function Ft8DecodeLayerFlat(props: Ft8DecodeLayerFlatProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Match canvas resolution to logical size (retina-aware)
    const dpr = window.devicePixelRatio || 1;
    const logicalWidth = props.width;
    const logicalHeight = props.height;

    if (
      canvas.width !== logicalWidth * dpr ||
      canvas.height !== logicalHeight * dpr
    ) {
      canvas.width = logicalWidth * dpr;
      canvas.height = logicalHeight * dpr;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, logicalWidth, logicalHeight);
    drawFt8DecodeLayerFlat(ctx, props);

    rafRef.current = requestAnimationFrame(draw);
  }, [props]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  if (props.width <= 0 || props.height <= 0) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: props.width,
        height: props.height,
        pointerEvents: "none",
      }}
    />
  );
}

export default Ft8DecodeLayerFlat;
