/**
 * Ft8StatsDashboard — Collapsible statistics dashboard for FT8/FT4 decodes.
 *
 * Shows summary stat cards (countries, grids, best DX) and a Canvas-based
 * sparkline of decodes-per-cycle for the last 20 cycles.
 */

import { useRef, useEffect, useState, useCallback } from "react";
import type { Ft8SessionStats } from "@/stores/ft8SessionStore";

interface Ft8StatsDashboardProps {
  stats: Ft8SessionStats;
  /** Last cycle decode counts for sparkline (newest first, max 20) */
  cycleCounts: number[];
}

export function Ft8StatsDashboard({
  stats,
  cycleCounts,
}: Ft8StatsDashboardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-t border-white/[0.06]">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-wider text-white/40 hover:text-white/60"
      >
        <span>Session Stats</span>
        <span className="text-[9px]">{expanded ? "\u25B2" : "\u25BC"}</span>
      </button>

      {expanded && (
        <div className="space-y-2 px-3 pb-3">
          {/* Stat cards grid */}
          <div className="grid grid-cols-2 gap-1.5">
            <BigStatCard
              label="Countries"
              value={stats.uniqueCountries}
              color="text-cosmic-cyan"
            />
            <BigStatCard
              label="Grids"
              value={stats.uniqueGrids}
              color="text-aurora-purple"
            />
            <BigStatCard
              label="Callsigns"
              value={stats.uniqueCallsigns}
              color="text-signal-green"
            />
            <BigStatCard
              label="QSOs"
              value={stats.qsosCompleted}
              color="text-plasma-orange"
            />
          </div>

          {/* Best DX */}
          {stats.bestDxKm > 0 && (
            <div className="rounded bg-white/[0.03] px-2 py-1.5 text-center">
              <div className="text-[9px] uppercase tracking-wider text-white/30">
                Best DX
              </div>
              <div className="font-mono text-[13px] font-semibold tabular-nums text-caution-amber">
                {stats.bestDxCallsign}
              </div>
              <div className="font-mono text-[11px] tabular-nums text-white/50">
                {stats.bestDxKm.toLocaleString()} km
              </div>
            </div>
          )}

          {/* Decodes-per-cycle sparkline */}
          {cycleCounts.length > 1 && (
            <div>
              <div className="mb-1 text-[9px] uppercase tracking-wider text-white/30">
                Decodes / Cycle
              </div>
              <DecodeSparkline data={cycleCounts} />
            </div>
          )}

          {/* Session time */}
          {stats.sessionStartedAt && (
            <div className="text-center text-[9px] text-white/25">
              Session started{" "}
              {new Date(stats.sessionStartedAt).toLocaleTimeString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function BigStatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded bg-white/[0.03] px-2 py-1.5 text-center">
      <div className={`font-mono text-[16px] font-bold tabular-nums ${color}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-white/30">
        {label}
      </div>
    </div>
  );
}

function DecodeSparkline({ data }: { data: number[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const WIDTH = 240;
  const HEIGHT = 40;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Scale for device pixel ratio
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    if (data.length < 2) return;

    const maxVal = Math.max(...data, 1);
    const stepX = WIDTH / (data.length - 1);
    const padding = 2;
    const usableHeight = HEIGHT - padding * 2;

    // Draw fill
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT);
    data.forEach((v, i) => {
      const x = i * stepX;
      const y = padding + usableHeight - (v / maxVal) * usableHeight;
      if (i === 0) ctx.lineTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo((data.length - 1) * stepX, HEIGHT);
    ctx.closePath();
    ctx.fillStyle = "rgba(0, 235, 255, 0.08)";
    ctx.fill();

    // Draw line
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = i * stepX;
      const y = padding + usableHeight - (v / maxVal) * usableHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "rgba(0, 235, 255, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();
  }, [data]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: WIDTH, height: HEIGHT }}
      className="w-full rounded bg-white/[0.02]"
    />
  );
}
