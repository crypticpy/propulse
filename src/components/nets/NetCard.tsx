/**
 * NetCard -- Compact card for the net registry grid.
 *
 * Shows net type badge, name, summary, frequency/mode, next session pill,
 * location badge, subscriber count, and an optional live indicator.
 * Clicking navigates to the net detail page.
 */

import { useNavigate } from "react-router-dom";
import type { Net } from "@/types/net";
import { useSettingsStore } from "@/stores/settingsStore";
import { NetTypeBadge } from "./NetTypeBadge";
import { NetLiveIndicator } from "./NetLiveIndicator";
import { FormalityBadge } from "./FormalityBadge";
import {
  formatSchedule,
  getNextSessionRelative,
} from "@/lib/utils/netSchedule";

interface NetCardProps {
  net: Net;
  isLive?: boolean;
}

/** Resolve country ISO code to display name via Intl.DisplayNames. */
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/** Format a schedule object into a human-readable UTC fallback string. */
function formatScheduleFallback(net: Net): string {
  if (!net.schedule) return "Ad-hoc";
  return formatSchedule(net.schedule);
}

export function NetCard({ net, isLive }: NetCardProps) {
  const navigate = useNavigate();
  const timeFormat = useSettingsStore((s) => s.timeFormat);

  // Next session relative label (e.g., "In 3 hours", "Tue 7:30 PM")
  const nextSession = net.schedule
    ? getNextSessionRelative(net.schedule, timeFormat)
    : null;

  // Location label from country + state/province + region
  const countryName = net.country ? regionNames.of(net.country) : undefined;
  const locationLabel = [countryName, net.stateOrProvince, net.region]
    .filter(Boolean)
    .join(" \u00b7 ");

  return (
    <button
      type="button"
      onClick={() => navigate(`/nets/${net.id}`)}
      className="w-full text-left bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl p-4 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.05] cursor-pointer group"
    >
      {/* Top row: badge + live indicator */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <NetTypeBadge type={net.type} size="sm" />
          {net.formalityLevel && (
            <FormalityBadge level={net.formalityLevel} size="sm" />
          )}
        </div>
        {isLive && <NetLiveIndicator size="sm" />}
      </div>

      {/* Net name */}
      <h3 className="text-sm font-bold text-white truncate mb-1 group-hover:text-plasma-orange transition-colors">
        {net.name}
      </h3>

      {/* Summary line */}
      {net.summary && (
        <p className="text-sm text-gray-300 line-clamp-2 leading-snug mb-1">
          {net.summary}
        </p>
      )}

      {/* Frequency + mode */}
      <p className="text-xs text-gray-400 font-mono mb-2">
        {net.frequency} &middot; {net.mode}
      </p>

      {/* Next session pill + location badge */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        {nextSession ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-nebula-blue/10 text-nebula-blue text-xs">
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {nextSession}
          </span>
        ) : (
          /* UTC schedule fallback when no relative time is available */
          <span className="text-xs text-gray-400">
            {formatScheduleFallback(net)}
          </span>
        )}
        {locationLabel && (
          <span className="text-xs text-gray-400 truncate">
            {locationLabel}
          </span>
        )}
      </div>

      {/* Bottom row: subscriber count + newcomer label */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <div className="flex items-center gap-1.5">
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <span>
            {net.subscriberCount.toLocaleString()} subscriber
            {net.subscriberCount !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Newcomer-friendly indicator */}
        {net.newcomerFriendly && (
          <span className="text-xs text-signal-green">Newcomer Friendly</span>
        )}
      </div>
    </button>
  );
}
