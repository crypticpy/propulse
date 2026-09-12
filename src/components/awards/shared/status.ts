/**
 * Shared status vocabulary for award slot grids (DXCC, WAS, WAZ).
 *
 * One `statusBg` / `statusText` / `statusLabel` / `STATUS_OPTIONS` set for
 * all three award grids, so a status-colour or wording change is one edit
 * instead of three. See issue #1095.
 */

import type { SlotStatus } from "@/lib/awards/types";

export type StatusFilterValue = SlotStatus | "all";

/** Summary legend swatch for confirmed slots (60% opacity fill). */
export const legendSwatchConfirmed = "bg-signal-green/60";

/** Summary legend swatch for worked-but-unconfirmed slots. */
export const legendSwatchWorked = "bg-caution-amber/60";

/** Summary legend swatch for needed slots. */
export const legendSwatchNeeded = "bg-su-input";

/** WAS/WAZ progress bar fill for the confirmed segment. */
export const progressFillConfirmed = "bg-signal-green";

/** WAS/WAZ progress bar fill for the worked-unconfirmed segment. */
export const progressFillWorked = "bg-caution-amber";

export function statusBg(status: SlotStatus): string {
  switch (status) {
    case "confirmed":
      return "bg-signal-green/20 border-signal-green/50";
    case "worked_unconfirmed":
      return "bg-caution-amber/20 border-caution-amber/50";
    case "needed":
      return "bg-su-panel/40 border-su-line/40";
  }
}

export function statusText(status: SlotStatus): string {
  switch (status) {
    case "confirmed":
      return "text-signal-green";
    case "worked_unconfirmed":
      return "text-caution-amber";
    case "needed":
      return "text-su-muted";
  }
}

export function statusLabel(status: SlotStatus): string {
  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "worked_unconfirmed":
      return "Worked";
    case "needed":
      return "Needed";
  }
}

export const STATUS_OPTIONS: Array<{
  label: string;
  value: StatusFilterValue;
}> = [
  { label: "All", value: "all" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Worked", value: "worked_unconfirmed" },
  { label: "Needed", value: "needed" },
];
