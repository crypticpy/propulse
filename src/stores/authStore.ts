/**
 * Zustand store for authentication state
 *
 * Manages Supabase Auth sessions, magic-link sign-in, and OAuth flows.
 * Does NOT persist to localStorage — Supabase manages its own session storage.
 * Gracefully handles "no-account mode" when Supabase env vars are not configured.
 */

import { create } from "zustand";
import type { User, Session } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

// ── Module-scoped deduplication & cleanup ────────────────────────────
/** Deduplicates concurrent initialize() calls */
let initPromise: Promise<void> | null = null;

/** Holds the auth listener subscription so it can be cleaned up */
let authSubscription: { unsubscribe: () => void } | null = null;

// ── Email validation ─────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AuthState {
  /** Supabase user object, null if not authenticated */
  user: User | null;
  /** Current session, null if not authenticated */
  session: Session | null;
  /** Whether the auth state has been initialized (checked on load) */
  initialized: boolean;
  /** Whether an auth operation is in progress */
  loading: boolean;
  /** Last auth error message */
  error: string | null;

  /** Check for existing session and set up auth listener. Call once on app boot. */
  initialize: () => Promise<void>;
  /** Send a magic-link email for passwordless sign-in */
  signInWithMagicLink: (email: string) => Promise<void>;
  /** Initiate an OAuth sign-in flow */
  signInWithOAuth: (provider: "google" | "github") => Promise<void>;
  /** Sign out and clear user/session */
  signOut: () => Promise<void>;
  /** Clear the current error */
  clearError: () => void;
  /** Tear down the auth listener (useful for cleanup in tests or HMR) */
  cleanup: () => void;
}

/** Whether the user is currently authenticated */
export function selectIsAuthenticated(state: AuthState): boolean {
  return state.user !== null && state.session !== null;
}

const NO_SUPABASE_ERROR =
  "Authentication is not available — Supabase is not configured.";

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  session: null,
  initialized: false,
  loading: false,
  error: null,

  initialize: () => {
    // Deduplicate concurrent calls — return existing promise if in-flight
    if (initPromise) {
      return initPromise;
    }

    // Already initialized in a previous call
    if (get().initialized) {
      return Promise.resolve();
    }

    // No-account mode: Supabase not configured, skip auth entirely
    if (!isSupabaseConfigured) {
      set({ initialized: true });
      return Promise.resolve();
    }

    initPromise = (async () => {
      try {
        const supabase = getSupabase();

        // Retrieve any existing session
        const {
          data: { session },
        } = await supabase.auth.getSession();

        set({
          user: session?.user ?? null,
          session: session ?? null,
          initialized: true,
        });

        // Listen for auth state changes (sign-in, sign-out, token refresh)
        // C1: Store the subscription so it can be cleaned up
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
          set({
            user: session?.user ?? null,
            session: session ?? null,
          });
        });
        authSubscription = subscription;
      } catch (err) {
        set({
          initialized: true,
          error:
            err instanceof Error ? err.message : "Failed to initialize auth",
        });
      }
    })();

    // Clear the dedup promise once finished (success or failure)
    initPromise.finally(() => {
      initPromise = null;
    });

    return initPromise;
  },

  signInWithMagicLink: async (email: string) => {
    if (!isSupabaseConfigured) {
      set({ error: NO_SUPABASE_ERROR });
      return;
    }

    // M5: Basic email validation before calling Supabase
    if (!EMAIL_RE.test(email)) {
      set({ error: "Please enter a valid email address." });
      return;
    }

    set({ loading: true, error: null });

    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signInWithOtp({ email });

      if (error) {
        set({ error: error.message, loading: false });
        return;
      }

      set({ loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to send magic link",
        loading: false,
      });
    }
  },

  signInWithOAuth: async (provider: "google" | "github") => {
    if (!isSupabaseConfigured) {
      set({ error: NO_SUPABASE_ERROR });
      return;
    }

    set({ loading: true, error: null });

    try {
      const supabase = getSupabase();
      // M4: Preserve current path in redirect URL
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}${window.location.pathname}`,
        },
      });

      if (error) {
        set({ error: error.message, loading: false });
        return;
      }

      // OAuth redirects away from the page, so loading stays true
      // until the redirect completes and onAuthStateChange fires
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : "Failed to initiate OAuth flow",
        loading: false,
      });
    }
  },

  signOut: async () => {
    if (!isSupabaseConfigured) {
      set({ error: NO_SUPABASE_ERROR });
      return;
    }

    set({ loading: true, error: null });

    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signOut();

      if (error) {
        set({ error: error.message, loading: false });
        return;
      }

      // M2: Let onAuthStateChange be the source of truth for user/session.
      // Only manage loading state here.
      set({ loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to sign out",
        loading: false,
      });
    }
  },

  // S2: Clear error action
  clearError: () => set({ error: null }),

  // C1: Clean up the auth listener subscription
  cleanup: () => {
    if (authSubscription) {
      authSubscription.unsubscribe();
      authSubscription = null;
    }
  },
}));

/** Convenience hook — re-exports the auth store for component use */
export const useAuth = useAuthStore;
