import type { ViewFamily } from "../contracts";

export const FAMILY_SLOTS = ["normal", "pro", "lite", "hamclock"] as const;
export type FamilySlotId = (typeof FAMILY_SLOTS)[number];
export type ViewSlotId =
  | FamilySlotId
  | `named:${string}`
  | `preview:${string}`
  | `display:${string}`;

const FAMILY_SET = new Set<string>(FAMILY_SLOTS);

export function isFamilySlot(slotId: string): slotId is FamilySlotId {
  return FAMILY_SET.has(slotId);
}

export function familyFromSlot(slotId: string): ViewFamily | null {
  if (isFamilySlot(slotId)) return slotId;
  return null;
}

export function namedSlotId(viewId: string): ViewSlotId {
  return `named:${viewId}`;
}

export function previewSlotId(label: string): ViewSlotId {
  return `preview:${label}`;
}

export function displaySlotId(displayId: string): ViewSlotId {
  return `display:${displayId}`;
}

export function persistsWorkingSlot(kind: "interactive" | "preview" | "display"): boolean {
  return kind === "interactive";
}
