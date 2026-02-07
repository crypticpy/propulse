import { useMemo, useCallback } from "react";
import { useContestStore } from "@/stores/contestStore";
import { useUserStore } from "@/stores/userStore";

export interface ContestScoreSummary {
  callsign: string;
  contestName: string;
  qsoCount: number;
  score: number;
  multipliers: number;
  currentRate: number;
  bandBreakdown: Record<string, number>;
  lastUpdated: number;
}

/**
 * useContestScoreBroadcast - Produces a shareable contest score summary.
 *
 * Generates a base64-encoded URL hash that encodes the score for sharing.
 */
export function useContestScoreBroadcast() {
  const session = useContestStore((s) => s.activeSession);
  const callsign = useUserStore((s) => s.station?.callsign ?? "");

  const scoreSummary = useMemo<ContestScoreSummary | null>(() => {
    if (!session || session.qsos.length === 0) return null;

    const bandBreakdown: Record<string, number> = {};
    for (const qso of session.qsos) {
      const band = qso.band || "unknown";
      bandBreakdown[band] = (bandBreakdown[band] || 0) + 1;
    }

    // Compute current hourly rate: QSOs in the last 60 minutes
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const currentRate = session.qsos.filter(
      (q) => new Date(q.timestamp).getTime() > oneHourAgo,
    ).length;

    return {
      callsign: callsign || session.qsos[0]?.callsign || "???",
      contestName: session.contestId,
      qsoCount: session.qsos.length,
      score: session.totalScore,
      multipliers: session.totalMultipliers,
      currentRate,
      bandBreakdown,
      lastUpdated: Date.now(),
    };
  }, [session, callsign]);

  const shareUrl = useMemo(() => {
    if (!scoreSummary) return null;
    const json = JSON.stringify(scoreSummary);
    // Unicode-safe base64: encode to UTF-8 bytes first to avoid btoa() throwing on non-ASCII
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const b64 = btoa(binary);
    return `${window.location.origin}/#contest-score=${b64}`;
  }, [scoreSummary]);

  const copyShareLink = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Fallback for non-HTTPS
      const textarea = document.createElement("textarea");
      textarea.value = shareUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  }, [shareUrl]);

  return { scoreSummary, shareUrl, copyShareLink };
}
