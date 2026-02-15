/**
 * HealthStatusIndicator - Compact system health status indicator
 *
 * Shows a colored dot reflecting overall system health with an expandable
 * dropdown panel listing individual service statuses.
 *
 * Collapsed: colored dot + short label ("Systems OK" / "Degraded" / "Error")
 * Expanded:  dropdown with bridge status, per-service health, and update times
 */

import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useHealthMonitor } from "@/hooks/useHealthMonitor";
import type { ServiceStatus, ServiceHealth } from "@/hooks/useHealthMonitor";
// DataSourceId type is available via ServiceHealth.sourceId
// import kept for documentation: type { DataSourceId } from "@/lib/dataSourceRegistry";
import { getTimeAgo } from "@/lib/utils/time";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dotColorClass(status: ServiceStatus): string {
  switch (status) {
    case "healthy":
      return "bg-signal-green";
    case "degraded":
      return "bg-caution-amber";
    case "error":
      return "bg-alert-red";
    case "loading":
      return "bg-gray-500 animate-pulse";
    case "idle":
      return "bg-gray-600";
  }
}

function overallDotClass(overall: "green" | "yellow" | "red"): string {
  switch (overall) {
    case "green":
      return "bg-signal-green";
    case "yellow":
      return "bg-caution-amber";
    case "red":
      return "bg-alert-red";
  }
}

function overallLabel(overall: "green" | "yellow" | "red"): string {
  switch (overall) {
    case "green":
      return "Systems OK";
    case "yellow":
      return "Degraded";
    case "red":
      return "Error";
  }
}

function overallTextClass(overall: "green" | "yellow" | "red"): string {
  switch (overall) {
    case "green":
      return "text-signal-green";
    case "yellow":
      return "text-caution-amber";
    case "red":
      return "text-alert-red";
  }
}

function bridgeDotClass(state: string): string {
  switch (state) {
    case "connected":
      return "bg-signal-green";
    case "connecting":
      return "bg-plasma-orange animate-pulse";
    case "disconnected":
      return "bg-gray-500";
    case "error":
      return "bg-alert-red";
    default:
      return "bg-gray-600";
  }
}

function bridgeLabel(
  state: string,
  reconnectIn: number | null,
  reconnectCount: number,
): string {
  switch (state) {
    case "connected":
      return "Connected";
    case "connecting":
      return reconnectCount > 0
        ? `Reconnecting (attempt ${reconnectCount})...`
        : "Connecting...";
    case "disconnected":
      if (reconnectIn != null && reconnectIn > 0) {
        return `Retry in ${reconnectIn}s`;
      }
      return "Disconnected";
    case "error":
      return "Error";
    default:
      return "Unknown";
  }
}

function serviceDetail(svc: ServiceHealth): string {
  if (svc.status === "loading") return "Loading...";
  if (svc.status === "idle") return "Not started";
  if (svc.status === "error") return svc.errorMessage ?? "Error";
  if (svc.lastUpdated != null) {
    return `Updated ${getTimeAgo(new Date(svc.lastUpdated))}`;
  }
  return "No data";
}

