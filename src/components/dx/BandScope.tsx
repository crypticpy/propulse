/**
 * BandScope Component (C23)
 *
 * Simplified activity waterfall/scope from WSJT-X decode data.
 * Frequency domain display showing decode positions across the passband.
 * Each decode is a dot at its audio frequency offset, colored by SNR.
 */

import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { useWSJTXStore, type WSJTXDecode } from "@/stores/wsjtxStore";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Passband range (Hz) - typical FT8 range */
const PASSBAND_LOW = 100;
const PASSBAND_HIGH = 3000;
const PASSBAND_RANGE = PASSBAND_HIGH - PASSBAND_LOW;

/** Time window to display (seconds) */
const TIME_WINDOW_S = 120;

/** Refresh interval (ms) */
const REFRESH_MS = 500;

// ---------------------------------------------------------------------------
// SNR-based coloring
// ---------------------------------------------------------------------------

function snrToColor(snr: number): string {
  if (snr >= 0) return "#22c55e"; // signal-green
  if (snr >= -5) return "#00d4ff"; // cosmic-cyan
  if (snr >= -10) return "#eab308"; // caution-amber
  if (snr >= -15) return "#ff6b35"; // plasma-orange
  if (snr >= -20) return "#ef4444"; // alert-red
  return "#6b7280"; // gray
}

function snrToRadius(snr: number): number {
  if (snr >= 0) return 4;
  if (snr >= -10) return 3;
  if (snr >= -20) return 2.5;
  return 2;
}

// ---------------------------------------------------------------------------
// Canvas drawing
// ---------------------------------------------------------------------------

