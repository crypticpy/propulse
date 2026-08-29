/**
 * useLanSettingsSync — HamTab-style shared settings across shack devices.
 *
 * When the app is served by the bridge (connectivity tier "lan"), poll the
 * bridge's shared settings blob and apply newer versions automatically.
 * Publishing is explicit (pushSettingsToBridge, from the Settings page) so a
 * transient tweak on one device never silently overwrites the whole shack.
 */

import { useEffect } from "react";
import { useDataSourceStatus } from "@/stores/dataSourceStatusStore";
import {
  exportSettings,
  importSettings,
  validateBackup,
  type SettingsBackup,
} from "@/lib/utils/settingsBackup";

const ENDPOINT = "/api/bridge/settings";
const POLL_MS = 30_000;
/** localStorage marker: updatedAt of the blob this device last applied/pushed. */
const APPLIED_KEY = "propulse-lan-settings-applied";

/** Publish this device's settings as the shack-wide blob. */
export async function pushSettingsToBridge(): Promise<string> {
  const response = await fetch(ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(exportSettings()),
  });
  if (!response.ok) {
    throw new Error(`Bridge rejected settings (${response.status})`);
  }
  const { updatedAt } = (await response.json()) as { updatedAt: string };
  // Mark our own push as applied so the next poll doesn't re-import it
  localStorage.setItem(APPLIED_KEY, updatedAt);
  return updatedAt;
}

export function useLanSettingsSync(): void {
  const isLan = useDataSourceStatus((s) => s.connectivity === "lan");

  useEffect(() => {
    if (!isLan) return;
    let cancelled = false;

    const pull = async () => {
      try {
        const response = await fetch(ENDPOINT);
        if (!response.ok) return;
        const payload = (await response.json()) as {
          updatedAt: string | null;
          backup: unknown;
        };
        if (cancelled || !payload.updatedAt || payload.backup === null) return;
        if (localStorage.getItem(APPLIED_KEY) === payload.updatedAt) return;
        const check = validateBackup(payload.backup);
        if (!check.valid) return;
        importSettings(payload.backup as SettingsBackup);
        localStorage.setItem(APPLIED_KEY, payload.updatedAt);
      } catch {
        // Bridge unreachable — try again on the next poll
      }
    };

    void pull();
    const id = setInterval(() => void pull(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isLan]);
}
