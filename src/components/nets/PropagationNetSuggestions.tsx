/**
 * PropagationNetSuggestions — "Nets You Can Hear Right Now"
 *
 * Cross-references current propagation conditions (Solar Flux Index) with
 * the net directory to surface nets on bands that are currently "open".
 *
 * Heuristic (simplified — no complex ionospheric model):
 *   SFI > 150  → 10m, 12m, 15m, 17m, 20m
 *   SFI > 100  → 15m, 17m, 20m, 30m, 40m
 *   SFI > 70   → 20m, 30m, 40m, 80m
 *   SFI <= 70  → 40m, 80m, 160m
 *
 * VHF/UHF bands (2m, 70cm, 23cm, 6m) are always treated as "open"
 * (line-of-sight propagation, not dependent on ionospheric conditions).
 */

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useNetStore } from "@/stores/netStore";
import { useSolarFlux } from "@/hooks/useSolarData";
import type { Net } from "@/types/net";

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_SUGGESTIONS = 8;

/** VHF/UHF bands that are always "open" (line-of-sight) */
const VHF_UHF_BANDS = new Set(["2m", "70cm", "23cm", "6m"]);

/** SFI-based HF band openness thresholds (checked in descending order) */
const SFI_THRESHOLDS: { minSfi: number; bands: string[] }[] = [
  { minSfi: 151, bands: ["10m", "12m", "15m", "17m", "20m"] },
  { minSfi: 101, bands: ["15m", "17m", "20m", "30m", "40m"] },
  { minSfi: 71, bands: ["20m", "30m", "40m", "80m"] },
  { minSfi: 0, bands: ["40m", "80m", "160m"] },
];

/**
 * Determine which HF bands are "open" given a solar flux index value.
 */
function getOpenHfBands(sfi: number): Set<string> {
  for (const threshold of SFI_THRESHOLDS) {
    if (sfi >= threshold.minSfi) {
      return new Set(threshold.bands);
    }
  }
  // Fallback (should never reach here given minSfi: 0 above)
  return new Set(["40m", "80m", "160m"]);
}

// ── Component ───────────────────────────────────────────────────────────────

export function PropagationNetSuggestions() {
  const nets = useNetStore((s) => s.nets);
  const { data: fluxData } = useSolarFlux();

  // Extract the latest SFI value from the solar flux data array
  const sfi = useMemo<number | null>(() => {
    if (!fluxData || fluxData.length === 0) return null;
    const latest = fluxData[fluxData.length - 1];
    return latest.flux ?? null;
  }, [fluxData]);

  // Compute open HF bands + always-open VHF/UHF
  const openBands = useMemo<Set<string>>(() => {
    if (sfi === null) return new Set<string>();
    return getOpenHfBands(sfi);
  }, [sfi]);

  // Labels for the "open bands" pill row (HF only — VHF/UHF are always listed)
  const openBandLabels = useMemo<string[]>(() => {
    return Array.from(openBands).sort((a, b) => {
      // Sort by wavelength descending (160m -> 10m)
      const numA = parseInt(a, 10) || 0;
      const numB = parseInt(b, 10) || 0;
      return numB - numA;
    });
  }, [openBands]);

  // Filter nets to those on open bands or VHF/UHF
  const suggestions = useMemo<Net[]>(() => {
    if (sfi === null) return [];

    return nets
      .filter((net) => {
        // VHF/UHF nets always pass
        if (VHF_UHF_BANDS.has(net.band)) return true;
        // HF nets must be on an open band
        return openBands.has(net.band);
      })
      .sort((a, b) => b.subscriberCount - a.subscriberCount)
      .slice(0, MAX_SUGGESTIONS);
  }, [nets, sfi, openBands]);

  // Render nothing if no solar data or no nets
  if (sfi === null || suggestions.length === 0) return null;

  return (
    <div className="bg-gradient-to-br from-panel/30 to-plasma-orange/5 border border-white/5 rounded-2xl p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        {/* Radio wave icon */}
        <svg
          className="w-4 h-4 text-plasma-orange shrink-0"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" fill="currentColor" />
          <path
            d="M4.93 11.07a4.5 4.5 0 010-6.14M11.07 4.93a4.5 4.5 0 010 6.14"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <path
            d="M2.81 13.19a7.5 7.5 0 010-10.38M13.19 2.81a7.5 7.5 0 010 10.38"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
        <h3 className="text-sm font-semibold text-white">Nets You Can Hear</h3>
      </div>

      {/* SFI value + open bands */}
      <p className="text-gray-500 text-xs mb-2">SFI {sfi} — open HF bands:</p>

      {/* Open band pills */}
      <div className="flex flex-wrap gap-1 mb-3">
        {openBandLabels.map((band) => (
          <span
            key={band}
            className="bg-signal-green/20 text-signal-green text-[10px] rounded-full px-2 py-0.5 uppercase tracking-wide"
          >
            {band}
          </span>
        ))}
      </div>

      {/* Net list */}
      <ul className="space-y-0">
        {suggestions.map((net) => (
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
    </div>
  );
}
