/**
 * FateBandAdvisor — Compact propagation band recommendation widget for the Fate skin.
 *
 * Shows which HF bands are currently best for FT8/FT4 operation based on real-time
 * solar conditions (K-index and Solar Flux Index). Uses the existing
 * `calculateBandConditions` propagation model to rate each band as
 * Excellent / Good / Fair / Poor, then displays the top 5 FT8-relevant bands
 * sorted by predicted quality.
 *
 * Data sources:
 * - `useKIndex()` — Latest Kp from NOAA (TanStack Query, 1-min refetch)
 * - `useSolarFlux()` — Latest SFI from NOAA (TanStack Query, 4-hr refetch)
 * - `calculateBandConditions()` — Band condition model from bands.ts
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * CONTEST MULTIPLIER BADGES — Integration Notes (Task 3)
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * To add contest multiplier badges on FateBandActivity decode rows:
 *
 * 1. DETECT ACTIVE CONTEST:
 *    Import `useContestStore` from `@/stores/contestStore`.
 *    Check `useContestStore(s => s.activeSession)` — if non-null and
 *    `activeSession.isActive === true`, a contest is in progress.
 *    The session contains `contestId`, `multipliers` (worked mults list),
 *    and a `workedMults` map can be derived from `activeSession.multipliers`.
 *
 * 2. CHECK IF CALLSIGN IS A NEW MULTIPLIER:
 *    Import `{ extractMultipliers, isNewMultiplier, addToWorkedMults }` from
 *    `@/lib/contest` and `{ getContestById }` from `@/lib/data/contests`.
 *    Given a decoded callsign:
 *      a. Get contest definition: `const contest = getContestById(activeSession.contestId)`
 *      b. Build a ContestQSODraft: `{ callsign, exchangeRcvd: "", parsedExchange: {}, band }`
 *      c. Extract mults: `const mults = extractMultipliers(draft, contest)`
 *      d. Build workedMults map from `activeSession.multipliers`:
 *         `const workedMults = new Map<string, Set<string>>();`
 *         For each entry in `activeSession.multipliers`:
 *           `workedMults.get(entry.type)?.add(entry.value) ?? workedMults.set(entry.type, new Set([entry.value]))`
 *      e. Check each extracted mult: `mults.some(m => isNewMultiplier(m, workedMults))`
 *
 * 3. WHERE TO ADD THE BADGE IN FateBandActivity:
 *    In the `FateDecodeRow` component, inside the callsign + badges cell
 *    (the `<div className="flex items-center gap-1 min-w-0">` block),
 *    add the MULT badge AFTER the DXCC badge and BEFORE the NEW badge:
 *
 *      {isNewEntity && d.parsedCallsign && (
 *        <span className="shrink-0 bg-caution-amber/20 text-caution-amber ...">DXCC</span>
 *      )}
 *      {isNewMult && d.parsedCallsign && (
 *        <span className="shrink-0 bg-amber-500/15 text-amber-400 text-[9px] font-bold px-1 rounded leading-normal">
 *          MULT!
 *        </span>
 *      )}
 *      {d.isNewStation && d.parsedCallsign && !isNewEntity && (
 *        <span className="shrink-0 bg-plasma-orange/20 text-plasma-orange ...">NEW</span>
 *      )}
 *
 * 4. BADGE STYLE:
 *    `bg-amber-500/15 text-amber-400 text-[9px] font-bold px-1 rounded`
 *    Gold text on subtle amber background, small rounded pill.
 *    The `leading-normal` class keeps vertical alignment consistent with
 *    the adjacent DXCC and NEW badges.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { useMemo } from "react";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { calculateBandConditions } from "@/lib/utils/bands";
import { BAND_COLORS } from "@/lib/utils/spotColors";
import { FT8_DIAL_FREQUENCIES } from "./useFateDecodes";
import type { BandCondition, VHFCondition } from "@/types/solar";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface FateBandAdvisorProps {
  currentBand: string | null;
  freqHz: number | null;
}

// ─── Condition scoring ───────────────────────────────────────────────────────

/** Numeric score for sorting bands by quality (higher = better). */
function conditionScore(condition: BandCondition | VHFCondition): number {
  switch (condition) {
    case "Excellent":
      return 4;
    case "Good":
      return 3;
    case "Fair":
      return 2;
    case "Aurora":
      return 1.5;
    case "Poor":
      return 1;
    default:
      return 0;
  }
}