function drawScope(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  decodes: WSJTXDecode[],
  txDF: number | null,
  rxDF: number | null,
  hoveredDecode: WSJTXDecode | null,
) {
  const now = Date.now();
  const cutoffMs = now - TIME_WINDOW_S * 1000;

  // Background
  ctx.fillStyle = "#0a0f1a";
  ctx.fillRect(0, 0, width, height);

  // Grid
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;

  // Frequency grid lines (every 500 Hz)
  for (let f = 500; f < PASSBAND_HIGH; f += 500) {
    const x = ((f - PASSBAND_LOW) / PASSBAND_RANGE) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${f}`, x, height - 4);
  }

  // Time grid lines (every 30s)
  for (let t = 0; t < TIME_WINDOW_S; t += 30) {
    const y = (1 - t / TIME_WINDOW_S) * height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // TX/RX markers
  if (txDF != null) {
    const x = ((txDF - PASSBAND_LOW) / PASSBAND_RANGE) * width;
    ctx.strokeStyle = "rgba(239, 68, 68, 0.5)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.fillText("TX", x, 12);
  }

  if (rxDF != null) {
    const x = ((rxDF - PASSBAND_LOW) / PASSBAND_RANGE) * width;
    ctx.strokeStyle = "rgba(0, 212, 255, 0.5)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#00d4ff";
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.fillText("RX", x, 12);
  }

  // Decode dots
  for (const decode of decodes) {
    if (decode.receivedAt < cutoffMs) continue;

    const age = (now - decode.receivedAt) / 1000; // seconds
    const x = ((decode.deltaFrequency - PASSBAND_LOW) / PASSBAND_RANGE) * width;
    const y = (1 - (TIME_WINDOW_S - age) / TIME_WINDOW_S) * height;

    if (x < 0 || x > width || y < 0 || y > height) continue;

    const opacity = Math.max(0.3, 1 - age / TIME_WINDOW_S);
    const color = snrToColor(decode.snr);
    const radius = snrToRadius(decode.snr);

    // Glow
    ctx.globalAlpha = opacity * 0.3;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Dot
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // New decode highlight
    if (decode.isNew && age < 15) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = opacity * 0.6;
      ctx.beginPath();
      ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  // Hovered decode label
  if (hoveredDecode && hoveredDecode.receivedAt >= cutoffMs) {
    const age = (now - hoveredDecode.receivedAt) / 1000;
    const x =
      ((hoveredDecode.deltaFrequency - PASSBAND_LOW) / PASSBAND_RANGE) * width;
    const y = (1 - (TIME_WINDOW_S - age) / TIME_WINDOW_S) * height;

    const label = hoveredDecode.callsign
      ? `${hoveredDecode.callsign} (${hoveredDecode.snr}dB)`
      : `${hoveredDecode.snr}dB`;

    ctx.font = "bold 10px monospace";
    const tw = ctx.measureText(label).width + 8;
    const lx = Math.min(x + 8, width - tw - 4);
    const ly = Math.max(y - 16, 14);

    ctx.fillStyle = "rgba(10, 15, 26, 0.9)";
    ctx.strokeStyle = snrToColor(hoveredDecode.snr);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(lx, ly - 10, tw, 16, 3);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.fillText(label, lx + 4, ly + 2);
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface BandScopeProps {
  className?: string;
}

export function BandScope({ className = "" }: BandScopeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredDecode, setHoveredDecode] = useState<WSJTXDecode | null>(null);

  const decodes = useWSJTXStore((s) => s.decodes);
  const status = useWSJTXStore((s) => s.status);
  const connected = useWSJTXStore((s) => s.connected);

  const txDF = status?.txDF ?? null;
  const rxDF = status?.rxDF ?? null;

  // Recent decodes within time window
  const recentDecodes = useMemo(() => {
    const cutoff = Date.now() - TIME_WINDOW_S * 1000;
    return decodes.filter((d) => d.receivedAt >= cutoff);
  }, [decodes]);

  // Handle mouse move for hover detection
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const now = Date.now();
      const cutoffMs = now - TIME_WINDOW_S * 1000;

      let closest: WSJTXDecode | null = null;
      let closestDist = 20; // pixel threshold

      for (const decode of recentDecodes) {
        if (decode.receivedAt < cutoffMs) continue;
        const age = (now - decode.receivedAt) / 1000;
        const x =
          ((decode.deltaFrequency - PASSBAND_LOW) / PASSBAND_RANGE) *
          canvas.width;
        const y = (1 - (TIME_WINDOW_S - age) / TIME_WINDOW_S) * canvas.height;
        const dist = Math.hypot(mx - x, my - y);
        if (dist < closestDist) {
          closestDist = dist;
          closest = decode;
        }
      }

      setHoveredDecode(closest);
    },
    [recentDecodes],
  );

  // Canvas rendering loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number | undefined;

    const render = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      drawScope(ctx, w, h, recentDecodes, txDF, rxDF, hoveredDecode);
    };

    // Initial render
    render();

    // Periodic refresh
    const interval = setInterval(render, REFRESH_MS);

    return () => {
      clearInterval(interval);
      if (animId) cancelAnimationFrame(animId);
    };
  }, [recentDecodes, txDF, rxDF, hoveredDecode]);

  if (!connected) {
    return (
      <div
        className={`rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md p-4 ${className}`}
      >
        <h2 className="font-sans text-lg font-semibold text-white tracking-wide mb-2">
          Band Scope
        </h2>
        <div className="text-center py-8 text-gray-500 text-sm">
          Connect WSJT-X via bridge to see decode waterfall.
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
        <h2 className="font-sans text-sm font-semibold text-white uppercase tracking-wide">
          Band Scope
        </h2>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-gray-400">{recentDecodes.length} decodes</span>
          {status && (
            <span className="font-mono text-cosmic-cyan">
              {(status.frequency / 1_000_000).toFixed(3)} MHz {status.mode}
            </span>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="h-[200px] relative">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredDecode(null)}
        />
      </div>

      {/* SNR Legend */}
      <div className="flex items-center justify-center gap-3 px-4 py-1.5 border-t border-white/10 text-[9px]">
        {[
          { label: ">0dB", color: "#22c55e" },
          { label: "-5dB", color: "#00d4ff" },
          { label: "-10dB", color: "#eab308" },
          { label: "-15dB", color: "#ff6b35" },
          { label: "-20dB", color: "#ef4444" },
          { label: "<-20", color: "#6b7280" },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-gray-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
