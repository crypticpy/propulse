import { useEffect, useState, type ReactNode } from "react";
import type { SolarWidgetState } from "@/lib/solar/contracts";
import { recordSolarTelemetry } from "@/lib/solar/telemetry";

const stateLabel: Record<SolarWidgetState, string> = {
  loading: "Loading",
  fresh: "Current",
  refreshing: "Refreshing",
  stale: "Stale",
  partial: "Partial",
  empty: "No current items",
  unavailable: "Unavailable",
  error: "Error",
};

const stateStyle: Record<SolarWidgetState, string> = {
  loading: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  fresh: "text-emerald-300",
  refreshing: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
  stale: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  partial: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  empty: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  unavailable: "border-rose-400/30 bg-rose-400/10 text-rose-200",
  error: "border-rose-400/30 bg-rose-400/10 text-rose-200",
};

function formatAge(milliseconds: number): string {
  if (milliseconds < 60_000) return "just now";
  if (milliseconds < 60 * 60_000) return `${Math.floor(milliseconds / 60_000)}m ago`;
  if (milliseconds < 24 * 60 * 60_000) return `${Math.floor(milliseconds / 3_600_000)}h ago`;
  return `${Math.floor(milliseconds / 86_400_000)}d ago`;
}

export interface WidgetShellProps {
  title: string;
  eyebrow?: string;
  state: SolarWidgetState;
  observedAt?: string | null;
  timestampLabel?: "Observed" | "Issued" | "Oldest input" | "Checked";
  compact?: boolean;
  provider?: string;
  sourceUrl?: string;
  hasData?: boolean;
  message?: string;
  staleMessage?: string;
  partialMessage?: string;
  onRetry?: () => void;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  telemetryId?: string;
}

export function WidgetShell({
  title,
  eyebrow,
  state,
  observedAt,
  timestampLabel = "Observed",
  compact = false,
  provider,
  sourceUrl,
  hasData = true,
  message,
  staleMessage,
  partialMessage,
  onRetry,
  action,
  children,
  className = "",
  telemetryId,
}: WidgetShellProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    recordSolarTelemetry({
      event: "solar_widget_state",
      widgetId: telemetryId ?? title,
      state,
    });
  }, [state, telemetryId, title]);
  const parsed = observedAt ? Date.parse(observedAt) : NaN;
  const age = Number.isFinite(parsed) ? Math.max(0, Date.now() - parsed) : null;
  const showFallback = !hasData && ["loading", "error", "unavailable"].includes(state);

  return (
    <section
      className={`group flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] ${className}`}
      aria-label={title}
    >
      <header className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 px-4 py-3 ${compact ? "" : "border-b border-white/[0.07] sm:px-5"}`}>
        <div className="min-w-0">
          {eyebrow && (
            <p
              className="mb-1 truncate text-xs font-semibold uppercase tracking-[0.12em] text-slate-400"
              title={eyebrow}
            >
              {eyebrow}
            </p>
          )}
          <h2 className="text-sm font-semibold text-slate-100 sm:text-base" title={title}>
            {title}
          </h2>
          <div className="mt-1 flex items-center flex-wrap gap-x-2 text-xs text-slate-400">
            {age !== null && (
              <time
                className="shrink-0"
                dateTime={observedAt ?? undefined}
                title={new Date(parsed).toISOString()}
              >
                {timestampLabel} {formatAge(age)}
              </time>
            )}
            {provider && sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 truncate rounded text-slate-400 underline decoration-white/20 underline-offset-2 hover:text-slate-300"
                title={provider}
              >
                {provider}
              </a>
            ) : provider ? (
              <span className="min-w-0 truncate" title={provider}>{provider}</span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${stateStyle[state]}`}
            role="status"
            aria-live="polite"
          >
            <span aria-hidden="true">{state === "fresh" ? "●" : state === "refreshing" ? "↻" : "◇"}</span>
            {stateLabel[state]}
          </span>
        </div>
      </header>

      {state === "stale" && (
        <div className="border-b border-amber-300/10 bg-amber-300/[0.06] px-4 py-2 text-xs leading-5 text-amber-100/80 sm:px-5">
          {staleMessage ??
            "This reading is older than expected. Propulse checks for updates automatically."}
        </div>
      )}
      {state === "partial" && (
        <div className="border-b border-amber-300/10 bg-amber-300/[0.06] px-4 py-2 text-xs leading-5 text-amber-100/80 sm:px-5">
          {partialMessage ??
            "Some sources have not updated yet. The reading below uses the available data."}
        </div>
      )}

      <div className={`min-h-0 flex-1 ${compact ? "px-4 pb-4" : "p-4 sm:p-5"}`}>
        {showFallback ? (
          <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/10 px-5 text-center">
            {state === "loading" ? (
              <div className="h-2 w-28 overflow-hidden rounded-full bg-white/10" aria-label="Loading data">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-cyan-300/60" />
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-200">{message ?? stateLabel[state]}</p>
                <p className="mt-1 max-w-xs text-xs leading-5 text-slate-400">
                  No recent reading is available yet. Propulse checks for updates automatically.
                </p>
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="mt-4 min-h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-slate-200 hover:bg-white/10"
                  >
                    Try again
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          children
        )}
      </div>
      {action && <div className="flex justify-end px-4 pb-3">{action}</div>}
    </section>
  );
}
