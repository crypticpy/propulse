/**
 * Sync modules barrel export and registration.
 *
 * Call registerAllModules() once after SyncManager is created to wire up
 * all sync modules. Modules are organized by tier:
 *
 * Tier 1 (Eager, 5s debounce): profile, preferences, targets, shack
 * Tier 3 (Lazy, immediate): watches, pins, skeds, alert rules
 * Tier 2 (Incremental, 30s batch): logbook, contests
 */

import { SyncManager } from "../SyncManager";
import { profileSync } from "./profileSync";
import { preferencesSync } from "./preferencesSync";
import { targetsSync } from "./targetsSync";
import { watchSync } from "./watchSync";
import { pinSync } from "./pinSync";
import { skedSync } from "./skedSync";
import { alertRuleSync } from "./alertRuleSync";
import { logbookSync } from "./logbookSync";
import { contestSync } from "./contestSync";
import { shackSync } from "./shackSync";
import { useProfileStore } from "@/stores/profileStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useShackStore } from "@/stores/shackStore";

/** Register all sync modules with the SyncManager singleton */
export function registerAllModules(): void {
  const manager = SyncManager.getInstance();

  // Tier 1 — Eager (5s debounce, full blob push)
  manager.registerModule(profileSync);
  manager.registerModule(preferencesSync);
  manager.registerModule(targetsSync);
  manager.registerModule(shackSync);

  // Tier 2 — Incremental (30s batch flush, delta sync)
  manager.registerModule(logbookSync);
  manager.registerModule(contestSync);

  // Tier 3 — Lazy (immediate on CRUD)
  manager.registerModule(watchSync);
  manager.registerModule(pinSync);
  manager.registerModule(skedSync);
  manager.registerModule(alertRuleSync);

  // ── Store → Sync wiring ───────────────────────────────────────────────
  // Subscribe to Tier 1 stores so any state change schedules an eager push.
  // The 5s debounce inside SyncManager prevents rapid-fire network calls.
  useProfileStore.subscribe(() => manager.markDirty("eager"));
  useSettingsStore.subscribe(() => manager.markDirty("eager"));
  useShackStore.subscribe(() => manager.markDirty("eager"));
}

// Re-export individual modules for direct access
export { profileSync } from "./profileSync";
export { preferencesSync } from "./preferencesSync";
export { targetsSync } from "./targetsSync";
export { logbookSync } from "./logbookSync";
export { contestSync } from "./contestSync";
export { watchSync } from "./watchSync";
export { pinSync } from "./pinSync";
export { skedSync } from "./skedSync";
export { alertRuleSync } from "./alertRuleSync";
export { shackSync } from "./shackSync";