function groupByProvider(
  services: ServiceHealth[],
): Map<string, ServiceHealth[]> {
  const groups = new Map<string, ServiceHealth[]>();
  for (const svc of services) {
    const key = svc.provider ?? "Other";
    const arr = groups.get(key) ?? [];
    arr.push(svc);
    groups.set(key, arr);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HealthStatusIndicator(): JSX.Element {
  const health = useHealthMonitor();
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!expanded) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        panelRef.current &&
        triggerRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setExpanded(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [expanded]);

  // Close on Escape
  useEffect(() => {
    if (!expanded) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setExpanded(false);
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [expanded]);

  const hasErrors = health.overall === "red";

  return (
    <div className="relative inline-flex">
      {/* Collapsed trigger */}
      <button
        ref={triggerRef}
        onClick={() => setExpanded((prev) => !prev)}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded
                   hover:bg-white/5 transition-colors cursor-pointer
                   focus:outline-none focus:ring-1 focus:ring-white/20"
        aria-label={`System health: ${overallLabel(health.overall)}`}
        aria-expanded={expanded}
        type="button"
      >
        {/* Dot */}
        <span
          className={`
            w-2 h-2 rounded-full shrink-0
            ${overallDotClass(health.overall)}
            ${hasErrors ? "animate-pulse" : ""}
            ${health.overall === "green" ? "shadow-[0_0_6px_theme(colors.signal-green)]" : ""}
          `}
          aria-hidden="true"
        />
        <span
          className={`text-xs font-medium ${overallTextClass(health.overall)}`}
        >
          {overallLabel(health.overall)}
        </span>
      </button>

      {/* Expanded dropdown */}
      {expanded && (
        <div
          ref={panelRef}
          className="absolute top-full right-0 mt-1 z-50 w-[min(280px,90vw)]
                     bg-void-black/95 backdrop-blur-md
                     border border-white/10 rounded-xl shadow-2xl
                     animate-in fade-in slide-in-from-top-1"
          role="dialog"
          aria-label="System health details"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-white/10">
            <Link
              to="/health"
              onClick={() => setExpanded(false)}
              className="text-xs font-semibold text-gray-200 hover:text-plasma-orange transition-colors flex items-center gap-1"
            >
              System Health
              <svg
                className="w-3 h-3 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
            <button
              onClick={() => setExpanded(false)}
              className="p-0.5 rounded hover:bg-white/10 transition-colors text-gray-500 hover:text-gray-300"
              aria-label="Close health panel"
              type="button"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
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

          <div className="px-3 py-2 space-y-3">
            {/* Bridge section */}
            <div>
              <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                Bridge
              </span>
              <Link
                to="/bridge"
                onClick={() => setExpanded(false)}
                className="flex items-center gap-2 mt-1 -mx-1 px-1 py-0.5 rounded-md hover:bg-white/5 transition-colors group"
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${bridgeDotClass(health.bridgeState)}`}
                  aria-hidden="true"
                />
                <span className="text-xs text-gray-300 group-hover:text-gray-100 transition-colors">
                  Bridge:{" "}
                  {bridgeLabel(
                    health.bridgeState,
                    health.bridgeReconnectIn,
                    health.bridgeReconnectCount,
                  )}
                </span>
                <svg
                  className="w-3 h-3 text-gray-600 group-hover:text-gray-400 ml-auto transition-colors"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>
              {health.bridgeError && health.bridgeState !== "connected" && (
                <p
                  className="mt-1 text-[10px] text-gray-500 leading-tight line-clamp-2"
                  title={health.bridgeError}
                >
                  {health.bridgeError}
                </p>
              )}
              {(health.bridgeState === "disconnected" ||
                health.bridgeState === "error") && (
                <Link
                  to="/setup"
                  onClick={() => setExpanded(false)}
                  className="inline-flex items-center gap-1 mt-1.5 text-[10px] text-plasma-orange hover:underline"
                >
                  Setup Guide →
                </Link>
              )}
            </div>

            {/* API Services section */}
            <div>
              <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                API Services
              </span>
              <div className="mt-1 space-y-1.5 max-h-[280px] overflow-y-auto">
                {health.activeErrors > 0
                  ? /* Grouped by provider when errors are present */
                    Array.from(groupByProvider(health.services)).map(
                      ([provider, svcs]) => (
                        <div key={provider}>
                          <span className="text-[9px] uppercase tracking-wider text-gray-600 font-medium">
                            {provider}
                          </span>
                          <div className="mt-0.5 space-y-1">
                            {svcs.map((svc) => (
                              <div key={svc.name}>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`w-2 h-2 rounded-full shrink-0 ${dotColorClass(svc.status)}`}
                                    aria-hidden="true"
                                  />
                                  <span className="text-xs text-gray-300 min-w-0 truncate flex-1">
                                    {svc.name}
                                    {svc.isUpstream && (
                                      <span className="text-[9px] text-gray-500 bg-white/5 px-1 py-0.5 rounded ml-1">
                                        upstream
                                      </span>
                                    )}
                                  </span>
                                  <span className="text-[10px] text-gray-500 whitespace-nowrap">
                                    {serviceDetail(svc)}
                                  </span>
                                </div>
                                {svc.status === "error" && svc.userMessage && (
                                  <p
                                    className="ml-4 mt-0.5 text-[10px] text-gray-500 leading-tight line-clamp-2"
                                    title={svc.userMessage}
                                  >
                                    {svc.userMessage}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ),
                    )
                  : /* Flat list when no errors */
                    health.services.map((svc) => (
                      <div key={svc.name} className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${dotColorClass(svc.status)}`}
                          aria-hidden="true"
                        />
                        <span className="text-xs text-gray-300 min-w-0 truncate flex-1">
                          {svc.name}
                        </span>
                        <span className="text-[10px] text-gray-500 whitespace-nowrap">
                          {serviceDetail(svc)}
                        </span>
                      </div>
                    ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-white/10 flex items-center justify-between">
            <span className="text-[10px] text-gray-600">
              Refreshes every 30s
            </span>
            <Link
              to="/health"
              onClick={() => setExpanded(false)}
              className="text-[10px] text-gray-500 hover:text-plasma-orange transition-colors"
            >
              View full dashboard
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default HealthStatusIndicator;
