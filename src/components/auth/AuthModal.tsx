/**
 * AuthModal — Global sign-in modal with magic link + OAuth.
 *
 * Renders as a portal above all other content (z-[400]).
 * Two views: email form + OAuth buttons, or "magic link sent" confirmation.
 * Auto-closes and resolves the pending callback when auth succeeds.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { useAuthUIStore } from "@/stores/authUIStore";
import { isSupabaseConfigured } from "@/lib/supabase";

type ModalView = "form" | "magic_link_sent";

export function AuthModal() {
  const isOpen = useAuthUIStore((s) => s.isOpen);
  const prompt = useAuthUIStore((s) => s.prompt);
  const closeAuthModal = useAuthUIStore((s) => s.closeAuthModal);
  const resolveAuth = useAuthUIStore((s) => s.resolveAuth);

  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const signInWithMagicLink = useAuthStore((s) => s.signInWithMagicLink);
  const signInWithOAuth = useAuthStore((s) => s.signInWithOAuth);

  const [view, setView] = useState<ModalView>("form");
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-close when auth succeeds
  useEffect(() => {
    if (isOpen && isAuthenticated) {
      resolveAuth();
    }
  }, [isAuthenticated, isOpen, resolveAuth]);

  // Focus email input on open
  useEffect(() => {
    if (isOpen && view === "form") {
      // Short delay so the portal is rendered
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen, view]);

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setView("form");
      setEmail("");
      setSentTo("");
      clearError();
    }
  }, [isOpen, clearError]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAuthModal();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, closeAuthModal]);

  const handleSendMagicLink = useCallback(async () => {
    if (!email.trim()) return;
    await signInWithMagicLink(email.trim());
    // If no error was set, the link was sent
    if (!useAuthStore.getState().error) {
      setSentTo(email.trim());
      setView("magic_link_sent");
    }
  }, [email, signInWithMagicLink]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSendMagicLink();
      }
    },
    [handleSendMagicLink],
  );

  if (!isOpen || !isSupabaseConfigured) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Sign in"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeAuthModal}
      />

      {/* Panel */}
      <div className="relative w-full max-w-sm bg-void-black/95 border border-white/15 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-2">
          <h2 className="text-lg font-semibold text-white">
            {view === "magic_link_sent" ? "Check Your Email" : "Sign In"}
          </h2>
          {prompt && view === "form" && (
            <p className="text-sm text-gray-400 mt-1">{prompt}</p>
          )}
        </div>

        {/* Error */}
        {error && view === "form" && (
          <div className="mx-6 mt-2 p-3 bg-alert-red/10 border border-alert-red/30 rounded-lg">
            <p className="text-xs text-alert-red">{error}</p>
          </div>
        )}

        {/* Form view */}
        {view === "form" && (
          <div className="px-6 py-4 space-y-4">
            {/* Email input */}
            <div>
              <label
                htmlFor="auth-email"
                className="block text-xs font-medium text-gray-400 mb-1.5"
              >
                Email address
              </label>
              <input
                ref={inputRef}
                id="auth-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-plasma-orange/50 focus-visible:ring-2 focus-visible:ring-plasma-orange/50 disabled:opacity-50 transition-colors"
              />
            </div>

            {/* Send magic link button */}
            <button
              onClick={handleSendMagicLink}
              disabled={loading || !email.trim()}
              className="w-full py-2.5 rounded-lg text-sm font-medium bg-plasma-orange text-white hover:bg-plasma-orange/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
            >
              {loading ? "Sending..." : "Send Magic Link"}
            </button>

            {/* Divider */}
            <div className="relative flex items-center py-1">
              <div className="flex-1 border-t border-white/10" />
              <span className="px-3 text-xs text-gray-600">or</span>
              <div className="flex-1 border-t border-white/10" />
            </div>

            {/* OAuth buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => signInWithOAuth("google")}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
              >
                {/* Google icon */}
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Google
              </button>

              <button
                onClick={() => signInWithOAuth("github")}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
              >
                {/* GitHub icon */}
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                GitHub
              </button>
            </div>
          </div>
        )}

        {/* Magic link sent view */}
        {view === "magic_link_sent" && (
          <div className="px-6 py-8 text-center space-y-4">
            {/* Check circle icon */}
            <div className="w-12 h-12 rounded-full bg-signal-green/20 flex items-center justify-center mx-auto">
              <svg
                className="w-6 h-6 text-signal-green"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-sm text-gray-300">
              We sent a sign-in link to{" "}
              <strong className="text-white">{sentTo}</strong>
            </p>
            <p className="text-xs text-gray-500">
              Click the link in your email to sign in. You can close this
              dialog.
            </p>
            <button
              onClick={() => {
                setView("form");
                setEmail("");
                setSentTo("");
              }}
              className="text-xs text-plasma-orange hover:text-plasma-orange/80 transition-colors"
            >
              Use a different email
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 pb-5 pt-2">
          <p className="text-xs text-gray-600 text-center">
            No account needed — the app works fully offline.
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
