/**
 * Turn-beam gating.
 *
 * The Turn beam control only exists when a real rotator is wired into the
 * active Ham Shack chain AND the bridge actually speaks the rotor protocol.
 * Everything here is pure so the gate can be unit-tested without a bridge.
 */

import type { OpsPosture } from "@/lib/map/contactMapPolicy";
import {
  resolveOperatingChain,
  type StationStampSource,
} from "@/lib/station/stationLogStamp";
import type { RotorStatusPayload } from "@/types/bridge";
import type { RotatorAccessory } from "@/types/shack";

/** Capability string advertised by the bridge welcome message. */
export const ROTOR_CAPABILITY = "rotor";

/**
 * The rotator attached to the active operating chain, or null.
 *
 * Rotators are shack accessories, so they can be referenced either as an
 * accessory node in the signal path or through `shackAccessoryIds`. If no
 * chain is active, or the chain references no rotator, the answer is null —
 * owning a rotator in inventory is never enough to command hardware.
 */
export function resolveActiveRotator(
  shack: StationStampSource,
): RotatorAccessory | null {
  const chain = resolveOperatingChain(shack);
  if (!chain) return null;

  const referenced = new Set<string>(chain.shackAccessoryIds);
  for (const node of chain.nodes) {
    if (node.type === "accessory") referenced.add(node.accessoryId);
  }
  if (referenced.size === 0) return null;

  const rotator = shack.accessories.find(
    (accessory) =>
      accessory.category === "rotator" && referenced.has(accessory.id),
  );
  return rotator ? (rotator as RotatorAccessory) : null;
}

export interface TurnBeamGate {
  /** Rotator resolved from the active chain (see resolveActiveRotator). */
  rotator: RotatorAccessory | null;
  /** Capabilities from the bridge welcome message. */
  bridgeCapabilities: string[];
  /** Latest rotor status pushed by the bridge. */
  rotorStatus: RotorStatusPayload | null;
  /** Kiosk/wall displays never command hardware. */
  kioskActive: boolean;
  /** Current ops posture. */
  posture: OpsPosture;
}

/**
 * Whether the Turn beam control may be shown at all. A false answer means the
 * button is not rendered — a dead button is worse than no button.
 */
export function canTurnBeam(gate: TurnBeamGate): boolean {
  if (!gate.rotator) return false;
  if (gate.kioskActive) return false;
  if (gate.posture !== "contact" && gate.posture !== "desk") return false;
  if (!gate.bridgeCapabilities.includes(ROTOR_CAPABILITY)) return false;
  return gate.rotorStatus?.connected === true;
}
