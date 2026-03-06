/**
 * RadarScrubber3D — Compact radar timeline control positioned at the
 * bottom-center of the globe viewport.  Shows play/pause, the current
 * frame's UTC timestamp, and a visual progress indicator.
 *
 * This is a standalone UI widget.  It does NOT drive the 3D radar
 * overlay (which auto-animates on its own).  Its purpose is to give
 * the user a sense of radar time progression.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useWeatherRadar } from "@/hooks/useWeatherRadar";

const FRAME_INTERVAL_MS = 500;

/* ── Inline SVG icons (14px) ──────────────────────────────────────── */

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

/* ── Main component ───────────────────────────────────────────────── */

export function RadarScrubber3D() {
  const { manifest } = useWeatherRadar();
  const frames = manifest?.radar.past ?? [];
  const total = frames.length;

  const [currentFrame, setCurrentFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clamp frame index when frame count changes
  useEffect(() => {
    if (total > 0 && currentFrame >= total) {
      setCurrentFrame(total - 1);
    }
  }, [total, currentFrame]);

  // Auto-advance timer
  useEffect(() => {
    if (playing && total > 0) {
      intervalRef.current = setInterval(() => {
        setCurrentFrame((prev) => (prev + 1) % total);
      }, FRAME_INTERVAL_MS);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, total]);

  const togglePlay = useCallback(() => setPlaying((p) => !p), []);

  if (total === 0) return null;

  // Format the frame's unix timestamp as HH:MM UTC
  const frame = frames[currentFrame];
  const utcLabel = frame
    ? new Date(frame.time * 1000).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      }) + "z"
    : "--:--z";

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-void-black/80 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">
      {/* Play / Pause */}
      <button
        type="button"
        onClick={togglePlay}
        className="flex-shrink-0 hover:opacity-80 transition-opacity"
        aria-label={playing ? "Pause radar" : "Play radar"}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      {/* UTC timestamp */}
      <span className="text-[10px] font-mono text-gray-400 tabular-nums min-w-[42px] text-center">
        {utcLabel}
      </span>

      {/* Frame progress dots */}
      <div className="flex items-center gap-[3px]">
        {frames.map((_, i) => (
          <span
            key={i}
            className={`inline-block w-1 h-1 rounded-full transition-colors ${
              i === currentFrame ? "bg-plasma-orange" : "bg-white/20"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
