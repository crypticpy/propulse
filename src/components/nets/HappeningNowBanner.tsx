/**
 * HappeningNowBanner -- Pinned banner at the top of the NetsPage showing
 * currently-live nets.
 *
 * Displays a pulsing red dot with "Happening Now" header, a count badge,
 * and a horizontally scrollable row of compact live net cards (up to 5).
 * Each card shows the net name, frequency, NCS callsign, and a "Join"
 * link to the net's detail page. Returns null when no nets are live.
 */

import { Link } from "react-router-dom";
import type { Net } from "@/types/net";

interface HappeningNowBannerProps {
  liveNets: Array<{ net: Net; ncsCallsign?: string }>;
}

export function HappeningNowBanner({ liveNets }: HappeningNowBannerProps) {
  if (liveNets.length === 0) return null;

  return (
    <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4">
      {/* Header row */}
      <div className="flex items-center gap-2.5 mb-3">
        {/* Pulsing red dot */}
        <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
        <span className="text-sm font-bold text-red-400 uppercase tracking-wider">
          Happening Now
        </span>
        {/* Count badge */}
        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold bg-red-500/20 text-red-400">
          {liveNets.length}
        </span>
      </div>

      {/* Horizontally scrollable live net cards */}
      <div className="flex gap-3 overflow-x-auto pb-1 -mb-1 scrollbar-thin scrollbar-thumb-white/10">
        {liveNets.slice(0, 5).map(({ net, ncsCallsign }) => (
          <Link
            key={net.id}
            to={`/nets/${net.id}`}
            className="flex-shrink-0 w-56 bg-white/[0.03] border border-white/10 rounded-xl p-3 transition-all duration-200 hover:border-red-500/30 hover:bg-white/[0.05] group"
          >
            {/* Net name */}
            <h4 className="text-sm font-semibold text-white truncate mb-1 group-hover:text-red-400 transition-colors">
              {net.name}
            </h4>

            {/* Frequency */}
            <p className="text-xs font-mono text-gray-400 mb-1.5">
              {net.frequency}
            </p>

            {/* NCS callsign + Join label */}
            <div className="flex items-center justify-between">
              {ncsCallsign ? (
                <span className="text-[11px] text-gray-500">
                  NCS:{" "}
                  <span className="font-mono text-gray-400">{ncsCallsign}</span>
                </span>
              ) : (
                <span />
              )}
              <span className="text-[11px] font-semibold text-red-400 group-hover:text-red-300 transition-colors flex items-center gap-1">
                Join
                {/* Arrow right icon */}
                <svg
                  className="w-3 h-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                  />
                </svg>
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
