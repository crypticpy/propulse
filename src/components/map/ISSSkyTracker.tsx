/**
 * ISSSkyTracker Component
 *
 * A mini polar sky chart overlay showing the ISS position and pass tracks
 * from the observer's perspective. Draggable DOM overlay with a 6-dot grip
 * handle, animated teal pass track, and real-time pass countdown.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useISSTracker } from "@/hooks/useISSTracker";
import { useUserStore } from "@/stores/userStore";
import type { ISSSkyPoint } from "@/hooks/useISSTracker";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHART_SIZE = 210;
const CHART_CENTER = 105;
const CHART_RADIUS = 82;

// Approximate panel dimensions for bounds clamping
const PANEL_WIDTH = 230;
const PANEL_HEIGHT = 330;

// Teal palette for pass track
const TEAL_BRIGHT = "#00E5CC";
const TEAL_GLOW = "rgba(0, 229, 204, 0.25)";
const TEAL_DIM = "rgba(0, 229, 204, 0.45)";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function azimuthToCompass(az: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(az / 45) % 8;
  return dirs[idx];
}

/**
 * Convert sky coordinates (elevation, azimuth) to canvas pixel coordinates.
 *
 * Azimuth 0 = North = top of chart, increasing clockwise.
 * Elevation 90 = center, 0 = outer edge.
 */
function skyToCanvas(el: number, az: number): { x: number; y: number } {
  const r = ((90 - el) / 90) * CHART_RADIUS;
  const angleRad = ((az - 90) * Math.PI) / 180;
  return {
    x: CHART_CENTER + r * Math.cos(angleRad),
    y: CHART_CENTER + r * Math.sin(angleRad),
  };
}

/**
 * Compute cumulative arc-length at each point for dash offset animation.
 */
