/**
 * NetCard -- Compact card for the net registry grid.
 *
 * Shows net type badge, name, frequency/mode, schedule text, subscriber count,
 * and an optional live indicator. Clicking navigates to the net detail page.
 */

import { useNavigate } from "react-router-dom";
import type { Net } from "@/types/net";
import { NetTypeBadge } from "./NetTypeBadge";
import { NetLiveIndicator } from "./NetLiveIndicator";
import { FormalityBadge } from "./FormalityBadge";

interface NetCardProps {
  net: Net;
  isLive?: boolean;
}

/** Format a schedule object into a human-readable string. */
function formatSchedule(net: Net): string {
  if (!net.schedule) return "Ad-hoc";

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const { pattern, dayOfWeek, timeUtc } = net.schedule;

  const parts: string[] = [];

  if (pattern === "daily") {
    parts.push("Daily");
  } else if (
    (pattern === "weekly" || pattern === "biweekly") &&
    dayOfWeek !== undefined
  ) {
    parts.push(pattern === "biweekly" ? "Biweekly" : "Every");
    parts.push(days[dayOfWeek] ?? "");
  } else if (pattern === "monthly") {
    parts.push("Monthly");
  } else {
    parts.push("Ad-hoc");
  }

  if (timeUtc) {
    parts.push(`at ${timeUtc} UTC`);
  }

  return parts.filter(Boolean).join(" ");
}

export function NetCard({ net, isLive }: NetCardProps) {
  const navigate = useNavigate();

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

      {/* Frequency + mode */}
      <p className="text-xs text-gray-400 font-mono mb-2">
        {net.frequency} &middot; {net.mode}
      </p>

      {/* Schedule */}
      <p className="text-[11px] text-gray-500 mb-3">{formatSchedule(net)}</p>

      {/* Bottom row: subscriber count */}
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
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
        <span className="text-[10px] text-signal-green mt-1 inline-block">
          Newcomer Friendly
        </span>
      )}
    </button>
  );
}
