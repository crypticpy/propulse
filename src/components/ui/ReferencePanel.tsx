/**
 * ReferencePanel - operator quick-reference content (parity item G12).
 *
 * Rendered inside the "?" help modal's Reference tab: band plan for the
 * user's ITU region, Q-codes, CW prosigns, and common CW abbreviations,
 * with a single text filter across the code tables.
 *
 * Lazy-loaded from ShortcutsHelpModal so the reference data stays out of
 * the entry bundle.
 */

import { useMemo, useState } from "react";
import { Q_CODES } from "@/lib/data/qCodes";
import { PROSIGNS, CW_ABBREVIATIONS } from "@/lib/data/prosigns";
import { getBandsForRegion } from "@/lib/data/bandplans";
import { useSettingsStore } from "@/stores/settingsStore";
import { BandPlanDisplay } from "@/components/bands/BandPlanDisplay";

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-xs uppercase tracking-wider text-plasma-orange/80 font-semibold mb-2">
      {title}
    </h3>
  );
}

function matches(filter: string, ...fields: string[]): boolean {
  const q = filter.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f.toLowerCase().includes(q));
}

export default function ReferencePanel() {
  const ituRegion = useSettingsStore((s) => s.ituRegion);
  const [filter, setFilter] = useState("");
  const [selectedBand, setSelectedBand] = useState("20m");

  const bands = useMemo(() => getBandsForRegion(ituRegion), [ituRegion]);

  const qCodes = Q_CODES.filter((q) =>
    matches(filter, q.code, q.question, q.statement),
  );
  const prosigns = PROSIGNS.filter((p) =>
    matches(filter, p.sign, p.meaning),
  );
  const abbreviations = CW_ABBREVIATIONS.filter((a) =>
    matches(filter, a.abbr, a.meaning),
  );

  return (
    <div className="space-y-5">
      {/* Band plan for the user's ITU region */}
      <div>
        <SectionHeader title={`Band Plan — ${ituRegion}`} />
        <div className="flex flex-wrap gap-1.5 mb-3">
          {bands.map((band) => (
            <button
              key={band}
              onClick={() => setSelectedBand(band)}
              className={`px-2 py-0.5 rounded text-xs font-mono border transition-colors ${
                band === selectedBand
                  ? "bg-plasma-orange/20 border-plasma-orange/60 text-plasma-orange"
                  : "bg-su-line/10 border-su-line/40 text-su-muted hover:bg-su-line/20"
              }`}
            >
              {band}
            </button>
          ))}
        </div>
        <BandPlanDisplay band={selectedBand} compact />
      </div>

      {/* Shared filter for the code tables below */}
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter Q-codes, prosigns, abbreviations..."
        className="w-full px-3 py-1.5 rounded-lg bg-su-line/10 border border-su-line/40 text-sm text-su-text placeholder:text-su-muted/80 focus:outline-none focus:border-plasma-orange/50"
        aria-label="Filter reference tables"
      />

      <div>
        <SectionHeader title="Q-Codes" />
        {qCodes.length === 0 ? (
          <p className="text-sm text-su-muted px-2">No matches</p>
        ) : (
          <div className="space-y-0.5">
            {qCodes.map((q) => (
              <div
                key={q.code}
                className="grid grid-cols-[3.5rem_1fr] gap-3 py-1.5 px-2 rounded hover:bg-su-line/10"
              >
                <span className="font-mono text-sm text-signal-green">
                  {q.code}
                </span>
                <span className="text-sm text-su-muted">
                  {q.statement}
                  <span className="block text-xs text-su-muted">
                    {q.question}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionHeader title="CW Prosigns" />
        {prosigns.length === 0 ? (
          <p className="text-sm text-su-muted px-2">No matches</p>
        ) : (
          <div className="space-y-0.5">
            {prosigns.map((p) => (
              <div
                key={p.sign}
                className="grid grid-cols-[3.5rem_7rem_1fr] gap-3 py-1.5 px-2 rounded hover:bg-su-line/10"
              >
                <span className="font-mono text-sm text-signal-green">
                  {p.sign}
                </span>
                <span className="font-mono text-xs text-su-muted self-center">
                  {p.morse}
                </span>
                <span className="text-sm text-su-muted">{p.meaning}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionHeader title="CW Abbreviations" />
        {abbreviations.length === 0 ? (
          <p className="text-sm text-su-muted px-2">No matches</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
            {abbreviations.map((a) => (
              <div
                key={a.abbr}
                className="grid grid-cols-[3.5rem_1fr] gap-3 py-1 px-2 rounded hover:bg-su-line/10"
              >
                <span className="font-mono text-sm text-signal-green">
                  {a.abbr}
                </span>
                <span className="text-sm text-su-muted">{a.meaning}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
