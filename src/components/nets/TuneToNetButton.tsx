/**
 * TuneToNetButton — Sends a tune command to the radio via the bridge.
 *
 * Parses a human-readable frequency string (e.g., "146.520 MHz") into Hz
 * and maps the net mode to the bridge's RigMode format, then fires
 * rig.setFrequency + rig.setMode commands over the bridge WebSocket.
 */

import { useState, useCallback } from "react";
import { useBridge } from "@/hooks/useBridge";
import type { RigMode } from "@/types/bridge";

interface TuneToNetButtonProps {
  /** Human-readable frequency, e.g. "146.520 MHz" */
  frequency: string;
  /** Operating mode, e.g. "FM", "SSB", "CW" */
  mode: string;
  /** Render icon-only compact variant */
  compact?: boolean;
}

/** Map common net mode labels to bridge RigMode values */
function toBridgeMode(mode: string): RigMode | string {
  const upper = mode.trim().toUpperCase();
  const map: Record<string, RigMode> = {
    FM: "FM",
    AM: "AM",
    CW: "CW",
    SSB: "USB", // default SSB to USB; nets typically specify if LSB
    USB: "USB",
    LSB: "LSB",
    RTTY: "RTTY",
    FT8: "FT8",
    FT4: "FT4",
    PSK: "PSK",
    DATA: "DATA",
  };
  return map[upper] ?? upper;
}

/** Extract numeric MHz from a frequency string and convert to Hz */
function parseFrequencyHz(freq: string): number {
  const numeric = parseFloat(freq.replace(/[^0-9.]/g, ""));
  if (Number.isNaN(numeric)) return 0;
  // Assume MHz — multiply to Hz
  return Math.round(numeric * 1_000_000);
}

const RadioTowerIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    width={size}
    height={size}
    className="shrink-0"
  >
    <path
      d="M8 10v5M5 15h6M4 6a4 4 0 018 0M2 3.5a7 7 0 0112 0"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="8" cy="8" r="1" fill="currentColor" />
  </svg>
);

type TunePhase = "idle" | "tuning" | "tuned";

export default function TuneToNetButton({
  frequency,
  mode,
  compact = false,
}: TuneToNetButtonProps) {
  const { connected, send } = useBridge();
  const [phase, setPhase] = useState<TunePhase>("idle");

  const handleTune = useCallback(() => {
    if (!connected || phase !== "idle") return;

    const hz = parseFrequencyHz(frequency);
    if (hz === 0) return;

    send("rig.setFrequency", { frequency: hz });
    send("rig.setMode", { mode: toBridgeMode(mode) });

    setPhase("tuning");
    setTimeout(() => {
      setPhase("tuned");
      setTimeout(() => setPhase("idle"), 1500);
    }, 500);
  }, [connected, phase, frequency, mode, send]);

  const label =
    phase === "tuning"
      ? "Tuning..."
      : phase === "tuned"
        ? "Tuned!"
        : "Tune to Net";

  const tooltip = !connected
    ? "Connect bridge to tune"
    : phase === "tuned"
      ? `Tuned to ${frequency}`
      : `Tune radio to ${frequency} ${mode}`;

  const base = compact
    ? "p-1.5 rounded-lg"
    : "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium";

  const colors = !connected
    ? "bg-white/5 text-gray-500 cursor-not-allowed border border-white/5"
    : phase === "tuned"
      ? "bg-signal-green/20 text-signal-green border border-signal-green/30"
      : "bg-plasma-orange/20 text-plasma-orange hover:bg-plasma-orange/30 border border-plasma-orange/30";

  const transition = "transition-colors duration-200";

  return (
    <button
      type="button"
      onClick={handleTune}
      disabled={!connected || phase !== "idle"}
      title={tooltip}
      className={`${base} ${colors} ${transition}`}
    >
      <RadioTowerIcon size={compact ? 14 : 16} />
      {!compact && <span>{label}</span>}
    </button>
  );
}
