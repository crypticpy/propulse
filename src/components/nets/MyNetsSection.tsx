/**
 * MyNetsSection -- Shows the operator's subscribed nets on their profile.
 * Owner view: full list with subscribe status.
 * Visitor view: read-only list (only nets with showOnProfile=true).
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useNetStore } from "@/stores/netStore";
import type { Net, NetSchedule, NetSubscription } from "@/types/net";
import { NET_TYPE_LABELS, NET_TYPE_COLORS } from "@/types/net";
import { AddToCalendarDropdown } from "@/components/nets/AddToCalendarDropdown";

// ── Schedule Formatting (local fallback) ─────────────────────────────

function formatScheduleText(schedule?: NetSchedule): string {
  if (!schedule) return "No fixed schedule";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  if (schedule.pattern === "weekly" && schedule.dayOfWeek != null)
    return `${days[schedule.dayOfWeek]}s at ${schedule.timeUtc} UTC`;
  if (schedule.pattern === "biweekly" && schedule.dayOfWeek != null)
    return `Biweekly ${days[schedule.dayOfWeek]}s at ${schedule.timeUtc} UTC`;
  if (schedule.pattern === "daily") return `Daily at ${schedule.timeUtc} UTC`;
  if (schedule.pattern === "monthly")
    return schedule.timeUtc ? `Monthly at ${schedule.timeUtc} UTC` : "Monthly";
  if (schedule.pattern === "adhoc") return "Ad-hoc";
  return schedule.timeUtc
    ? `${schedule.pattern} at ${schedule.timeUtc} UTC`
    : schedule.pattern;
}

// ── Props ────────────────────────────────────────────────────────────

interface MyNetsSectionProps {
  /** true for owner's own profile, false for visitor view */
  editable?: boolean;
  /** User ID — unused for now but reserved for future visitor-specific fetching */
  userId?: string;
}

// ── Component ────────────────────────────────────────────────────────

export function MyNetsSection({ editable = false }: MyNetsSectionProps) {
  const subscriptions = useNetStore((s) => s.subscriptions);
  const nets = useNetStore((s) => s.nets);
  const fetchMySubscriptions = useNetStore((s) => s.fetchMySubscriptions);
  const fetchNets = useNetStore((s) => s.fetchNets);

  // Local state to hold resolved net objects for each subscription
  const [resolvedNets, setResolvedNets] = useState<
    { sub: NetSubscription; net: Net }[]
  >([]);

  // Fetch subscriptions on mount for owner view
  useEffect(() => {
    if (editable) {
      void fetchMySubscriptions();
    }
  }, [editable, fetchMySubscriptions]);

  // Also fetch the net directory so we can join subscriptions with net metadata
  useEffect(() => {
    if (subscriptions.length > 0 && nets.length === 0) {
      void fetchNets();
    }
  }, [subscriptions.length, nets.length, fetchNets]);

  // Resolve subscriptions to their matching nets
  useEffect(() => {
    const netMap = new Map(nets.map((n) => [n.id, n]));
    const pairs: { sub: NetSubscription; net: Net }[] = [];
    for (const sub of subscriptions) {
      const net = netMap.get(sub.netId);
      if (net) pairs.push({ sub, net });
    }
    setResolvedNets(pairs);
  }, [subscriptions, nets]);

  // Filter for visitor view — only show nets with showOnProfile=true
  const visibleNets = editable
    ? resolvedNets
    : resolvedNets.filter((r) => r.sub.showOnProfile);

  // ── Empty State ──────────────────────────────────────────────────

  if (visibleNets.length === 0) {
    return (
      <div>
        <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-3">
          My Nets
        </h3>
        <p className="text-gray-500 text-sm italic py-4 text-center">
          {editable ? (
            <>
              No net subscriptions yet.{" "}
              <Link
                to="/nets"
                className="text-plasma-orange hover:text-plasma-orange/80 not-italic"
              >
                Browse nets &rarr;
              </Link>
            </>
          ) : (
            "No public net memberships"
          )}
        </p>
      </div>
    );
  }

  // ── Populated State ──────────────────────────────────────────────

  return (
    <div>
      {/* Section header with count badge */}
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-[10px] uppercase tracking-widest text-gray-500">
          My Nets
        </h3>
        <span className="text-[10px] font-mono bg-white/10 text-gray-400 rounded-full px-1.5 py-0.5 leading-none">
          {visibleNets.length}
        </span>
      </div>

      {/* Net rows */}
      <div className="space-y-2">
        {visibleNets.map(({ net }) => (
          <div key={net.id} className="flex items-center gap-1">
            <Link
              to={`/nets/${net.id}`}
              className="flex items-center gap-3 flex-1 min-w-0 bg-void/30 rounded-xl px-3 py-2.5 border border-white/5 hover:border-white/15 hover:bg-void/50 transition-all group"
            >
              {/* Net name */}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-white truncate block group-hover:text-plasma-orange transition-colors">
                  {net.name}
                </span>
                <span className="text-[11px] text-gray-500 block truncate">
                  {net.frequency} &middot; {net.mode} &middot;{" "}
                  {formatScheduleText(net.schedule)}
                </span>
              </div>

              {/* Type badge */}
              <span
                className={`flex-shrink-0 text-[10px] font-medium rounded-full px-2 py-0.5 leading-tight ${NET_TYPE_COLORS[net.type]}`}
              >
                {NET_TYPE_LABELS[net.type]}
              </span>
            </Link>

            {/* Calendar dropdown (compact icon) */}
            <AddToCalendarDropdown net={net} compact />
          </div>
        ))}
      </div>

      {/* Browse more link for owners */}
      {editable && (
        <div className="mt-3 text-right">
          <Link
            to="/nets"
            className="text-sm text-plasma-orange hover:text-plasma-orange/80 transition-colors"
          >
            Browse nets &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}
