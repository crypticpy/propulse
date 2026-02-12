/**
 * SmartNetFinder — "Find Nets For Me" wizard.
 *
 * Cross-references the operator's profile (license class, country) and
 * shack (owned radios -> bands) with the net directory to surface nets
 * the user can actually operate on with their current equipment.
 *
 * Matching priority:
 *   1. Net band is in the user's owned-radio bands
 *   2. If license info is available, the band must be permitted
 *   3. Newcomer-friendly nets sort first, then by subscriber count desc
 */

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useProfileStore } from "@/stores/profileStore";
import { useUserRadios } from "@/stores/shackStore";
import { useNetStore } from "@/stores/netStore";
import { canOperateBand } from "@/lib/data/licensePrivileges";
import type { Net } from "@/types/net";
import type { BandId } from "@/types/user";

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_MATCHES = 10;

// ── Component ───────────────────────────────────────────────────────────────

export function SmartNetFinder() {
  const license = useProfileStore((s) => s.license);
  const radios = useUserRadios();
  const nets = useNetStore((s) => s.nets);

  // Derive unique bands from all owned radios
  const ownedBands = useMemo<Set<string>>(() => {
    const bands = new Set<string>();
    for (const { equipment } of radios) {
      if (equipment?.bands) {
        for (const b of equipment.bands) bands.add(b);
      }
    }
    return bands;
  }, [radios]);

  const hasProfile = ownedBands.size > 0;

  // Compute matched nets
  const matches = useMemo<Net[]>(() => {
    if (!hasProfile) return [];

    return nets
      .filter((net) => {
        // 1. Net band must be in user's owned bands
        if (!ownedBands.has(net.band)) return false;

        // 2. If license info is available, check privilege
        if (license?.country && license?.class) {
          if (
            !canOperateBand(license.country, license.class, net.band as BandId)
          ) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        // Newcomer-friendly first
        if (a.newcomerFriendly !== b.newcomerFriendly) {
          return a.newcomerFriendly ? -1 : 1;
        }
        // Then by subscriber count descending
        return b.subscriberCount - a.subscriberCount;
      })
      .slice(0, MAX_MATCHES);
  }, [nets, ownedBands, hasProfile, license]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="bg-panel/30 border border-white/5 rounded-2xl p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        {/* Sparkle icon */}
        <svg
          className="w-4 h-4 text-plasma-orange shrink-0"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M8 0L9.41 5.18L14.59 5.18L10.59 8.82L12 14L8 11.18L4 14L5.41 8.82L1.41 5.18L6.59 5.18L8 0Z"
            fill="currentColor"
          />
        </svg>
        <h3 className="text-sm font-semibold text-white">Nets For You</h3>
      </div>
      <p className="text-gray-500 text-xs mb-3">
        Based on your equipment and license
      </p>

      {/* No profile / no radios CTA */}
      {!hasProfile && (
        <p className="text-xs text-gray-400 leading-relaxed">
          Set up your{" "}
          <Link
            to="/profile"
            className="text-plasma-orange hover:underline font-medium"
          >
            profile
          </Link>{" "}
          and{" "}
          <Link
            to="/shack"
            className="text-plasma-orange hover:underline font-medium"
          >
            shack
          </Link>{" "}
          to get personalized net recommendations.
        </p>
      )}

      {/* Matched nets list */}
      {hasProfile && matches.length > 0 && (
        <ul className="space-y-0">
          {matches.map((net) => (
            <li
              key={net.id}
              className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0"
            >
              <Link
                to={`/nets/${net.id}`}
                className="text-sm text-white hover:text-plasma-orange transition-colors truncate font-medium"
              >
                {net.name}
              </Link>

              {/* Band pill */}
              <span className="shrink-0 bg-white/10 text-gray-300 text-[10px] rounded-full px-2 py-0.5 uppercase tracking-wide">
                {net.band}
              </span>

              {/* Mode */}
              <span className="shrink-0 text-gray-500 text-[10px] uppercase tracking-wide">
                {net.mode}
              </span>

              {/* Newcomer-friendly badge */}
              {net.newcomerFriendly && (
                <span className="shrink-0 bg-signal-green/15 text-signal-green text-[10px] rounded-full px-2 py-0.5">
                  Newcomer OK
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* No matches */}
      {hasProfile && matches.length === 0 && (
        <p className="text-xs text-gray-500">
          No matching nets found for your setup.
        </p>
      )}
    </div>
  );
}
