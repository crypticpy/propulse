import { useEffect, useId, useState, type ReactNode } from "react";
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
  loading: "border-su-line/30 bg-su-line/10 text-su-muted",
  fresh: "text-su-success",
  refreshing: "border-su-info/30 bg-su-info/10 text-su-info",
  stale: "border-su-warning/30 bg-su-warning/10 text-su-warning",
  partial: "border-su-warning/30 bg-su-warning/10 text-su-warning",
  empty: "border-su-line/30 bg-su-line/10 text-su-muted",
  unavailable: "border-su-danger/30 bg-su-danger/10 text-su-danger",
  error: "border-su-danger/30 bg-su-danger/10 text-su-danger",
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
  const noticeId = useId();
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
  // DS-04: stale/partial notices used to render as a banner between the
  // header and the body, pushing the reading down by a variable amount. The
  // notice now sits in the footer, below the reading, so every card's body
  // starts at the same offset. Only the compact key-readings cards — the
  // four NOAA SWPC readings, which must share one anatomy so their charts
  // line up — condense it to a fixed one-line summary and carry the full
  // reason on the chip (title + a visually hidden aria-describedby target).
  // Every other shell (NASA DONKI CME, the NOAA probability window, the
  // history cards) keeps its own source-specific reason visible.
  const noticeText =
    state === "stale"
      ? (staleMessage ?? "This reading is older than expected. Propulse checks for updates automatically.")
      : state === "partial"
        ? (partialMessage ?? "Some sources have not updated yet. The reading below uses the available data.")
        : null;
  const chipNotice = compact ? noticeText : null;
  const footerNotice = noticeText
    ? compact
      ? "Delayed: waiting for fresh NOAA data"
      : noticeText
    : null;

  return (
    <section
      className={`group flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-su-line/40 bg-su-panel/40 ${className}`}
      aria-label={title}
    >
      <header className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 px-4 py-3 ${compact ? "" : "border-b border-su-line/20 sm:px-5"}`}>
        <div className="min-w-0">
          {eyebrow && (
            <p
              className="mb-1 truncate text-xs font-semibold uppercase tracking-[0.12em] text-su-muted"
              title={eyebrow}
            >
              {eyebrow}
            </p>
          )}
          <h2 className="text-sm font-semibold text-su-text sm:text-base" title={title}>
            {title}
          </h2>
          <div className="mt-1 flex items-center flex-wrap gap-x-2 text-xs text-su-muted">
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
                className="min-w-0 truncate rounded text-su-muted underline decoration-su-line/40 underline-offset-2 hover:text-su-text"
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
            title={chipNotice ?? undefined}
            aria-describedby={noticeText ? noticeId : undefined}
          >
            <span aria-hidden="true">{state === "fresh" ? "●" : state === "refreshing" ? "↻" : "◇"}</span>
            {stateLabel[state]}
          </span>
          {chipNotice && (
            <span id={noticeId} className="sr-only">
              {chipNotice}
            </span>
          )}
        </div>
      </header>

      <div className={`min-h-0 flex-1 ${compact ? "px-4 pb-4" : "p-4 sm:p-5"}`}>
        {showFallback ? (
          <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-su-line/40 bg-su-input px-5 text-center">
            {state === "loading" ? (
              <div className="h-2 w-28 overflow-hidden rounded-full bg-su-line/20" aria-label="Loading data">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-su-info/60" />
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-su-text">{message ?? stateLabel[state]}</p>
                <p className="mt-1 max-w-xs text-xs leading-5 text-su-muted">
                  No recent reading is available yet. Propulse checks for updates automatically.
                </p>
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="mt-4 min-h-11 rounded-xl border border-su-line/40 bg-su-input px-4 text-sm text-su-text hover:bg-su-line/20"
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
      {(footerNotice || action) && (
        <div className={`flex items-center gap-2 px-4 pb-3 ${footerNotice ? "justify-between" : "justify-end"}`}>
          {footerNotice && (
            <p id={compact ? undefined : noticeId} className="text-[11px] leading-4 text-su-muted">
              {footerNotice}
            </p>
          )}
          {action}
        </div>
      )}
    </section>
  );
}
