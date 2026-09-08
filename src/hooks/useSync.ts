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

import { useEffect } from "react";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { isSupabaseConfigured } from "@/lib/supabase";
import { SyncManager } from "@/lib/sync";
import { registerAllModules } from "@/lib/sync/modules";
import { useViewLibrarySession } from "./useViewLibrarySession";
import { useViewLibrarySessionStore } from "@/stores/viewLibrarySessionStore";

/** Track whether modules have been registered (app-lifetime singleton) */
let modulesRegistered = false;

export function useSync(): void {
  // Capture the original device settings before legacy account sync can replace them.
  useViewLibrarySession();
  const initialized = useAuthStore((s) => s.initialized);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const session = useAuthStore((s) => s.session);
  const libraryPhase = useViewLibrarySessionStore((s) => s.phase);
  const libraryEpoch = useViewLibrarySessionStore((s) => s.epoch);

  useEffect(() => {
    const library = useViewLibrarySessionStore.getState();
    if (!isSupabaseConfigured || !initialized || !isAuthenticated || !userId ||
      library.phase !== "ready" || library.ownerId !== userId || library.epoch !== libraryEpoch) return;

    if (!modulesRegistered) {
      registerAllModules();
      modulesRegistered = true;
    }
    const manager = SyncManager.getInstance();
    // Invalidate synchronously at the store transition, before React's passive cleanup.
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      const auth = useAuthStore.getState();
      void manager.stop({ preserveMetadata: auth.session !== null && auth.user?.id === userId });
    };
    const invalidate = () => {
      const auth = useAuthStore.getState();
      const current = useViewLibrarySessionStore.getState();
      if (!auth.initialized || auth.session !== session || auth.user?.id !== userId ||
        current.phase !== "ready" || current.epoch !== libraryEpoch || current.ownerId !== userId) stop();
    };
    const unsubscribeAuth = useAuthStore.subscribe(invalidate);
    const unsubscribeLibrary = useViewLibrarySessionStore.subscribe(invalidate);
    void manager.start(userId);
    return () => { unsubscribeAuth(); unsubscribeLibrary(); stop(); };
  }, [initialized, isAuthenticated, userId, session, libraryPhase, libraryEpoch]);
}
