import { useEffect, useRef, useState } from "react";
import { useRigStore } from "@/stores/rigStore";
import { formatFreqMHz } from "@/lib/utils/satellite";

/**
 * OnAirBanner - prominent transmit indicator (parity item G23).
 *
 * Floats top-center whenever the connected rig reports PTT active, with the
 * live frequency/mode and a running TX timer. Rendered in Layout on every
 * route including kiosk mode (a wall display should shout when the station
 * is transmitting); sits below the kiosk break-in takeover (z-700).
 */
export function OnAirBanner() {
  const ptt = useRigStore((s) => s.ptt);
  const connected = useRigStore((s) => s.connected);
  const frequency = useRigStore((s) => s.frequency);
  const mode = useRigStore((s) => s.mode);

  const onAir = connected && ptt;
  const [elapsedSec, setElapsedSec] = useState(0);
  const startedAt = useRef<number>(0);

  useEffect(() => {
    if (!onAir) {
      setElapsedSec(0);
      return;
    }
    startedAt.current = Date.now();
    setElapsedSec(0);
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [onAir]);

  if (!onAir) return null;

  const minutes = Math.floor(elapsedSec / 60);
  const seconds = elapsedSec % 60;
  const timerText = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <div
      className="fixed top-16 left-1/2 -translate-x-1/2 z-[600] pointer-events-none"
      role="status"
      aria-label={`Transmitting on ${formatFreqMHz(frequency)} ${mode}`}
    >
      <div className="flex items-center gap-3 px-5 py-2 rounded-xl bg-alert-red/15 border-2 border-alert-red shadow-lg shadow-alert-red/30 backdrop-blur">
        <span className="w-3 h-3 rounded-full bg-alert-red animate-pulse" />
        <span className="font-orbitron text-lg text-alert-red tracking-[0.25em]">
          ON AIR
        </span>
        <span className="font-mono text-sm text-gray-200 tabular-nums">
          {formatFreqMHz(frequency)} {mode}
        </span>
        <span className="font-mono text-sm text-gray-400 tabular-nums">
          TX {timerText}
        </span>
      </div>
    </div>
  );
}
