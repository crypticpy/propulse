/**
 * useRequireAuth — Hook that gates an action behind authentication.
 *
 * Returns a function that either runs the callback immediately (if
 * authenticated or Supabase isn't configured) or opens the auth modal
 * with a contextual prompt and defers the callback.
 */

import { useCallback } from "react";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { useAuthUIStore } from "@/stores/authUIStore";
import { isSupabaseConfigured } from "@/lib/supabase";

export function useRequireAuth() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const openAuthModal = useAuthUIStore((s) => s.openAuthModal);

  return useCallback(
    (callback: () => void, prompt?: string) => {
      if (!isSupabaseConfigured || isAuthenticated) {
        callback();
        return;
      }
      openAuthModal(prompt, callback);
    },
    [isAuthenticated, openAuthModal],
  );
}
