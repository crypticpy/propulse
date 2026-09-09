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
  /** Source-specific missing-context reason; prevents staging a command. */
  unavailableReason?: string;
  variant?: "default" | "chip";
}

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-su-info";

/** Explicit target and visible disabled reason; never opens a hardware connection. */
export function TuneButton({
  frequencyKHz,
  mode,
  wall,
  unavailableReason,
  variant = "default",
}: TuneButtonProps) {
  const wallLayout = useMapStore((state) => state.layoutMode === "hamclock");
  const theme = useHamClockDisplayStore((state) => state.theme);
  const catEnabled = useRigStore((state) => state.catEnabled);
  const bridgeConnected = useRigStore((state) => state.bridgeConnected);
  const connected = useRigStore((state) => state.connected);
  const bridgeEnabled = useSettingsStore((state) => state.bridgeEnabled);
  const kiosk = useKioskStore((state) => state.active);
  if (!catEnabled) return null;
  const reason =
    unavailableReason ||
    tuneDisabledReason(
      { catEnabled, bridgeConnected, connected, bridgeEnabled, kiosk },
      frequencyKHz,
    );
  const target = Number.isFinite(frequencyKHz)
    ? (frequencyKHz / 1000).toFixed(6).replace(/0+$/, "").replace(/\.$/, "")
    : "—";
  const modeSuffix =
    mode === null ? " (mode unchanged)" : mode ? ` ${mode}` : "";
  const buttonProps = {
    disabled: reason !== null,
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (reason === null) queueTune(frequencyKHz, mode);
    },
    "aria-label": `Tune ${target} MHz${modeSuffix}${reason ? `: ${reason}` : ""}`,
  };

  if (variant === "chip") {
    return (
      <button
        type="button"
        {...buttonProps}
        title={reason ?? `Tune ${target} MHz`}
        className={`inline-flex h-8 min-h-8 min-w-8 shrink-0 items-center gap-1 rounded-md border border-su-line/50 bg-su-input px-2 font-mono text-xs leading-none text-su-text disabled:cursor-not-allowed disabled:text-su-muted ${FOCUS_RING}`}
      >
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${reason ? "bg-su-muted" : "bg-su-success"}`}
        />
        <span className="whitespace-nowrap">TUNE {target}</span>
        {reason && (
          <span className="whitespace-nowrap text-su-muted"> · {reason}</span>
        )}
      </button>
    );
  }

  const content = (
    <>
      TUNE {target}
      {reason && <span> · {reason}</span>}
    </>
  );
  return (wall ?? wallLayout) ? (
    <HamClockButton {...buttonProps} data-hamclock-theme={theme}>
      {content}
    </HamClockButton>
  ) : (
    <button
      type="button"
      {...buttonProps}
      className={`min-h-11 min-w-11 inline-flex items-center justify-center gap-1 rounded-md border border-su-line bg-su-panel px-3 py-2 font-mono text-xs text-su-accent disabled:cursor-not-allowed disabled:text-su-muted ${FOCUS_RING}`}
    >
      {content}
    </button>
  );
}
