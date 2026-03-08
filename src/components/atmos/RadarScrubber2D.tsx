/**
 * RadarScrubber2D — Timeline control for 2D radar animation.
 * Positioned at the absolute bottom-center of the map viewport.
 *
 * Drives the `radarFrame` in atmosStore to animate RadarLayer2D.
 * Features: play/pause, 12 clickable frame dots, UTC timestamp, frame age label.
 * Auto-advance: 600ms per frame with 2s pause on the latest frame.
 */

import { useEffect, useRef, useCallback } from "react";
import { useAtmosStore } from "@/stores/atmosStore";
import { NEXRAD_FRAME_COUNT } from "@/lib/api/nexrad";

/* ── Timing ─────────────────────────────────────────────────────────── */

const FRAME_INTERVAL_MS = 600;
const LATEST_PAUSE_MS = 2000;
const LATEST_FRAME = NEXRAD_FRAME_COUNT - 1;

/* ── Helpers ────────────────────────────────────────────────────────── */

function getFrameLabel(index: number): string {
  const minutesAgo = (NEXRAD_FRAME_COUNT - 1 - index) * 5;
  if (minutesAgo === 0) return "Now";
  return `${minutesAgo}m ago`;
}

function getFrameUtc(index: number): string {
  const minutesAgo = (NEXRAD_FRAME_COUNT - 1 - index) * 5;
  const d = new Date(Date.now() - minutesAgo * 60_000);
  return (
    d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }) + "z"
  );
}

/* ── Inline SVG icons (14px) ────────────────────────────────────────── */

function PlayIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="currentColor"
      className="text-gray-300"
    >
      <polygon points="3,1 12,7 3,13" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="currentColor"
      className="text-gray-300"
    >
      <rect x="2" y="1" width="3.5" height="12" rx="0.5" />
      <rect x="8.5" y="1" width="3.5" height="12" rx="0.5" />
    </svg>
  );
}

/* ── Main component ─────────────────────────────────────────────────── */

export function RadarScrubber2D() {
  const radarFrame = useAtmosStore((s) => s.radarFrame);
  const radarPlaying = useAtmosStore((s) => s.radarPlaying);
  const setRadarFrame = useAtmosStore((s) => s.setRadarFrame);
  const toggleRadarPlaying = useAtmosStore((s) => s.toggleRadarPlaying);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize frame to latest on mount if unset
  useEffect(() => {
    if (radarFrame === -1) {
      setRadarFrame(LATEST_FRAME);
    }
  }, [radarFrame, setRadarFrame]);

  const activeFrame = radarFrame < 0 ? LATEST_FRAME : radarFrame;

  // Auto-advance timer
  useEffect(() => {
    if (!radarPlaying) return;

    const advance = () => {
      const current = useAtmosStore.getState().radarFrame;
      const idx = current < 0 ? LATEST_FRAME : current;
      const next = (idx + 1) % NEXRAD_FRAME_COUNT;
      setRadarFrame(next);

      // Longer pause on the latest frame
      const delay = next === LATEST_FRAME ? LATEST_PAUSE_MS : FRAME_INTERVAL_MS;
      timerRef.current = setTimeout(advance, delay);
    };

    // Start first tick
    const delay =
      activeFrame === LATEST_FRAME ? LATEST_PAUSE_MS : FRAME_INTERVAL_MS;
    timerRef.current = setTimeout(advance, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radarPlaying, setRadarFrame]);

  const handleDotClick = useCallback(
    (index: number) => {
      setRadarFrame(index);
      // Pause when user clicks a specific frame
      if (radarPlaying) toggleRadarPlaying();
    },
    [setRadarFrame, radarPlaying, toggleRadarPlaying],
  );

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-void-black/80 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">
      {/* Play / Pause */}
      <button
        type="button"
        onClick={toggleRadarPlaying}
        className="flex-shrink-0 hover:opacity-80 transition-opacity"
        aria-label={radarPlaying ? "Pause radar" : "Play radar"}
      >
        {radarPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      {/* UTC timestamp */}
      <span className="text-[10px] font-mono text-gray-400 tabular-nums min-w-[42px] text-center">
        {getFrameUtc(activeFrame)}
      </span>

      {/* Frame progress dots */}
      <div className="flex items-center gap-[3px]">
        {Array.from({ length: NEXRAD_FRAME_COUNT }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleDotClick(i)}
            className="p-0 border-0 bg-transparent cursor-pointer"
            aria-label={`Radar frame ${getFrameLabel(i)}`}
          >
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full transition-colors ${
                i === activeFrame ? "bg-plasma-orange" : "bg-white/20"
              }`}
            />
          </button>
        ))}
      </div>

      {/* Frame age label */}
      <span className="text-[10px] font-mono text-gray-500 tabular-nums min-w-[48px] text-right">
        {getFrameLabel(activeFrame)}
      </span>
    </div>
  );
}
