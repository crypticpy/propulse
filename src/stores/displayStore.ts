/**
 * displayStore — device-side identity for a paired Display Wall device (E3).
 *
 * This is the wall device's half of the pairing contract: once
 * POST /api/displays/pair {action:"register"} returns a deviceToken (shown
 * exactly once), it must survive reloads — a Pi reboot or daily kiosk-browser
 * refresh must not lose the device's identity. `syncActive` gates
 * useDisplaySync (see src/hooks/useDisplaySync.ts), which is mounted once in
 * Layout and is a no-op until a display page turns it on.
 *
 * Owner-side management (rename, scene assignment, delete) happens straight
 * through supabase-js under RLS — see DisplaysPage — and does not use this
 * store at all.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { KioskScene, BreakInLevel } from "@/stores/kioskStore";
import type { DisplayFit } from "@/stores/mapStore";
import type { TextScale } from "@/types/user";

/**
 * Scene configuration an owner pushes to a paired display via
 * `displays.scene_config` (jsonb). An empty object ({}) means "unassigned":
 * the device falls back to its own local kioskStore DEFAULT_SCENES.
 */
export interface DisplaySceneConfig {
  scenes?: KioskScene[];
  rotation?: { enabled: boolean; intervalSec: number };
  breakInLevel?: BreakInLevel;
  /** P1: per-display layout override — map fit + text scale for this screen */
  layout?: { fit?: DisplayFit; textScale?: TextScale };
}

interface DisplayDeviceState {
  /** UUID of the `displays` row this device is bound to, or null if unpaired */
  displayId: string | null;
  /** Bearer token for GET /api/displays/state — shown once at registration */
  deviceToken: string | null;
  /** Display name as last reported by the owner (for the holding screen) */
  pairedName: string | null;
  /** Whether useDisplaySync should poll/subscribe for this device */
  syncActive: boolean;

  /** Persist identity after a successful register or a post-claim re-check */
  setIdentity: (displayId: string, deviceToken: string) => void;
  setPairedName: (name: string | null) => void;
  setSyncActive: (active: boolean) => void;
  /** Drop identity entirely — used when the backend reports 404 (unknown display/bad token) */
  clearIdentity: () => void;
}

export const useDisplayStore = create<DisplayDeviceState>()(
  persist(
    (set) => ({
      displayId: null,
      deviceToken: null,
      pairedName: null,
      syncActive: false,

      setIdentity: (displayId, deviceToken) => set({ displayId, deviceToken }),
      setPairedName: (pairedName) => set({ pairedName }),
      setSyncActive: (syncActive) => set({ syncActive }),
      clearIdentity: () =>
        set({
          displayId: null,
          deviceToken: null,
          pairedName: null,
          syncActive: false,
        }),
    }),
    {
      name: "propulse-display-device",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted: unknown) => {
        const state = persisted as Record<string, unknown>;
        return state as unknown as DisplayDeviceState;
      },
    },
  ),
);
