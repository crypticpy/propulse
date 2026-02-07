/**
 * useSync — Side-effect hook for SyncManager lifecycle.
 *
 * Call once in the root layout component. Initializes the sync engine
 * when the user is authenticated, and stops it on sign-out.
 *
 * Does nothing when:
 * - Auth is not yet initialized
 * - Supabase is not configured (no-account mode)
 * - User is not authenticated
 */

import { useEffect, useRef } from "react";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { isSupabaseConfigured } from "@/lib/supabase";
import { SyncManager } from "@/lib/sync";
import { registerAllModules } from "@/lib/sync/modules";

/** Track whether modules have been registered (app-lifetime singleton) */
let modulesRegistered = false;

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

      // Register sync modules once on first auth
      if (!modulesRegistered) {
        registerAllModules();
        modulesRegistered = true;
      }

      startedForUser.current = userId;
      const manager = SyncManager.getInstance();
      void manager.start(userId);
    } else {
      // Not authenticated — stop sync if running
      if (startedForUser.current) {
        startedForUser.current = null;
        if (SyncManager.hasInstance()) {
          void SyncManager.getInstance().stop();
        }
      }
    }
  }, [initialized, isAuthenticated, userId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (SyncManager.hasInstance()) {
        void SyncManager.getInstance().stop();
      }
    };
  }, []);
}
