import "@/styles/hamclock-themes.css";
import "@/styles/hamclock-wall-controls.css";
import type { MouseEvent } from "react";
import { useMapStore } from "@/stores/mapStore";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { useRigStore } from "@/stores/rigStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useKioskStore } from "@/stores/kioskStore";
import { queueTune, tuneDisabledReason } from "@/lib/radio/tune";
import { HamClockButton } from "@/components/map/hamclock/wall/controls";

export interface TuneButtonProps {
  frequencyKHz: number;
  /** Null stages frequency only, preserving the radio’s observed mode. */
  mode?: string | null;
  wall?: boolean;
}

/** Explicit target and visible disabled reason; never opens a hardware connection. */
export function TuneButton({ frequencyKHz, mode, wall }: TuneButtonProps) {
  const wallLayout = useMapStore((state) => state.layoutMode === "hamclock");
  const theme = useHamClockDisplayStore((state) => state.theme);
  const catEnabled = useRigStore((state) => state.catEnabled);
  const bridgeConnected = useRigStore((state) => state.bridgeConnected);
  const connected = useRigStore((state) => state.connected);
  const bridgeEnabled = useSettingsStore((state) => state.bridgeEnabled);
  const kiosk = useKioskStore((state) => state.active);
  if (!catEnabled) return null;
  const reason = tuneDisabledReason({ catEnabled, bridgeConnected, connected, bridgeEnabled, kiosk }, frequencyKHz);
  const target = Number.isFinite(frequencyKHz) ? (frequencyKHz / 1000).toFixed(6).replace(/0+$/, "").replace(/\.$/, "") : "—";
  const props = {
    disabled: reason !== null,
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      queueTune(frequencyKHz, mode);
    },
    "aria-label": `Tune ${target} MHz${mode === null ? " (mode unchanged)" : mode ? ` ${mode}` : ""}${reason ? `: ${reason}` : ""}`,
  };
  const content = <>TUNE {target}{reason && <span> · {reason}</span>}</>;
  return (wall ?? wallLayout) ? <HamClockButton {...props} data-hamclock-theme={theme}>{content}</HamClockButton> : (
    <button type="button" {...props} className="min-h-11 min-w-11 inline-flex items-center justify-center gap-1 rounded-md border border-white/15 bg-white/5 px-3 py-2 font-mono text-xs text-cyan-300 disabled:cursor-not-allowed disabled:text-gray-400">
      {content}
    </button>
  );
}
