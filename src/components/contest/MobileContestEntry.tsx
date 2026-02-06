/**
 * MobileContestEntry Component (QoL13)
 *
 * Touch-optimized contest entry for tablets/phones.
 * Large inputs, touch-friendly band/mode selectors, simplified scoreboard.
 * Renders when viewport < 768px.
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { useContestStore } from "@/stores/contestStore";
import type { ContestQSO } from "@/stores/contestStore";

const BANDS = ["160m", "80m", "40m", "20m", "15m", "10m"];
const MODES = ["CW", "SSB", "FT8", "RTTY"];

function ScoreStrip({
  qsoCount,
  points,
  mults,
}: {
  qsoCount: number;
  points: number;
  mults: number;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-white/[0.03] border-b border-white/10">
      <div className="flex items-center gap-4">
        <div className="text-center">
          <div className="text-[10px] text-gray-400 uppercase">QSOs</div>
          <div className="text-lg font-bold text-white font-mono">
            {qsoCount}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-gray-400 uppercase">Points</div>
          <div className="text-lg font-bold text-signal-green font-mono">
            {points}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-gray-400 uppercase">Mults</div>
          <div className="text-lg font-bold text-plasma-orange font-mono">
            {mults}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-[10px] text-gray-400 uppercase">Score</div>
        <div className="text-lg font-bold text-cosmic-cyan font-mono">
          {(points * Math.max(1, mults)).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

function RecentQsoList({ qsos }: { qsos: ContestQSO[] }) {
  const recent = useMemo(() => qsos.slice(-5).reverse(), [qsos]);

  if (recent.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500 text-sm">
        No QSOs logged yet
      </div>
    );
  }

  return (
    <div className="divide-y divide-white/5">
      {recent.map((qso) => (
        <div
          key={qso.id}
          className="flex items-center justify-between px-3 py-1.5 text-xs"
        >
          <div className="flex items-center gap-2">
            <span className="text-gray-400 font-mono w-12">
              {new Date(qso.timestamp).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="text-white font-mono font-bold">
              {qso.callsign}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-400">{qso.band}</span>
            <span className="text-gray-400">{qso.mode}</span>
            {qso.isMultiplier && (
              <span className="text-plasma-orange font-bold">M</span>
            )}
            {qso.isDupe && <span className="text-alert-red font-bold">D</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MobileContestEntry() {
  const session = useContestStore((s) => s.activeSession);
  const logQso = useContestStore((s) => s.logQSO);

  const [callsign, setCallsign] = useState("");
  const [exchange, setExchange] = useState("");
  const [band, setBand] = useState("20m");
  const [mode, setMode] = useState("SSB");

  // RST default depends on mode: "59" for phone, "599" for CW/digital
  const isPhoneMode = mode === "SSB" || mode === "FM" || mode === "AM";
  const [rst, setRst] = useState(isPhoneMode ? "59" : "599");

  // Update RST when mode changes
  useEffect(() => {
    setRst(isPhoneMode ? "59" : "599");
  }, [isPhoneMode]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!callsign.trim() || !session) return;

      logQso({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        callsign: callsign.toUpperCase().trim(),
        band,
        mode,
        rstSent: rst,
        rstReceived: rst,
        exchangeSent: session.myExchange,
        exchangeReceived: exchange,
        points: 1,
        isMultiplier: false,
      });

      setCallsign("");
      setExchange("");
    },
    [callsign, band, mode, rst, exchange, session, logQso],
  );

  if (!session) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 p-8 text-center">
        No active contest session. Start a contest from the desktop view.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-nebula-blue">
      {/* Score strip */}
      <ScoreStrip
        qsoCount={session.qsos.length}
        points={session.totalPoints}
        mults={session.totalMultipliers}
      />

      {/* Entry form */}
      <form onSubmit={handleSubmit} className="flex-1 p-4 space-y-3">
        {/* Callsign - large input */}
        <div>
          <input
            type="text"
            value={callsign}
            onChange={(e) => setCallsign(e.target.value.toUpperCase())}
            className="w-full px-4 bg-white/5 border border-white/20 rounded-xl text-white font-mono font-bold text-xl focus:border-cosmic-cyan/50 focus:outline-none focus:ring-2 focus:ring-cosmic-cyan/20"
            style={{ height: "48px", fontSize: "20px" }}
            placeholder="CALLSIGN"
            aria-label="Callsign"
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
          />
        </div>

        {/* Band selector - large touch targets */}
        <div className="flex flex-wrap gap-1.5">
          {BANDS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBand(b)}
              className={`flex-1 min-w-[44px] min-h-[44px] rounded-lg font-bold text-sm transition-colors ${
                band === b
                  ? "bg-cosmic-cyan/30 text-cosmic-cyan border-2 border-cosmic-cyan/60"
                  : "bg-white/5 text-gray-400 border border-white/10"
              }`}
            >
              {b}
            </button>
          ))}
        </div>

        {/* Mode selector - large touch targets */}
        <div className="flex gap-1.5">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 min-h-[44px] rounded-lg font-bold text-sm transition-colors ${
                mode === m
                  ? "bg-plasma-orange/30 text-plasma-orange border-2 border-plasma-orange/60"
                  : "bg-white/5 text-gray-400 border border-white/10"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* RST + Exchange */}
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={rst}
            onChange={(e) => setRst(e.target.value)}
            className="px-3 bg-white/5 border border-white/10 rounded-lg text-white font-mono text-base focus:border-cosmic-cyan/50 focus:outline-none"
            style={{ height: "44px" }}
            placeholder="RST"
            aria-label="Signal report"
          />
          <input
            type="text"
            value={exchange}
            onChange={(e) => setExchange(e.target.value)}
            className="px-3 bg-white/5 border border-white/10 rounded-lg text-white font-mono text-base focus:border-cosmic-cyan/50 focus:outline-none"
            style={{ height: "44px" }}
            placeholder="Exchange"
            aria-label="Exchange"
          />
        </div>

        {/* Log button */}
        <button
          type="submit"
          disabled={!callsign.trim()}
          className="w-full min-h-[48px] rounded-xl font-bold text-base bg-signal-green/20 text-signal-green border-2 border-signal-green/40 hover:bg-signal-green/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          LOG QSO
        </button>
      </form>

      {/* Recent QSOs */}
      <div className="border-t border-white/10">
        <div className="px-3 py-1.5 text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
          Recent
        </div>
        <RecentQsoList qsos={session.qsos} />
      </div>
    </div>
  );
}
