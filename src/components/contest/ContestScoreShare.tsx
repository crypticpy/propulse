import { useState, useCallback } from "react";
import { useContestScoreBroadcast } from "@/hooks/useContestScoreBroadcast";

/**
 * ContestScoreShare - Compact "Share Score" card for contest sessions.
 * Shows current score summary and provides a copy-to-clipboard share link.
 */
export function ContestScoreShare() {
  const { scoreSummary, copyShareLink } = useContestScoreBroadcast();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await copyShareLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [copyShareLink]);

  if (!scoreSummary) return null;

  return (
    <div className="rounded-xl border border-su-line/40 bg-deep-space/80 backdrop-blur-sm p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-su-muted uppercase tracking-wider">
          Score Summary
        </h3>
        <button
          onClick={handleCopy}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
            copied
              ? "bg-signal-green/20 text-signal-green"
              : "bg-plasma-orange/15 text-plasma-orange hover:bg-plasma-orange/25"
          }`}
        >
          {copied ? "Copied!" : "Share Score"}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="text-center">
          <div className="text-lg font-bold text-su-text font-mono tabular-nums">
            {scoreSummary.score.toLocaleString()}
          </div>
          <div className="text-[10px] text-su-muted uppercase">Score</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-cosmic-cyan font-mono tabular-nums">
            {scoreSummary.qsoCount}
          </div>
          <div className="text-[10px] text-su-muted uppercase">QSOs</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-plasma-orange font-mono tabular-nums">
            {scoreSummary.multipliers}
          </div>
          <div className="text-[10px] text-su-muted uppercase">Mults</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-signal-green font-mono tabular-nums">
            {scoreSummary.currentRate}/hr
          </div>
          <div className="text-[10px] text-su-muted uppercase">Rate</div>
        </div>
      </div>

      {/* Band breakdown */}
      {Object.keys(scoreSummary.bandBreakdown).length > 0 && (
        <div className="mt-2 pt-2 border-t border-su-line/20 flex flex-wrap gap-2">
          {Object.entries(scoreSummary.bandBreakdown)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([band, count]) => (
              <span
                key={band}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-su-line/10 text-[10px] font-mono"
              >
                <span className="text-su-muted">{band}</span>
                <span className="text-su-text font-semibold">{count}</span>
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
