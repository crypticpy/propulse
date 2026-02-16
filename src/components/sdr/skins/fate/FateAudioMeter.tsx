/**
 * FateAudioMeter -- Compact horizontal audio level indicator.
 *
 * Shows peak + RMS audio input level. Color-coded:
 * green (good, -30 to -12 dBFS), amber (hot, -12 to -6 dBFS),
 * red (clipping, > -3 dBFS).
 *
 * When no audio input, shows a muted "No Audio" indicator.
 * When levels are persistently too low, shows "Low" warning.
 */

import { useEffect, useRef, useState, useCallback } from "react";

// ---- Constants ----------------------------------------------------------------

/** Threshold in dBFS below which we consider audio "too low" */
const LOW_THRESHOLD_DB = -40;
/** How many seconds of persistently low audio before showing warning */
const LOW_PERSIST_SEC = 5;

/** Color stops */
const COLOR_GREEN = "#00ff88";
const COLOR_AMBER = "#ffaa00";
const COLOR_RED = "#ff3344";

/** dBFS range for the meter */
const METER_MIN_DB = -60;
const METER_MAX_DB = 0;

// Peak hold decay: lose ~1.5 dB per frame (~60fps => ~90 dB/s max)
const PEAK_DECAY_DB_PER_FRAME = 1.5;

// ---- Props --------------------------------------------------------------------

interface FateAudioMeterProps {
  analyserNode: AnalyserNode | null;
}

// ---- Helpers ------------------------------------------------------------------

function dbToPercent(db: number): number {
  const clamped = Math.max(METER_MIN_DB, Math.min(METER_MAX_DB, db));
  return ((clamped - METER_MIN_DB) / (METER_MAX_DB - METER_MIN_DB)) * 100;
}

function dbToColor(db: number): string {
  if (db > -3) return COLOR_RED;
  if (db > -12) return COLOR_AMBER;
  return COLOR_GREEN;
}

// ---- Component ----------------------------------------------------------------

export function FateAudioMeter({ analyserNode }: FateAudioMeterProps) {
  const [rmsDb, setRmsDb] = useState<number>(METER_MIN_DB);
  const [peakDb, setPeakDb] = useState<number>(METER_MIN_DB);
  const [isLow, setIsLow] = useState(false);

  const rafRef = useRef<number>(0);
  const bufferRef = useRef<Uint8Array | null>(null);
  const peakHoldRef = useRef<number>(METER_MIN_DB);
  const lowStartRef = useRef<number>(0);

  const tick = useCallback(() => {
    if (!analyserNode) return;

    // Lazy-allocate the buffer
    if (
      !bufferRef.current ||
      bufferRef.current.length !== analyserNode.fftSize
    ) {
      bufferRef.current = new Uint8Array(analyserNode.fftSize);
    }

    const buffer = bufferRef.current;
    analyserNode.getByteTimeDomainData(buffer);

    // Compute RMS and peak from unsigned byte (128 = silence)
    let sumSq = 0;
    let maxAbs = 0;
    const len = buffer.length;
    for (let i = 0; i < len; i++) {
      // Normalize: 0..255 => -1..+1 (128 = 0)
      const sample = (buffer[i] - 128) / 128;
      sumSq += sample * sample;
      const abs = Math.abs(sample);
      if (abs > maxAbs) maxAbs = abs;
    }

    const rms = Math.sqrt(sumSq / len);

    // Convert to dBFS (clamp to avoid -Infinity)
    const currentRmsDb = rms > 0 ? 20 * Math.log10(rms) : METER_MIN_DB;
    const currentPeakDb = maxAbs > 0 ? 20 * Math.log10(maxAbs) : METER_MIN_DB;

    // Peak hold with slow decay
    if (currentPeakDb >= peakHoldRef.current) {
      peakHoldRef.current = currentPeakDb;
    } else {
      peakHoldRef.current = Math.max(
        METER_MIN_DB,
        peakHoldRef.current - PEAK_DECAY_DB_PER_FRAME,
      );
    }

    // Low-level detection
    const now = performance.now();
    if (currentRmsDb < LOW_THRESHOLD_DB) {
      if (lowStartRef.current === 0) {
        lowStartRef.current = now;
      } else if (now - lowStartRef.current > LOW_PERSIST_SEC * 1000) {
        setIsLow(true);
      }
    } else {
      lowStartRef.current = 0;
      setIsLow(false);
    }

    setRmsDb(currentRmsDb);
    setPeakDb(peakHoldRef.current);

    rafRef.current = requestAnimationFrame(tick);
  }, [analyserNode]);

  // Start / stop the animation loop
  useEffect(() => {
    if (!analyserNode) {
      // Reset state when no analyser
      setRmsDb(METER_MIN_DB);
      setPeakDb(METER_MIN_DB);
      peakHoldRef.current = METER_MIN_DB;
      lowStartRef.current = 0;
      setIsLow(false);
      return;
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [analyserNode, tick]);

  // ---- No audio state ---------------------------------------------------------

  if (!analyserNode) {
    return (
      <div
        className="flex items-center justify-center rounded border border-white/5 bg-[#0c0c16]"
        style={{ width: 120, height: 16 }}
      >
        <span className="text-[9px] font-mono text-gray-600">No Audio</span>
      </div>
    );
  }

  // ---- Rendering --------------------------------------------------------------

  const rmsPct = dbToPercent(rmsDb);
  const peakPct = dbToPercent(peakDb);
  const barColor = dbToColor(rmsDb);
  const isClipping = rmsDb > -3;
  const isHot = rmsDb > -12;

  return (
    <div
      className="flex items-center gap-1.5 rounded border border-white/5 bg-[#0c0c16] px-1.5"
      style={{ width: 120, height: 16 }}
      title={`RMS: ${rmsDb.toFixed(1)} dBFS | Peak: ${peakDb.toFixed(1)} dBFS`}
    >
      {/* Bar container */}
      <div className="relative flex-1 h-[6px] rounded-sm bg-black/40 overflow-hidden">
        {/* RMS bar */}
        <div
          className="absolute inset-y-0 left-0 rounded-sm transition-[width] duration-75"
          style={{
            width: `${rmsPct}%`,
            backgroundColor: barColor,
            boxShadow: isClipping
              ? `0 0 6px ${COLOR_RED}80`
              : isHot
                ? `0 0 4px ${COLOR_AMBER}40`
                : undefined,
          }}
        />

        {/* Peak hold indicator (thin line) */}
        {peakPct > 0 && (
          <div
            className="absolute inset-y-0 w-px"
            style={{
              left: `${peakPct}%`,
              backgroundColor: dbToColor(peakDb),
              opacity: 0.8,
            }}
          />
        )}

        {/* Clipping flash overlay */}
        {isClipping && (
          <div className="absolute inset-0 bg-alert-red/20 animate-pulse rounded-sm" />
        )}
      </div>

      {/* Label */}
      <span
        className="text-[8px] font-mono tabular-nums leading-none shrink-0"
        style={{
          width: 28,
          textAlign: "right",
          color: isLow
            ? COLOR_AMBER
            : isClipping
              ? COLOR_RED
              : isHot
                ? COLOR_AMBER
                : "rgba(255,255,255,0.4)",
        }}
      >
        {isLow ? "Low" : `${Math.max(METER_MIN_DB, rmsDb).toFixed(0)}`}
      </span>
    </div>
  );
}
