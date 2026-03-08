/**
 * RadarScrubber3D — Compact radar timeline control positioned at the
 * bottom-center of the globe viewport.  Shows play/pause, the current
 * frame's UTC timestamp, frame age, source badge, and a visual progress
 * indicator with clickable dots.
 *
 * Accepts an optional `animationState` from WeatherRadarOverlay to stay
 * in sync with the 3D radar.  Falls back to its own independent timer
 * driven by the RainViewer manifest when animationState is not provided.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useWeatherRadar } from "@/hooks/useWeatherRadar";
import type { RadarAnimationState } from "@/components/map/WeatherRadarOverlay";

const FRAME_INTERVAL_MS = 500;
const LATEST_PAUSE_MS = 2000;

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

/* ── Helpers ──────────────────────────────────────────────────────── */

/** Format a unix timestamp (seconds) to "HH:MMz" */
function formatUtc(ts: number): string {
  return (
    new Date(ts * 1000).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }) + "z"
  );
}

/** Format frame age relative to now, e.g. "5m ago" or "Now" */
function formatAge(ts: number): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const diffMin = Math.round((nowSec - ts) / 60);
  if (diffMin <= 1) return "Now";
  return `${diffMin}m ago`;
}

/* ── Props ───────────────────────────────────────────────────────── */

interface RadarScrubber3DProps {
  /** When provided, syncs with WeatherRadarOverlay instead of running own timer */
  animationState?: RadarAnimationState;
  /** Override for NEXRAD badge when not using animationState */
  showNexradBadge?: boolean;
}

/* ── Main component ───────────────────────────────────────────────── */

export function RadarScrubber3D({
  animationState,
  showNexradBadge,
}: RadarScrubber3DProps) {
  // Fallback: independent timer driven by RainViewer manifest
  const { manifest } = useWeatherRadar(!animationState);
  const fallbackFrames = useMemo(() => manifest?.radar.past ?? [], [manifest]);
  const fallbackTotal = fallbackFrames.length;

  const [fbFrame, setFbFrame] = useState(0);
  const [fbPlaying, setFbPlaying] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clamp fallback frame index when frame count changes
  useEffect(() => {
    if (!animationState && fallbackTotal > 0 && fbFrame >= fallbackTotal) {
      setFbFrame(fallbackTotal - 1);
    }
  }, [animationState, fallbackTotal, fbFrame]);

  // Fallback auto-advance timer (only when no animationState)
  useEffect(() => {
    if (animationState) return;
    if (!fbPlaying || fallbackTotal === 0) return;

    const advance = () => {
      setFbFrame((prev) => {
        const next = (prev + 1) % fallbackTotal;
        const isLatest = next === fallbackTotal - 1;
        intervalRef.current = setTimeout(
          advance,
          isLatest ? LATEST_PAUSE_MS : FRAME_INTERVAL_MS,
        );
        return next;
      });
    };

    intervalRef.current = setTimeout(advance, FRAME_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearTimeout(intervalRef.current);
    };
  }, [animationState, fbPlaying, fallbackTotal]);

  const fbToggle = useCallback(() => setFbPlaying((p) => !p), []);

  // Resolve which values to display
  const synced = !!animationState;
  const total = synced ? animationState.frameCount : fallbackTotal;
  const current = synced ? animationState.activeIndex : fbFrame;
  const playing = synced ? animationState.isPlaying : fbPlaying;
  const hasNexrad = synced
    ? animationState.hasNexrad
    : (showNexradBadge ?? false);

  // Timestamps: from animationState or fallback manifest
  const timestamps = useMemo(() => {
    if (synced) return animationState.timestamps;
    return fallbackFrames.map((f) => f.time);
  }, [synced, animationState, fallbackFrames]);

  const isNowcast = useMemo(() => {
    if (synced) return animationState.isNowcast;
    return fallbackFrames.map(() => false);
  }, [synced, animationState, fallbackFrames]);

  // Handlers — delegate to animationState when synced
  const handleToggle = synced ? animationState.togglePlay : fbToggle;
  const handleDotClick = synced
    ? animationState.setFrame
    : (idx: number) => {
        setFbFrame(idx);
        setFbPlaying(false);
      };

  if (total === 0) return null;

  const currentTs =
    current >= 0 && current < timestamps.length
      ? timestamps[current]
      : undefined;
  const utcLabel = currentTs ? formatUtc(currentTs) : "--:--z";
  const ageLabel = currentTs ? formatAge(currentTs) : "";

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-void-black/80 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">
      {/* Play / Pause */}
      <button
        type="button"
        onClick={handleToggle}
        className="flex-shrink-0 hover:opacity-80 transition-opacity"
        aria-label={playing ? "Pause radar" : "Play radar"}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      {/* UTC timestamp + age */}
      <div className="flex flex-col items-center min-w-[42px]">
        <span className="text-[10px] font-mono text-gray-400 tabular-nums leading-tight">
          {utcLabel}
        </span>
        {ageLabel && (
          <span className="text-[8px] font-mono text-gray-500 leading-tight">
            {ageLabel}
          </span>
        )}
      </div>

      {/* Frame progress dots (clickable) */}
      <div className="flex items-center gap-[3px]">
        {timestamps.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleDotClick(i)}
            className={`inline-block w-1.5 h-1.5 rounded-full transition-colors ${
              i === current
                ? "bg-plasma-orange"
                : isNowcast[i]
                  ? "bg-nebula-blue/40"
                  : "bg-white/20"
            }`}
            aria-label={`Frame ${i + 1}`}
          />
        ))}
      </div>

      {/* Source badge */}
      {hasNexrad && (
        <span className="text-[8px] font-mono font-bold text-signal-green/80 uppercase tracking-wider ml-0.5">
          NEXRAD
        </span>
      )}
    </div>
  );
}
