/**
 * authUIStore — Ephemeral UI state for the global auth modal.
 *
 * NOT persisted — controls modal visibility and deferred-action callback.
 * Any component can open the auth modal with a contextual prompt and
 * an optional callback that fires after successful authentication.
 */

import { create } from "zustand";

interface AuthUIState {
  /** Whether the auth modal is currently visible */
  isOpen: boolean;
  /** Contextual prompt shown in the modal (e.g. "Sign in to follow operators") */
  prompt: string | null;
  /** Callback to invoke after successful authentication */
  pendingCallback: (() => void) | null;

  /** Open the auth modal with an optional prompt and deferred callback */
  openAuthModal: (prompt?: string, onAuthenticated?: () => void) => void;
  /** Close the modal and discard pending callback */
  closeAuthModal: () => void;
  /** Invoke pending callback, then close (called when auth succeeds) */
  resolveAuth: () => void;
}

export const useAuthUIStore = create<AuthUIState>()((set, get) => ({
  isOpen: false,
  prompt: null,
  pendingCallback: null,

  openAuthModal: (prompt, onAuthenticated) => {
    set({
      isOpen: true,
      prompt: prompt ?? null,
      pendingCallback: onAuthenticated ?? null,
    });
  },

  closeAuthModal: () => {
    set({ isOpen: false, prompt: null, pendingCallback: null });
  },

  resolveAuth: () => {
    const cb = get().pendingCallback;
    set({ isOpen: false, prompt: null, pendingCallback: null });
    cb?.();
  },
}));
