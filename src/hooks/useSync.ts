/**
 * useSync — Side-effect hook for SyncManager lifecycle.
 *
 * Call once in the root layout component. Initializes the sync engine
 * when the user is authenticated, and stops it on sign-out.
 *
 * The engine and its per-store modules are loaded on demand so that the
 * sync machinery stays out of the app entry bundle until a signed-in user
 * actually needs it.
 *
 * Does nothing when:
 * - Auth is not yet initialized
 * - Supabase is not configured (no-account mode)
 * - User is not authenticated
 */

import { useEffect, useRef } from "react";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { isSupabaseConfigured } from "@/lib/supabase";

type SyncEngine = typeof import("@/lib/sync/syncBootstrap");

/** Sync engine module, cached once loaded (app-lifetime singleton) */
let syncEngine: SyncEngine | null = null;

/** Track whether modules have been registered (app-lifetime singleton) */
let modulesRegistered = false;

async function loadSyncEngine(): Promise<SyncEngine> {
  if (!syncEngine) {
    const engine = await import("@/lib/sync/syncBootstrap");
    if (!modulesRegistered) {
      engine.registerAllModules();
      modulesRegistered = true;
    }
    syncEngine = engine;
  }
  return syncEngine;
}

/** Stop the engine if it was ever started; a never-loaded engine has nothing to stop. */
function stopSyncEngine(): void {
  if (syncEngine?.SyncManager.hasInstance()) {
    void syncEngine.SyncManager.getInstance().stop();
  }
}

export function useSync(): void {
  const initialized = useAuthStore((s) => s.initialized);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const startedForUser = useRef<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !initialized) return;

    if (isAuthenticated && userId) {
      // Already started for this user — no-op
      if (startedForUser.current === userId) return;

      startedForUser.current = userId;
      void loadSyncEngine()
        .then(({ SyncManager }) => {
          // Signed out (or switched users) while the engine was loading
          if (startedForUser.current !== userId) return;
          void SyncManager.getInstance().start(userId);
        })
        .catch((error: unknown) => {
          // Chunk failed to load (stale deploy, offline): let a later auth
          // change retry instead of leaving sync silently disabled.
          if (startedForUser.current === userId) startedForUser.current = null;
          console.error("[useSync] Failed to load sync engine", error);
        });
    } else {
      // Not authenticated — stop sync if running
      if (startedForUser.current) {
        startedForUser.current = null;
        stopSyncEngine();
      }
    }
  }, [initialized, isAuthenticated, userId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSyncEngine();
    };
  }, []);
}
