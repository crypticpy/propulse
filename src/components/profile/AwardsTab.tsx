/**
 * AwardsTab - Profile tab showing DXCC, WAS, and WAZ award progress.
 *
 * Displays three progress rings with summary statistics, loading skeleton,
 * and an empty-state message when no QSOs have been logged.
 */

import { useAwardProgress } from "@/hooks/useAwardProgress";
import { AwardProgressRing } from "./AwardProgressRing";
import { AchievementGrid } from "./AchievementGrid";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Current DXCC entity count — update when ARRL modifies the list */
const DXCC_ENTITY_COUNT = 340;

// ─── Color constants (hex values from project palette) ──────────────────────

/** sunspot-blue: visible blue accent for "worked" arcs */
const COLOR_WORKED = "#3a86ff";
/** signal-green: accent for "confirmed" arcs (DXCC & WAS) */
const COLOR_CONFIRMED_GREEN = "#00ff88";
/** plasma-orange: accent for WAZ "confirmed" arc */
const COLOR_CONFIRMED_ORANGE = "#ff6b35";

// ─── Skeleton placeholder ───────────────────────────────────────────────────

function RingSkeleton() {
  return (
    <div className="flex flex-col items-center gap-2 animate-pulse">
      <div className="w-[120px] h-[120px] rounded-full bg-white/5" />
      <div className="w-12 h-3 rounded bg-white/5" />
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AwardsTab() {
  const {
    dxccWorkedCount,
    dxccConfirmedCount,
    wasWorkedCount,
    wasConfirmedCount,
    wazWorkedCount,
    wazConfirmedCount,
    isLoading,
  } = useAwardProgress();

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap justify-center gap-8">
          <RingSkeleton />
          <RingSkeleton />
          <RingSkeleton />
        </div>
        <div className="h-16 rounded-lg bg-white/5 animate-pulse" />
      </div>
    );
  }

  const hasData =
    dxccWorkedCount > 0 || wasWorkedCount > 0 || wazWorkedCount > 0;

  // ── Empty state ──
  if (!hasData) {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <div className="flex flex-wrap justify-center gap-8 opacity-40">
          <AwardProgressRing
            worked={0}
            confirmed={0}
            total={DXCC_ENTITY_COUNT}
            label="DXCC"
            workedColor={COLOR_WORKED}
            confirmedColor={COLOR_CONFIRMED_GREEN}
          />
          <AwardProgressRing
            worked={0}
            confirmed={0}
            total={50}
            label="WAS"
            workedColor={COLOR_WORKED}
            confirmedColor={COLOR_CONFIRMED_GREEN}
          />
          <AwardProgressRing
            worked={0}
            confirmed={0}
            total={40}
            label="WAZ"
            workedColor={COLOR_WORKED}
            confirmedColor={COLOR_CONFIRMED_ORANGE}
          />
        </div>
        <p className="text-sm text-gray-400 text-center max-w-md leading-relaxed">
          Log QSOs to start tracking your award progress. Awards are computed
          from your logbook entries.
        </p>
      </div>
    );
  }

  // ── Normal state ──
  return (
    <div className="space-y-6">
      {/* Progress rings */}
      <div className="flex flex-wrap justify-center gap-8">
        <AwardProgressRing
          worked={dxccWorkedCount}
          confirmed={dxccConfirmedCount}
          total={DXCC_ENTITY_COUNT}
          label="DXCC"
          workedColor={COLOR_WORKED}
          confirmedColor={COLOR_CONFIRMED_GREEN}
        />
        <AwardProgressRing
          worked={wasWorkedCount}
          confirmed={wasConfirmedCount}
          total={50}
          label="WAS"
          workedColor={COLOR_WORKED}
          confirmedColor={COLOR_CONFIRMED_GREEN}
        />
        <AwardProgressRing
          worked={wazWorkedCount}
          confirmed={wazConfirmedCount}
          total={40}
          label="WAZ"
          workedColor={COLOR_WORKED}
          confirmedColor={COLOR_CONFIRMED_ORANGE}
        />
      </div>

      {/* Summary stats */}
      <div className="rounded-lg border border-white/5 bg-panel/30 p-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <SummaryColumn
            label="DXCC"
            worked={dxccWorkedCount}
            confirmed={dxccConfirmedCount}
            total={DXCC_ENTITY_COUNT}
          />
          <SummaryColumn
            label="WAS"
            worked={wasWorkedCount}
            confirmed={wasConfirmedCount}
            total={50}
          />
          <SummaryColumn
            label="WAZ"
            worked={wazWorkedCount}
            confirmed={wazConfirmedCount}
            total={40}
          />
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-4 pt-3 border-t border-white/5">
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: COLOR_WORKED }}
            />
            <span className="text-xs text-gray-400">Worked</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: COLOR_CONFIRMED_GREEN }}
            />
            <span className="text-xs text-gray-400">Confirmed (DXCC/WAS)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: COLOR_CONFIRMED_ORANGE }}
            />
            <span className="text-xs text-gray-400">Confirmed (WAZ)</span>
          </div>
        </div>
      </div>

      {/* Achievement Badges */}
      <div className="border-t border-white/5 pt-6">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Achievement Badges
        </h3>
        <AchievementGrid />
      </div>
    </div>
  );
}

// ─── Summary column sub-component ───────────────────────────────────────────

function SummaryColumn({
  label,
  worked,
  confirmed,
  total,
}: {
  label: string;
  worked: number;
  confirmed: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((confirmed / total) * 100) : 0;

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold tracking-wider text-gray-400 uppercase">
        {label}
      </div>
      <div className="text-sm text-gray-300">
        <span className="text-white font-medium">{worked}</span>
        <span className="text-gray-500"> / {total}</span>
        <span className="text-gray-500 ml-1">wkd</span>
      </div>
      <div className="text-sm text-gray-300">
        <span className="text-signal-green font-medium">{confirmed}</span>
        <span className="text-gray-500"> / {total}</span>
        <span className="text-gray-500 ml-1">cfm</span>
      </div>
      <div className="text-xs text-gray-500">{pct}% confirmed</div>
    </div>
  );
}
