/**
 * Zustand store for authentication state
 *
 * Manages Supabase Auth sessions, magic-link sign-in, and email/password flows.
 * Does NOT persist to localStorage — Supabase manages its own session storage.
 * Gracefully handles "no-account mode" when Supabase env vars are not configured.
 */

import { create } from "zustand";
import type { User, Session } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { useProfileStore } from "@/stores/profileStore";

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
  /** Whether a password recovery flow is active (user clicked reset link in email) */
  isRecoveryMode: boolean;
  /** Whether the previous session expired (SIGNED_OUT after being authenticated) */
  sessionExpired: boolean;

  /** Check for existing session and set up auth listener. Call once on app boot. */
  initialize: () => Promise<void>;
  /** Send a magic-link email for passwordless sign-in */
  signInWithMagicLink: (email: string) => Promise<void>;
  /** Sign up with email and password */
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  /** Sign in with email and password */
  signInWithPassword: (email: string, password: string) => Promise<void>;
  /** Send a password reset email */
  resetPassword: (email: string) => Promise<void>;
  /** Update the current user's password (used during recovery flow) */
  updatePassword: (newPassword: string) => Promise<void>;
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
  isRecoveryMode: false,
  sessionExpired: false,

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

        // Subscribe before retrieving the session. Supabase emits recovery
        // events immediately after exchanging the callback URL for a session.
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
          const prevUser = get().user;

          set({
            user: session?.user ?? null,
            session: session ?? null,
          });

          // #698: private Realtime channels (the account operating-state
          // transport) authorize off this call, not off the anon key — keep
          // it current on every sign-in, refresh and sign-out so a channel
          // opened right after this listener runs is never using a stale or
          // absent token. `.catch()` because a rejection here (e.g. no
          // Realtime socket yet) must not become an unhandled rejection —
          // supabase-js already forwards the session to Realtime on its own
          // auth-change listener, so this is a belt-and-braces call, not the
          // only thing keeping it current.
          supabase.realtime.setAuth(session?.access_token ?? undefined).catch(() => {});

          // #866/#867 Codex round 4: persisted billing state (profileStore's
          // subscriptionTier/Status/PeriodEnd) is tagged with the account it
          // belongs to (`billingUserId`). Reset it at every account
          // boundary — sign-out, or a different account signing in — so a
          // transient `profile_billing` read failure right after can never
          // preserve one account's Pro state into another account's session.
          // Same-user reloads (ids match) are left untouched so Pro state
          // does not flicker to free while the sync re-pulls it. A null
          // session counts as a boundary too (Codex round 6): a browser whose
          // session expired or was revoked while closed gets INITIAL_SESSION
          // with session === null and no SIGNED_OUT, and must not keep the
          // previous account's Pro tier in the anonymous UI.
          const incomingUserId = session?.user?.id ?? null;
          const { billingUserId } = useProfileStore.getState();
          if (billingUserId !== null && incomingUserId !== billingUserId) {
            useProfileStore.getState().resetBilling();
          }

          if (event === "PASSWORD_RECOVERY") {
            set({ isRecoveryMode: true });
          }

          if (event === "SIGNED_IN") {
            set({ sessionExpired: false });
          }

          if (event === "SIGNED_OUT") {
            set({
              isRecoveryMode: false,
              sessionExpired: prevUser !== null,
            });
            useProfileStore.getState().resetBilling();
          }
        });
        authSubscription = subscription;

        // Retrieve any existing session
        const {
          data: { session },
        } = await supabase.auth.getSession();

        set({
          user: session?.user ?? null,
          session: session ?? null,
          initialized: true,
        });
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

  signUpWithPassword: async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      set({ error: NO_SUPABASE_ERROR });
      return;
    }

    if (!EMAIL_RE.test(email)) {
      set({ error: "Please enter a valid email address." });
      return;
    }

    set({ loading: true, error: null });

    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signUp({ email, password });

      if (error) {
        set({ error: error.message, loading: false });
        return;
      }

      set({ loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to create account",
        loading: false,
      });
    }
  },

  signInWithPassword: async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      set({ error: NO_SUPABASE_ERROR });
      return;
    }

    if (!EMAIL_RE.test(email)) {
      set({ error: "Please enter a valid email address." });
      return;
    }

    set({ loading: true, error: null });

    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        set({ error: error.message, loading: false });
        return;
      }

      set({ loading: false, sessionExpired: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to sign in",
        loading: false,
      });
    }
  },

  resetPassword: async (email: string) => {
    if (!isSupabaseConfigured) {
      set({ error: NO_SUPABASE_ERROR });
      return;
    }

    if (!EMAIL_RE.test(email)) {
      set({ error: "Please enter a valid email address." });
      return;
    }

    set({ loading: true, error: null });

    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });

      if (error) {
        set({ error: error.message, loading: false });
        return;
      }

      set({ loading: false });
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : "Failed to send reset email",
        loading: false,
      });
    }
  },

  updatePassword: async (newPassword: string) => {
    if (!isSupabaseConfigured) {
      set({ error: NO_SUPABASE_ERROR });
      return;
    }

    set({ loading: true, error: null });

    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        set({ error: error.message, loading: false });
        return;
      }

      set({ loading: false, isRecoveryMode: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to update password",
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

      set({ loading: false, sessionExpired: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to sign out",
        loading: false,
      });
    }
  },

  clearError: () => set({ error: null }),

  cleanup: () => {
    if (authSubscription) {
      authSubscription.unsubscribe();
      authSubscription = null;
    }
  },
}));

/** Convenience hook — re-exports the auth store for component use */
export const useAuth = useAuthStore;
