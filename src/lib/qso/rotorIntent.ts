/**
 * Turn-beam intent.
 *
 * Mirrors the `applyLogIntent("tune")` spine: the caller expresses intent, the
 * store stages a pending command, and useRigBridgeSync flushes it to the
 * bridge. One click = one explicit move; nothing here auto-tracks.
 */

import {
  canTurnBeam,
  resolveActiveRotator,
} from "@/lib/station/rotorAvailability";
import { useKioskStore } from "@/stores/kioskStore";
import { useOpsPostureStore } from "@/stores/opsPostureStore";
import { useRigStore } from "@/stores/rigStore";
import { useShackStore } from "@/stores/shackStore";

export type RotorIntentResult =
  | { status: "ok"; azimuth: number }
  | { status: "ignored"; reason: "kiosk" | "unavailable" | "invalid-bearing" };

export interface TurnBeamOptions {
  /** Turn to the long path instead. Explicit only — never the default. */
  longPath?: boolean;
}

/** Normalize any bearing into [0, 360). */
export function normalizeAzimuth(bearing: number): number {
  // Already in range: return as-is so float modulo cannot perturb the value.
  if (bearing >= 0 && bearing < 360) return bearing;
  return ((bearing % 360) + 360) % 360;
}

/**
 * Turn the beam to a bearing. Ignored in kiosk, and ignored whenever the
 * Turn beam gate is closed (no chained rotator, no bridge rotor capability,
 * or rotctld disconnected).
 */
export function turnBeamToBearing(
  bearing: number,
  options: TurnBeamOptions = {},
): RotorIntentResult {
  if (useKioskStore.getState().active) {
    return { status: "ignored", reason: "kiosk" };
  }
  if (!Number.isFinite(bearing)) {
    return { status: "ignored", reason: "invalid-bearing" };
  }

  const shack = useShackStore.getState();
  const rig = useRigStore.getState();
  const rotator = resolveActiveRotator(shack);
  const available = canTurnBeam({
    rotator,
    bridgeCapabilities: rig.bridgeCapabilities,
    rotorStatus: rig.rotorStatus,
    kioskActive: false,
    posture: useOpsPostureStore.getState().posture,
  });
  if (!available) {
    return { status: "ignored", reason: "unavailable" };
  }

  const azimuth = normalizeAzimuth(options.longPath ? bearing + 180 : bearing);

  const elevation = rig.rotorStatus?.elevation;
  const isAzEl =
    rotator?.rotatorType === "az_el" || rotator?.rotatorType === "elevation";
  if (isAzEl && typeof elevation === "number" && Number.isFinite(elevation)) {
    rig.setPendingRotorHeading({ azimuth, elevation });
  } else {
    rig.setPendingRotorHeading({ azimuth });
  }
  return { status: "ok", azimuth };
}
