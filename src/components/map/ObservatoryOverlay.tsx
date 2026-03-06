/**
 * ObservatoryOverlay — Minimal HUD for Observatory Mode
 *
 * Shows a ticking UTC clock, station callsign + grid locator,
 * and a fade-away "ESC to exit" hint. Designed for the lean-back
 * fullscreen observatory experience.
 */

import { useEffect, useMemo, useState, useRef } from "react";
import { useUTCClock } from "@/hooks/useUTCClock";
import { useUserStore } from "@/stores/userStore";

export function ObservatoryOverlay() {
  const { station } = useUserStore();

  // ── Ticking UTC clock ────────────────────────────────────────
  const now = useUTCClock();
  const utcFmt = useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "UTC",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
    [],
  );
  const utcString = utcFmt.format(now);

  // ── ESC hint fades after 5 s ─────────────────────────────────
  const [showEscHint, setShowEscHint] = useState(true);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    hintTimerRef.current = setTimeout(() => setShowEscHint(false), 5000);
    return () => clearTimeout(hintTimerRef.current);
  }, []);

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[220] pointer-events-none select-none">
      <div className="bg-black/50 backdrop-blur-md border border-white/10 rounded-xl px-5 py-3 flex items-center gap-4">
        {/* UTC clock */}
        <span className="font-mono text-lg text-white/90 tracking-wider tabular-nums">
          {utcString}
          <span className="text-[10px] text-white/40 ml-1.5">UTC</span>
        </span>

        {/* Station info */}
        {station && (
          <>
            <div className="w-px h-5 bg-white/15" />
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-white/80">
                {station.callsign}
              </span>
              <span className="text-[10px] text-white/40">
                {station.grid ?? "\u2014"}
              </span>
            </div>
          </>
        )}

        {/* ESC hint — fades out after 5 s */}
        <div
          className={`transition-opacity duration-1000 ${showEscHint ? "opacity-100" : "opacity-0"}`}
        >
          <div className="w-px h-5 bg-white/15" />
        </div>
        <span
          className={`text-[10px] text-white/30 transition-opacity duration-1000 ${showEscHint ? "opacity-100" : "opacity-0"}`}
        >
          <kbd className="px-1 py-0.5 bg-white/10 rounded text-white/40">
            ESC
          </kbd>{" "}
          to exit
        </span>
      </div>
    </div>
  );
}