/** Dot color for condition quality. */
function conditionDotColor(condition: BandCondition | VHFCondition): string {
  switch (condition) {
    case "Excellent":
      return "#00ff88"; // signal-green
    case "Good":
      return "#44dd66";
    case "Fair":
      return "#ffaa00"; // caution-amber
    case "Aurora":
      return "#aa44ff";
    case "Poor":
      return "#ff4455"; // alert-red
    default:
      return "#666666";
  }
}

/** Whether it's currently daytime UTC (rough heuristic: 06-18 UTC). */
function isApproxDaytimeUtc(): boolean {
  const hour = new Date().getUTCHours();
  return hour >= 6 && hour < 18;
}

// ─── Unique FT8/FT4 bands ───────────────────────────────────────────────────

/** Distinct band names that have FT8/FT4 dial frequencies. */
const FT8_BAND_SET: ReadonlySet<string> = new Set(
  FT8_DIAL_FREQUENCIES.map((d) => d.band),
);

// ─── Component ───────────────────────────────────────────────────────────────

export function FateBandAdvisor({ currentBand }: FateBandAdvisorProps) {
  // ── Solar data from TanStack Query ──
  const { data: kIndexData } = useKIndex();
  const { data: solarFluxData } = useSolarFlux();

  // Extract latest values
  const latestKp = useMemo(() => {
    if (!kIndexData || kIndexData.length === 0) return null;
    const last = kIndexData[kIndexData.length - 1];
    return last.kp_index ?? null;
  }, [kIndexData]);

  const latestSfi = useMemo(() => {
    if (!solarFluxData || solarFluxData.length === 0) return null;
    const last = solarFluxData[solarFluxData.length - 1];
    return last.flux ?? null;
  }, [solarFluxData]);

  // ── Compute band conditions ──
  const bandRatings = useMemo(() => {
    if (latestKp === null || latestSfi === null) return null;

    const conditions = calculateBandConditions(latestKp, latestSfi);
    const isDaytime = isApproxDaytimeUtc();

    // Filter to FT8 bands, pick day or night condition, score and sort
    const rated = conditions
      .filter((b) => FT8_BAND_SET.has(b.name))
      .map((b) => {
        const condition = isDaytime ? b.dayCondition : b.nightCondition;
        const score = conditionScore(condition);
        return {
          band: b.name,
          condition,
          score,
          dotColor: conditionDotColor(condition),
          bandColor: BAND_COLORS[b.name] ?? BAND_COLORS.default,
        };
      })
      .sort((a, b) => b.score - a.score);

    // Return top 5
    return rated.slice(0, 5);
  }, [latestKp, latestSfi]);

  // ── Render ──

  // No data available — show muted fallback
  if (!bandRatings) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-white/5 bg-[#0a0a14]">
        <span className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold shrink-0 mr-1">
          Propagation
        </span>
        <span className="text-[9px] text-gray-600 italic">
          No propagation data
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-white/5 bg-[#0a0a14]">
      <span className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold shrink-0 mr-1">
        Propagation
      </span>

      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
        {bandRatings.map((r) => {
          const isCurrent = currentBand === r.band;
          return (
            <div
              key={r.band}
              className={`
                shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-md
                border transition-all duration-150
                ${
                  isCurrent
                    ? "border-white/20 bg-white/[0.06]"
                    : "border-white/5 bg-white/[0.02]"
                }
              `}
              title={`${r.band}: ${r.condition}${isCurrent ? " (current)" : ""}`}
            >
              {/* Condition dot */}
              <span
                className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                style={{
                  backgroundColor: r.dotColor,
                  boxShadow:
                    r.score >= 3 ? `0 0 4px ${r.dotColor}60` : undefined,
                }}
              />
              {/* Band name */}
              <span
                className="text-[9px] font-semibold font-mono"
                style={{
                  color: isCurrent ? r.bandColor : "rgba(255,255,255,0.55)",
                }}
              >
                {r.band}
              </span>
            </div>
          );
        })}
      </div>

      {/* Compact SFI / Kp readout */}
      {latestKp !== null && latestSfi !== null && (
        <span className="text-[8px] text-gray-600 font-mono ml-auto shrink-0 tabular-nums">
          SFI {Math.round(latestSfi)} · Kp {latestKp}
        </span>
      )}
    </div>
  );
}
