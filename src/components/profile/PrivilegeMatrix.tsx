/**
 * PrivilegeMatrix -- Band/mode/power grid showing operator privileges.
 *
 * Reads license class and country from profileStore, queries getPrivileges()
 * to build a visual grid of bands x modes with color-coded access indicators.
 * Uses a simplified list view on mobile.
 */

import { useMemo } from "react";
import { useProfileStore } from "@/stores/profileStore";
import { getPrivileges } from "@/lib/data/licensePrivileges";
import type { BandPrivilege } from "@/lib/data/licensePrivileges";
import type { BandId } from "@/types/user";
import { useIsMobile } from "@/hooks/useIsMobile";

/** Canonical mode columns for the grid */
const MODE_COLUMNS = ["CW", "PHONE", "DATA"] as const;
type ModeColumn = (typeof MODE_COLUMNS)[number];

/** All bands in display order */
const ALL_BANDS: BandId[] = [
  "160m",
  "80m",
  "60m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
  "6m",
  "2m",
  "70cm",
];

/** Merged privilege info for a single band */
interface BandSummary {
  band: BandId;
  modes: Set<string>;
  maxPowerWatts: number;
  isPartial: boolean; // true if not all sub-bands are accessible
}

/**
 * Merge multiple BandPrivilege entries for the same band into one summary.
 * A band is "partial" if the license class has some but not all modes from CW/PHONE/DATA.
 */
function buildBandSummaries(
  privileges: BandPrivilege[],
): Map<BandId, BandSummary> {
  const map = new Map<BandId, BandSummary>();

  for (const p of privileges) {
    const existing = map.get(p.band);
    if (existing) {
      for (const m of p.modes) existing.modes.add(m);
      existing.maxPowerWatts = Math.max(
        existing.maxPowerWatts,
        p.maxPowerWatts,
      );
    } else {
      map.set(p.band, {
        band: p.band,
        modes: new Set(p.modes),
        maxPowerWatts: p.maxPowerWatts,
        isPartial: false,
      });
    }
  }

  // Mark partial: if a band has some but not all of CW/PHONE/DATA
  for (const summary of map.values()) {
    const count = MODE_COLUMNS.filter((m) => summary.modes.has(m)).length;
    summary.isPartial = count > 0 && count < MODE_COLUMNS.length;
  }

  return map;
}

function formatPower(watts: number): string {
  if (watts >= 1000)
    return `${(watts / 1000).toFixed(watts % 1000 === 0 ? 0 : 1)} kW`;
  return `${watts} W`;
}

function getCellColor(
  summary: BandSummary | undefined,
  mode: ModeColumn,
): { bg: string; text: string; label: string } {
  if (!summary || !summary.modes.has(mode)) {
    return {
      bg: "bg-su-line/10",
      text: "text-su-muted",
      label: "\u2014",
    };
  }
  if (summary.isPartial) {
    return {
      bg: "bg-caution-amber/15",
      text: "text-caution-amber",
      label: "\u2713",
    };
  }
  return {
    bg: "bg-signal-green/15",
    text: "text-signal-green",
    label: "\u2713",
  };
}

// ─── Desktop Grid View ──────────────────────────────────────────────────────

function DesktopGrid({ summaries }: { summaries: Map<BandId, BandSummary> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-su-muted uppercase tracking-wider">
            <th className="text-left py-1.5 pr-3 font-medium">Band</th>
            {MODE_COLUMNS.map((m) => (
              <th key={m} className="text-center py-1.5 px-2 font-medium">
                {m}
              </th>
            ))}
            <th className="text-right py-1.5 pl-3 font-medium">Max Power</th>
          </tr>
        </thead>
        <tbody>
          {ALL_BANDS.map((band) => {
            const summary = summaries.get(band);
            const hasBand = !!summary;
            return (
              <tr
                key={band}
                className={`border-t border-su-line/20 ${hasBand ? "" : "opacity-40"}`}
              >
                <td className="py-1.5 pr-3 font-mono text-su-muted font-medium">
                  {band}
                </td>
                {MODE_COLUMNS.map((mode) => {
                  const cell = getCellColor(summary, mode);
                  return (
                    <td key={mode} className="py-1.5 px-2 text-center">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-5 rounded text-[10px] font-semibold ${cell.bg} ${cell.text}`}
                      >
                        {cell.label}
                      </span>
                    </td>
                  );
                })}
                <td className="py-1.5 pl-3 text-right font-mono text-su-muted">
                  {summary ? formatPower(summary.maxPowerWatts) : "\u2014"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Mobile List View ───────────────────────────────────────────────────────

function MobileList({ summaries }: { summaries: Map<BandId, BandSummary> }) {
  const bands = ALL_BANDS.filter((b) => summaries.has(b));

  if (bands.length === 0) {
    return (
      <p className="text-sm text-su-muted italic">
        No band privileges found for this license class.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {bands.map((band) => {
        const summary = summaries.get(band)!;
        return (
          <div
            key={band}
            className="flex items-center justify-between py-1.5 border-b border-su-line/20 last:border-0"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-medium text-su-muted w-10">
                {band}
              </span>
              <div className="flex gap-1">
                {MODE_COLUMNS.map((mode) => {
                  const has = summary.modes.has(mode);
                  return (
                    <span
                      key={mode}
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        has
                          ? summary.isPartial
                            ? "bg-caution-amber/15 text-caution-amber"
                            : "bg-signal-green/15 text-signal-green"
                          : "bg-su-line/10 text-su-muted"
                      }`}
                    >
                      {mode}
                    </span>
                  );
                })}
              </div>
            </div>
            <span className="text-xs font-mono text-su-muted">
              {formatPower(summary.maxPowerWatts)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function PrivilegeMatrix() {
  const license = useProfileStore((s) => s.license);
  const isMobile = useIsMobile();

  const summaries = useMemo(() => {
    if (!license) return new Map<BandId, BandSummary>();
    const privileges = getPrivileges(license.country, license.class);
    return buildBandSummaries(privileges);
  }, [license]);

  if (!license) {
    return (
      <p className="text-sm text-su-muted italic">
        Set your license class to see band privileges.
      </p>
    );
  }

  const bandCount = Array.from(summaries.values()).length;

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[10px]">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-signal-green/15 border border-signal-green/30" />
          <span className="text-su-muted">Full access</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-caution-amber/15 border border-caution-amber/30" />
          <span className="text-su-muted">Partial</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-su-line/10 border border-su-line/40" />
          <span className="text-su-muted">No access</span>
        </div>
      </div>

      {bandCount === 0 ? (
        <p className="text-sm text-su-muted italic">
          No privilege data available for this license class/country
          combination.
        </p>
      ) : isMobile ? (
        <MobileList summaries={summaries} />
      ) : (
        <>
          <DesktopGrid summaries={summaries} />
          <p className="text-[10px] text-su-muted mt-1 text-right sm:hidden">
            Scroll for more bands &rarr;
          </p>
        </>
      )}
    </div>
  );
}
