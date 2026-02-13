/**
 * QSOLogStats — Statistics dashboard panel for the QSO log viewer
 *
 * Displays total QSOs, unique callsigns, DXCC, grids, daily rate,
 * and band/mode breakdowns as horizontal bars.
 * Driven by the useQSOStats hook.
 *
 * QSOStatsPopover — Portal-based popover wrapper that renders
 * QSOLogStats anchored below a trigger element.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQSOStats } from "@/hooks/useQSOStats";

// ── Bar Chart Row ───────────────────────────────────────────────────────────

function BarRow({
  label,
  count,
  max,
  color,
}: {
  label: string;
  count: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 font-mono w-12 text-right shrink-0">
        {label}
      </span>
      <div className="flex-1 h-4 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.max(pct, 1)}%`,
            backgroundColor: color ?? "rgb(var(--color-plasma-orange))",
          }}
        />
      </div>
      <span className="text-xs text-gray-500 w-10 text-right shrink-0">
        {count}
      </span>
    </div>
  );
}

// ── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3 text-center">
      <div className="text-2xl font-bold text-white font-mono">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

// ── Band Colors ─────────────────────────────────────────────────────────────

const BAND_COLORS: Record<string, string> = {
  "160m": "#8b5cf6",
  "80m": "#6366f1",
  "60m": "#3b82f6",
  "40m": "#0ea5e9",
  "30m": "#06b6d4",
  "20m": "#10b981",
  "17m": "#22c55e",
  "15m": "#84cc16",
  "12m": "#eab308",
  "10m": "#f59e0b",
  "6m": "#f97316",
  "2m": "#ef4444",
  "70cm": "#ec4899",
  "23cm": "#d946ef",
};

// ── Main Component ──────────────────────────────────────────────────────────

export function QSOLogStats() {
  const { stats, loading, error } = useQSOStats();

  if (error) {
    return <div className="text-alert-red text-sm p-4">{error}</div>;
  }

  if (loading) {
    return (
      <div className="bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl p-4 animate-pulse">
        <div className="h-6 bg-white/5 rounded w-24 mb-4" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-white/5 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // Sort breakdowns by count descending
  const bandEntries = Object.entries(stats.bandBreakdown).sort(
    (a, b) => b[1] - a[1],
  );
  const modeEntries = Object.entries(stats.modeBreakdown).sort(
    (a, b) => b[1] - a[1],
  );
  const maxBand = bandEntries.length > 0 ? bandEntries[0][1] : 0;
  const maxMode = modeEntries.length > 0 ? modeEntries[0][1] : 0;

  return (
    <div className="bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl p-4 space-y-4">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total QSOs" value={stats.totalQsos} />
        <StatCard label="Callsigns" value={stats.uniqueCallsigns} />
        <StatCard label="DXCC" value={stats.uniqueDxcc} />
        <StatCard label="Grids" value={stats.uniqueGrids} />
        <StatCard label="Daily Rate" value={stats.dailyRate} />
      </div>

      {/* Band Breakdown */}
      {bandEntries.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            By Band
          </h4>
          <div className="space-y-1">
            {bandEntries.map(([band, count]) => (
              <BarRow
                key={band}
                label={band}
                count={count}
                max={maxBand}
                color={BAND_COLORS[band]}
              />
            ))}
          </div>
        </div>
      )}

      {/* Mode Breakdown */}
      {modeEntries.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            By Mode
          </h4>
          <div className="space-y-1">
            {modeEntries.map(([mode, count]) => (
              <BarRow key={mode} label={mode} count={count} max={maxMode} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stats Popover ──────────────────────────────────────────────────────────

interface QSOStatsPopoverProps {
  children: React.ReactNode; // Trigger element
}

export function QSOStatsPopover({ children }: QSOStatsPopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        panelRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // Position the popover below the trigger
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 8,
      left: Math.max(8, rect.left - 200),
    });
  }, [open]);

  return (
    <>
      <div ref={triggerRef} onClick={toggle} className="cursor-pointer">
        {children}
      </div>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[9999] w-[420px] max-h-[70vh] overflow-y-auto rounded-2xl bg-void-black/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50 animate-in fade-in slide-in-from-top-2 duration-200"
            style={{ top: position.top, left: position.left }}
          >
            <div className="p-1">
              <QSOLogStats />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