function cumulativeArcLengths(points: { x: number; y: number }[]): number[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    lengths.push(lengths[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  return lengths;
}

// ---------------------------------------------------------------------------
// Canvas Drawing
// ---------------------------------------------------------------------------

function drawPolarChart(
  ctx: CanvasRenderingContext2D,
  options: {
    skyTrack: ISSSkyPoint[] | null;
    elevation: number | null;
    azimuth: number | null;
    isAboveHorizon: boolean;
    hasActivePass: boolean;
    glowPhase: number; // 0..1 for pulsing
    animTime: number; // elapsed ms for marching dashes
  },
) {
  const {
    skyTrack,
    elevation,
    azimuth,
    isAboveHorizon,
    hasActivePass,
    glowPhase,
    animTime,
  } = options;

  ctx.clearRect(0, 0, CHART_SIZE, CHART_SIZE);

  // --- Background: dark navy circle with subtle radial gradient ---
  const bgGrad = ctx.createRadialGradient(
    CHART_CENTER,
    CHART_CENTER,
    0,
    CHART_CENTER,
    CHART_CENTER,
    CHART_RADIUS,
  );
  bgGrad.addColorStop(0, "#12122a");
  bgGrad.addColorStop(1, "#0a0a1a");
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  ctx.arc(CHART_CENTER, CHART_CENTER, CHART_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // --- Elevation rings (0, 30, 60) ---
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 0.5;

  const rings = [
    { el: 0, label: "" },
    { el: 30, label: "30\u00B0" },
    { el: 60, label: "60\u00B0" },
  ];

  for (const ring of rings) {
    const r = ((90 - ring.el) / 90) * CHART_RADIUS;
    ctx.beginPath();
    ctx.arc(CHART_CENTER, CHART_CENTER, r, 0, Math.PI * 2);
    ctx.stroke();

    if (ring.label) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
      ctx.font = "8px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(ring.label, CHART_CENTER + r + 2, CHART_CENTER - 1);
    }
  }

  // --- Cross hairs (N-S and E-W through center) ---
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(CHART_CENTER, CHART_CENTER - CHART_RADIUS);
  ctx.lineTo(CHART_CENTER, CHART_CENTER + CHART_RADIUS);
  ctx.moveTo(CHART_CENTER - CHART_RADIUS, CHART_CENTER);
  ctx.lineTo(CHART_CENTER + CHART_RADIUS, CHART_CENTER);
  ctx.stroke();

  // --- Compass labels ---
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const compassOffset = CHART_RADIUS + 12;
  ctx.fillText("N", CHART_CENTER, CHART_CENTER - compassOffset);
  ctx.fillText("S", CHART_CENTER, CHART_CENTER + compassOffset);
  ctx.fillText("E", CHART_CENTER + compassOffset, CHART_CENTER);
  ctx.fillText("W", CHART_CENTER - compassOffset, CHART_CENTER);

  // --- Pass track line (glowing teal, animated) ---
  if (skyTrack && skyTrack.length >= 2) {
    const points = skyTrack.map((pt) => skyToCanvas(Math.max(pt.el, 0), pt.az));

    // Build path helper
    const tracePath = () => {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
    };

    // Layer 1: Wide teal glow underneath
    tracePath();
    ctx.strokeStyle = TEAL_GLOW;
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([]);
    ctx.stroke();

    // Layer 2: Medium glow
    tracePath();
    ctx.strokeStyle = hasActivePass
      ? "rgba(0, 229, 204, 0.4)"
      : "rgba(0, 229, 204, 0.2)";
    ctx.lineWidth = 4;
    ctx.setLineDash([]);
    ctx.stroke();

    // Layer 3: Bright core line with animated marching dashes
    const totalLen = cumulativeArcLengths(points);
    const pathLength = totalLen[totalLen.length - 1];
    // Dash pattern: 6px on, 4px off — marching at 30px/sec
    const dashSpeed = 30;
    const dashOffset = -(animTime / 1000) * dashSpeed;

    tracePath();
    if (hasActivePass) {
      ctx.strokeStyle = TEAL_BRIGHT;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = dashOffset;
    } else {
      ctx.strokeStyle = TEAL_DIM;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = dashOffset;
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Layer 4: Solid thin bright center (gives continuous glow feeling)
    tracePath();
    ctx.strokeStyle = hasActivePass
      ? "rgba(0, 229, 204, 0.6)"
      : "rgba(0, 229, 204, 0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.stroke();

    // Direction arrow at the LOS end (teal, larger)
    if (points.length >= 2) {
      const last = points[points.length - 1];
      const prev = points[points.length - 2];
      const dx = last.x - prev.x;
      const dy = last.y - prev.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        const ux = dx / len;
        const uy = dy / len;
        const arrowSize = 7;
        ctx.fillStyle = hasActivePass ? TEAL_BRIGHT : TEAL_DIM;
        ctx.beginPath();
        ctx.moveTo(last.x + ux * arrowSize, last.y + uy * arrowSize);
        ctx.lineTo(
          last.x - ux * arrowSize + uy * arrowSize * 0.6,
          last.y - uy * arrowSize - ux * arrowSize * 0.6,
        );
        ctx.lineTo(
          last.x - ux * arrowSize - uy * arrowSize * 0.6,
          last.y - uy * arrowSize + ux * arrowSize * 0.6,
        );
        ctx.closePath();
        ctx.fill();
      }
    }

    // AOS / LOS labels (teal tint)
    ctx.font = "bold 8px sans-serif";
    ctx.fillStyle = "rgba(0, 229, 204, 0.6)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const aosPoint = points[0];
    const losPoint = points[points.length - 1];
    ctx.fillText("AOS", aosPoint.x, aosPoint.y - 8);
    ctx.fillText("LOS", losPoint.x, losPoint.y + 8);

    // Small flow dots along the track to emphasize direction
    if (pathLength > 20) {
      const dotSpacing = 20;
      const dotPhase = ((animTime / 1000) * dashSpeed) % dotSpacing;
      let ptIdx = 0;
      for (let d = dotPhase; d < pathLength; d += dotSpacing) {
        // Find the point at arc length d
        while (ptIdx < totalLen.length - 1 && totalLen[ptIdx + 1] < d) {
          ptIdx++;
        }
        if (ptIdx >= points.length - 1) break;
        const segLen = totalLen[ptIdx + 1] - totalLen[ptIdx];
        if (segLen === 0) continue;
        const t = (d - totalLen[ptIdx]) / segLen;
        const px =
          points[ptIdx].x + t * (points[ptIdx + 1].x - points[ptIdx].x);
        const py =
          points[ptIdx].y + t * (points[ptIdx + 1].y - points[ptIdx].y);

        ctx.fillStyle = hasActivePass
          ? "rgba(0, 229, 204, 0.7)"
          : "rgba(0, 229, 204, 0.35)";
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // --- ISS position dot ---
  if (elevation !== null && azimuth !== null) {
    if (isAboveHorizon) {
      const pos = skyToCanvas(elevation, azimuth);

      // Glow pulse (teal)
      const glowRadius = 12 + glowPhase * 5;
      const glowAlpha = 0.2 + glowPhase * 0.2;
      ctx.fillStyle = `rgba(0, 229, 204, ${glowAlpha})`;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      // Core dot
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (elevation > -10) {
      // Near horizon -- show dim dot clamped to edge
      const pos = skyToCanvas(0, azimuth);
      ctx.fillStyle = "rgba(150, 150, 150, 0.4)";
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ISSSkyTracker() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [isVisible, setIsVisible] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const glowPhaseRef = useRef(0);

  // --- Drag state ---
  const panelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const positionStartRef = useRef({ x: 0, y: 0 });

  const station = useUserStore((s) => s.station);

  const {
    iss,
    elevation,
    azimuth,
    isAboveHorizon,
    currentPass,
    nextPass,
    skyTrack,
  } = useISSTracker();

  // Store data values in refs so the rAF loop can access them without re-creating
  const dataRef = useRef({
    skyTrack,
    elevation,
    azimuth,
    isAboveHorizon,
    currentPass,
  });
  dataRef.current = {
    skyTrack,
    elevation,
    azimuth,
    isAboveHorizon,
    currentPass,
  };

  // --- Find container element for bounds clamping ---
  useEffect(() => {
    if (panelRef.current) {
      let parent = panelRef.current.parentElement;
      while (parent) {
        const style = window.getComputedStyle(parent);
        if (style.position === "relative" || style.position === "absolute") {
          containerRef.current = parent;
          break;
        }
        parent = parent.parentElement;
      }
    }
  }, []);

  // --- Compute default position (bottom-right corner) ---
  useEffect(() => {
    if (position !== null) return;
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPosition({
        x: rect.width - PANEL_WIDTH - 12,
        y: rect.height - PANEL_HEIGHT - 12,
      });
    } else {
      setPosition({
        x: window.innerWidth - PANEL_WIDTH - 12,
        y: window.innerHeight - PANEL_HEIGHT - 12,
      });
    }
  }, [position]);

  // --- Drag handlers ---
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!position) return;
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      positionStartRef.current = { ...position };
    },
    [position],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;
      let newX = positionStartRef.current.x + deltaX;
      let newY = positionStartRef.current.y + deltaY;

      // Clamp to container
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        newX = Math.max(4, Math.min(rect.width - PANEL_WIDTH - 4, newX));
        newY = Math.max(4, Math.min(rect.height - PANEL_HEIGHT - 4, newY));
      }

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // --- 1-second timer for countdown ---
  useEffect(() => {
    if (!isVisible) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isVisible]);

  // --- Canvas draw helper (called directly from rAF, not via React state) ---
  const drawCanvasDirect = useCallback(
    (glowPhase: number, animTime: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const w = CHART_SIZE;
      const h = CHART_SIZE;

      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const d = dataRef.current;
      drawPolarChart(ctx, {
        skyTrack: d.skyTrack,
        elevation: d.elevation,
        azimuth: d.azimuth,
        isAboveHorizon: d.isAboveHorizon,
        hasActivePass: d.currentPass !== null,
        glowPhase,
        animTime,
      });

      ctx.restore();
    },
    [],
  );

  // --- Animation loop (drives canvas directly, bypasses React state) ---
  useEffect(() => {
    if (!isVisible) return;

    let start: number | null = null;
    function animate(ts: number) {
      if (start === null) start = ts;
      const elapsed = ts - start;

      if (dataRef.current.isAboveHorizon) {
        glowPhaseRef.current =
          (Math.sin((elapsed / 2000) * Math.PI * 2) + 1) / 2;
      } else {
        glowPhaseRef.current = 0;
      }

      drawCanvasDirect(glowPhaseRef.current, elapsed);
      animRef.current = requestAnimationFrame(animate);
    }
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [isVisible, drawCanvasDirect]);

  // Redraw when data changes
  useEffect(() => {
    if (isVisible) drawCanvasDirect(glowPhaseRef.current, 0);
  }, [
    isVisible,
    skyTrack,
    elevation,
    azimuth,
    isAboveHorizon,
    currentPass,
    drawCanvasDirect,
  ]);

  // --- Formatting helpers ---
  const formatCountdown = (seconds: number): string => {
    if (seconds < 0) return "0:00";
    if (seconds < 3600) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}:${s.toString().padStart(2, "0")}`;
    }
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}:${m.toString().padStart(2, "0")}`;
  };

  const maxElColor = (maxEl: number): string => {
    if (maxEl >= 45) return "text-green-400";
    if (maxEl >= 20) return "text-yellow-400";
    return "text-gray-500";
  };

  // --- Recompute time-sensitive values from `now` ---
  const passTimeToLos = currentPass
    ? Math.max(0, Math.round((currentPass.pass.los.getTime() - now) / 1000))
    : null;

  const passTimeToAos = nextPass
    ? Math.max(0, Math.round((nextPass.pass.aos.getTime() - now) / 1000))
    : null;

  // Position style for the panel
  const posStyle = position
    ? { left: position.x, top: position.y }
    : { right: 12, bottom: 12 };

  // --- Collapsed state: small ISS icon button ---
  if (!isVisible) {
    return (
      <div className="absolute z-20 pointer-events-auto" style={posStyle}>
        <button
          onClick={() => setIsVisible(true)}
          className="w-8 h-8 flex items-center justify-center bg-black/70 backdrop-blur-sm border border-white/10 hover:border-teal-400/50 rounded-lg transition-all"
          title="Show ISS Tracker"
        >
          <svg
            className="w-4 h-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <circle cx="12" cy="12" r="3" strokeWidth={1.5} />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4.5 12H2m20 0h-2.5M12 4.5V2m0 20v-2.5M7.05 7.05 5.636 5.636m12.728 12.728-1.414-1.414M7.05 16.95l-1.414 1.414M18.364 5.636l-1.414 1.414"
            />
          </svg>
        </button>
      </div>
    );
  }

  // --- Drag handle (6-dot grip) ---
  const dragHandle = (
    <div
      onMouseDown={handleDragStart}
      className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-white/10 rounded"
      title="Drag to reposition"
    >
      <svg
        className="w-3 h-3 text-gray-500"
        fill="currentColor"
        viewBox="0 0 24 24"
      >
        <circle cx="5" cy="5" r="2" />
        <circle cx="12" cy="5" r="2" />
        <circle cx="5" cy="12" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="5" cy="19" r="2" />
        <circle cx="12" cy="19" r="2" />
      </svg>
    </div>
  );

  // --- No station fallback ---
  if (!station) {
    return (
      <div
        ref={panelRef}
        className="absolute z-20 pointer-events-auto"
        style={posStyle}
      >
        <div className="relative rounded-lg overflow-hidden bg-black/80 backdrop-blur-md border border-white/10 shadow-lg w-[220px]">
          <div className="flex items-center justify-between px-2.5 py-1.5 bg-black/40 border-b border-white/5">
            {dragHandle}
            <span className="text-[9px] font-medium text-gray-400 uppercase tracking-wider flex-1 ml-1.5">
              ISS Tracker
            </span>
            <button
              onClick={() => setIsVisible(false)}
              className="p-0.5 text-gray-500 hover:text-gray-300"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div className="px-4 py-8 text-center">
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Set your home QTH in Settings to see ISS pass predictions
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --- Full expanded view ---
  return (
    <div
      ref={panelRef}
      className="absolute z-20 pointer-events-auto"
      style={{
        ...posStyle,
        userSelect: isDragging ? "none" : undefined,
      }}
    >
      <div
        className="relative rounded-lg overflow-hidden bg-black/80 backdrop-blur-md border border-white/10 shadow-lg"
        style={{
          boxShadow: isDragging
            ? "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,229,204,0.2)"
            : undefined,
        }}
      >
        {/* Header with drag handle */}
        <div className="flex items-center justify-between px-2.5 py-1.5 bg-black/40 border-b border-white/5">
          {dragHandle}
          <span className="text-[9px] font-medium text-gray-400 uppercase tracking-wider flex-1 ml-1.5">
            ISS Tracker
          </span>
          <button
            onClick={() => setIsVisible(false)}
            className="p-0.5 text-gray-500 hover:text-gray-300"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Polar Chart Canvas */}
        <canvas
          ref={canvasRef}
          className="block"
          style={{ width: CHART_SIZE, height: CHART_SIZE }}
        />

        {/* Info Strip */}
        <div className="px-2.5 py-2 bg-black/40 border-t border-white/5 space-y-0.5 font-mono">
          {/* Line 1: Position */}
          {elevation !== null && azimuth !== null && (
            <div className="text-[10px] text-gray-300">
              El: {Math.round(elevation)}&deg;{"  "}Az: {Math.round(azimuth)}
              &deg; {azimuthToCompass(azimuth)}
            </div>
          )}

          {/* Line 2: Orbital */}
          {iss && (
            <div className="text-[10px] text-gray-400">
              Alt: {Math.round(iss.position.alt)}km{"  "}
              {(iss.position.velocity * 3600).toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
              km/h
            </div>
          )}

          {/* Line 3: Pass Status */}
          <div className="text-[10px]">
            {currentPass && passTimeToLos !== null ? (
              <span className="text-green-400">
                <span className="inline-block mr-1">{"\u25CF"}</span>
                VISIBLE{"  "}
                {formatCountdown(passTimeToLos)} remaining
              </span>
            ) : nextPass && passTimeToAos !== null ? (
              <span className="text-gray-400">
                <span className="inline-block mr-1">{"\u25CB"}</span>
                Next: {formatCountdown(passTimeToAos)}
                {"  "}
                <span>
                  Max El:{" "}
                  <span className={maxElColor(nextPass.maxEl)}>
                    {Math.round(nextPass.maxEl)}&deg;
                  </span>{" "}
                  {nextPass.direction}
                </span>
              </span>
            ) : (
              <span className="text-gray-500">
                <span className="inline-block mr-1">{"\u25CB"}</span>
                No passes in next 24h
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ISSSkyTracker;
