/**
 * Turn beam control — a hold-to-confirm button, split out of OpsLoggerStrip
 * so its gating (shack/rig/kiosk/posture subscriptions, rotorIntent) does
 * not pull rotor code into the app entry chunk. See #142: turning the beam
 * needs a two-step confirm, not a bare one-click command.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeAzimuth, turnBeamToBearing } from "@/lib/qso/rotorIntent";
import { canTurnBeam, resolveActiveRotator } from "@/lib/station/rotorAvailability";
import { useKioskStore } from "@/stores/kioskStore";
import { useOpsPostureStore } from "@/stores/opsPostureStore";
import { useRigStore } from "@/stores/rigStore";
import { useShackStore } from "@/stores/shackStore";

/** How long an armed control waits for the confirming click before auto-disarming. */
const ARM_TIMEOUT_MS = 3000;

interface ArmedState {
  /** Normalized target azimuth shown in the confirm label and sent as-is. */
  azimuth: number;
}

export interface TurnBeamControlProps {
  /** Short-path bearing to the current map target, in degrees. */
  bearing: number;
}

export function TurnBeamControl({ bearing }: TurnBeamControlProps) {
  const posture = useOpsPostureStore((s) => s.posture);
  const kioskActive = useKioskStore((s) => s.active);
  const bridgeCapabilities = useRigStore((s) => s.bridgeCapabilities);
  const rotorStatus = useRigStore((s) => s.rotorStatus);
  const rigPtt = useRigStore((s) => s.ptt);
  const shackKey = useShackStore(
    (s) =>
      `${s.activeChainId ?? ""}:${s.accessories.length}:${s.stationChains.length}`,
  );

  const [armed, setArmed] = useState<ArmedState | null>(null);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearArmTimer = useCallback(() => {
    if (armTimerRef.current !== null) {
      clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
  }, []);

  const disarm = useCallback(() => {
    clearArmTimer();
    setArmed(null);
  }, [clearArmTimer]);

  useEffect(() => () => clearArmTimer(), [clearArmTimer]);

  const showTurnBeam = canTurnBeam({
    rotator: resolveActiveRotator(useShackStore.getState()),
    bridgeCapabilities,
    rotorStatus,
    kioskActive,
    posture,
  });
  // shackKey is read only to keep the gate re-evaluated on chain/accessory
  // changes; canTurnBeam itself reads live store state above.
  void shackKey;

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!armed) {
        const azimuth = normalizeAzimuth(
          event.shiftKey ? bearing + 180 : bearing,
        );
        setArmed({ azimuth });
        clearArmTimer();
        armTimerRef.current = setTimeout(disarm, ARM_TIMEOUT_MS);
        return;
      }
      clearArmTimer();
      turnBeamToBearing(armed.azimuth);
      setArmed(null);
    },
    [armed, bearing, clearArmTimer, disarm],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "Escape" && armed) {
        event.preventDefault();
        disarm();
      }
    },
    [armed, disarm],
  );

  if (!showTurnBeam) return null;

  return (
    <button
      type="button"
      data-contact-turn-beam
      data-armed={armed ? "true" : undefined}
      disabled={rigPtt}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onBlur={disarm}
      title={
        rigPtt
          ? "PTT is keyed — release before turning the beam"
          : armed
            ? "Click again to confirm"
            : "Turn beam to short path (Shift-click for long path)"
      }
      className={`h-9 rounded-md px-2 font-mono text-[10px] uppercase tracking-wide ${
        rigPtt
          ? "cursor-not-allowed bg-white/5 text-gray-600"
          : armed
            ? "bg-plasma-orange/25 text-plasma-orange hover:bg-plasma-orange/35"
            : "bg-cosmic-cyan/15 text-cosmic-cyan hover:bg-cosmic-cyan/25"
      }`}
    >
      {armed
        ? `Turn to ${Math.round(armed.azimuth).toString().padStart(3, "0")}°?`
        : "Turn beam"}
      {!armed && rotorStatus?.azimuth != null && (
        <span className="ml-1 text-gray-400">
          beam {Math.round(rotorStatus.azimuth)}°
        </span>
      )}
    </button>
  );
}

export default TurnBeamControl;
