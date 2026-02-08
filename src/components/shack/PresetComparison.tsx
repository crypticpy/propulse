/**
 * PresetComparison — Side-by-side comparison of two station presets.
 *
 * Displays per-band ERP differences with color coding:
 *   green + up arrow when Preset B > Preset A (improvement)
 *   red + down arrow when Preset B < Preset A (regression)
 *
 * Includes a summary line showing which preset wins on more bands.
 */

import { useState, useMemo } from "react";
import { useStationPresets } from "@/stores/shackStore";
import { useStationPerformance } from "@/hooks/useStationPerformance";
import type { BandPerformance } from "@/hooks/useStationPerformance";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatWatts(w: number): string {
  if (w >= 1000) return `${(w / 1000).toFixed(1)}kW`;
  if (w >= 100) return `${w.toFixed(0)}W`;
  return `${w.toFixed(1)}W`;
}

const SELECT_CLASS =
  "w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-plasma-orange/50 focus:outline-none";

// ─── Merged comparison row ──────────────────────────────────────────────────

interface ComparisonRow {
  band: string;
  freqMHz: number;
  erpA: number | null;
  erpB: number | null;
  diff: number | null; // B - A, null if either side missing
}

function buildComparisonRows(
  bandsA: BandPerformance[],
  bandsB: BandPerformance[],
): ComparisonRow[] {
  // Collect all unique bands, keyed by band name
  const bandMap = new Map<
    string,
    { freqMHz: number; erpA: number | null; erpB: number | null }
  >();

  for (const b of bandsA) {
    bandMap.set(b.band, { freqMHz: b.freqMHz, erpA: b.erpWatts, erpB: null });
  }

  for (const b of bandsB) {
    const existing = bandMap.get(b.band);
    if (existing) {
      existing.erpB = b.erpWatts;
    } else {
      bandMap.set(b.band, { freqMHz: b.freqMHz, erpA: null, erpB: b.erpWatts });
    }
  }

  // Sort by frequency ascending
  const rows: ComparisonRow[] = [];
  for (const [band, data] of bandMap) {
    const diff =
      data.erpA != null && data.erpB != null ? data.erpB - data.erpA : null;
    rows.push({
      band,
      freqMHz: data.freqMHz,
      erpA: data.erpA,
      erpB: data.erpB,
      diff,
    });
  }
  rows.sort((a, b) => a.freqMHz - b.freqMHz);

  return rows;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PresetComparison() {
  const presets = useStationPresets();
  const [presetIdA, setPresetIdA] = useState<string>("");
  const [presetIdB, setPresetIdB] = useState<string>("");

  const perfA = useStationPerformance(presetIdA || undefined);
  const perfB = useStationPerformance(presetIdB || undefined);

  const rows = useMemo(
    () => buildComparisonRows(perfA.bands, perfB.bands),
    [perfA.bands, perfB.bands],
  );

  const summary = useMemo(() => {
    if (rows.length === 0) return null;

    let bBetter = 0;
    let aBetter = 0;
    let tied = 0;

    for (const row of rows) {
      if (row.diff == null) continue;
      if (row.diff > 0.1) bBetter++;
      else if (row.diff < -0.1) aBetter++;
      else tied++;
    }

    const comparableBands = bBetter + aBetter + tied;
    if (comparableBands === 0) return null;

    const nameA = perfA.preset?.name ?? "Preset A";
    const nameB = perfB.preset?.name ?? "Preset B";

    if (bBetter > aBetter) {
      return `${nameB} is better on ${bBetter}/${comparableBands} bands`;
    }
    if (aBetter > bBetter) {
      return `${nameA} is better on ${aBetter}/${comparableBands} bands`;
    }
    return `Both presets are equal on ${tied}/${comparableBands} bands`;
  }, [rows, perfA.preset, perfB.preset]);

  // ── Not enough presets ──
  if (presets.length < 2) {
    return (
      <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-gray-200 mb-2">
          Compare Presets
        </h3>
        <p className="text-xs text-gray-500 italic">
          Create at least 2 presets to compare
        </p>
      </div>
    );
  }

  const bothSelected = presetIdA !== "" && presetIdB !== "";

  return (
    <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-200">Compare Presets</h3>

      {/* ── Preset selectors ── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">
            Preset A
          </label>
          <select
            className={SELECT_CLASS}
            value={presetIdA}
            onChange={(e) => setPresetIdA(e.target.value)}
          >
            <option value="">Select preset...</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">
            Preset B
          </label>
          <select
            className={SELECT_CLASS}
            value={presetIdB}
            onChange={(e) => setPresetIdB(e.target.value)}
          >
            <option value="">Select preset...</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Comparison table ── */}
      {bothSelected && rows.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5 text-gray-500">
                  <th className="text-left py-1.5 pr-3 font-medium">Band</th>
                  <th className="text-right py-1.5 px-3 font-medium">
                    {perfA.preset?.name ?? "Preset A"} ERP
                  </th>
                  <th className="text-right py-1.5 px-3 font-medium">
                    {perfB.preset?.name ?? "Preset B"} ERP
                  </th>
                  <th className="text-right py-1.5 pl-3 font-medium">
                    Difference
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.band}
                    className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-1.5 pr-3 text-gray-300 font-medium">
                      {row.band}
                    </td>
                    <td className="py-1.5 px-3 text-right text-gray-400 tabular-nums">
                      {row.erpA != null ? formatWatts(row.erpA) : "\u2014"}
                    </td>
                    <td className="py-1.5 px-3 text-right text-gray-400 tabular-nums">
                      {row.erpB != null ? formatWatts(row.erpB) : "\u2014"}
                    </td>
                    <td className="py-1.5 pl-3 text-right tabular-nums">
                      <DiffCell diff={row.diff} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Summary ── */}
          {summary && (
            <p className="text-xs text-gray-400 pt-1">
              <span className="text-gray-500">Summary:</span> {summary}
            </p>
          )}
        </>
      )}

      {/* ── Prompt to select both ── */}
      {!bothSelected && (
        <p className="text-xs text-gray-500 italic">
          Select two presets above to compare their per-band ERP
        </p>
      )}

      {/* ── Both selected but no band data ── */}
      {bothSelected && rows.length === 0 && (
        <p className="text-xs text-gray-500 italic">
          No band data available for the selected presets
        </p>
      )}
    </div>
  );
}

// ─── Diff Cell ──────────────────────────────────────────────────────────────

function DiffCell({ diff }: { diff: number | null }) {
  if (diff == null) {
    return <span className="text-gray-600">{"\u2014"}</span>;
  }

  const absDiff = Math.abs(diff);
  const formatted = absDiff >= 0.1 ? formatWatts(absDiff) : "0W";

  if (diff > 0.1) {
    return (
      <span className="text-signal-green">
        +{formatted}{" "}
        <span className="text-[10px]" aria-label="improved">
          {"\u2191"}
        </span>
      </span>
    );
  }

  if (diff < -0.1) {
    return (
      <span className="text-alert-red">
        -{formatted}{" "}
        <span className="text-[10px]" aria-label="regressed">
          {"\u2193"}
        </span>
      </span>
    );
  }

  return <span className="text-gray-500">0W</span>;
}
