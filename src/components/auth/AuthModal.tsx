/**
 * AuthModal — Global authentication modal with email/password flows.
 *
 * Renders as a portal above all other content (z-[400]).
 * Five views: sign-in, sign-up, forgot password, check email, and reset password.
 * Auto-closes and resolves the pending callback when auth succeeds.
 * Detects recovery mode to auto-show the reset password view.
 *
 * The sign-in / sign-up / forgot-password / reset-password field state and
 * handlers are shared with LoginPage via useAuthForm (#1093 layer 2). This
 * file keeps its own chrome: the modal shell, the check_email view, and the
 * fade transition between views.
 */

import { useState, useEffect, useCallback, useId, useRef } from "react";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { PasswordStrengthMeter } from "@/components/ui/PasswordStrengthMeter";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { useAuthUIStore } from "@/stores/authUIStore";
import { isSupabaseConfigured } from "@/lib/supabase";
import { meetsAccountPasswordPolicy } from "@/lib/auth/passwordStrength";
import { useAuthForm } from "./useAuthForm";

type ModalView =
  "signin" | "signup" | "forgot" | "check_email" | "reset_password";

// ── Main component ───────────────────────────────────────────────────
export function AuthModal() {
  const isOpen = useAuthUIStore((s) => s.isOpen);
  const prompt = useAuthUIStore((s) => s.prompt);
  const closeAuthModal = useAuthUIStore((s) => s.closeAuthModal);
  const resolveAuth = useAuthUIStore((s) => s.resolveAuth);
  const openAuthModal = useAuthUIStore((s) => s.openAuthModal);

  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const isRecoveryMode = useAuthStore((s) => s.isRecoveryMode);

  // Track whether views are transitioning for animation
  const [transitioning, setTransitioning] = useState(false);
  const [displayView, setDisplayView] = useState<ModalView>("signin");

  const inputRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const {
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    sentTo,
    setSentTo,
    confirmError,
    setConfirmError,
    successMessage,
    setSuccessMessage,
    strength,
    handleSignIn,
    handleSignUp,
    handleForgotPassword,
    handleUpdatePassword,
    handleConfirmBlur,
    submitForView,
  } = useAuthForm({
    // `switchView` is declared below (it closes over this hook's own
    // setConfirmError/setSuccessMessage/setPassword/setConfirmPassword, so it
    // can't be hoisted above the useAuthForm call it would otherwise
    // precede). That's safe here: these callbacks only run later, from
    // event handlers dispatched after render completes, by which point
    // `switchView` is already assigned — never during render itself.
    // Sign-up and forgot-password both land on the same check_email view.
    onSignUpSuccess: () => switchView("check_email"),
    onForgotPasswordSuccess: () => switchView("check_email"),
    onUpdatePasswordSuccess: () => {
      setSuccessMessage("Password updated successfully.");
      setTimeout(() => closeAuthModal(), 1500);
    },
  });

  // ── Recovery mode: auto-open modal with reset_password view ──────
  useEffect(() => {
    if (isRecoveryMode) {
      openAuthModal("Set a new password for your account");
      clearError();
      setConfirmError("");
      setSuccessMessage("");
      setDisplayView("reset_password");
      setPassword("");
      setConfirmPassword("");
    }
  }, [
    isRecoveryMode,
    openAuthModal,
    clearError,
    setConfirmError,
    setSuccessMessage,
    setPassword,
    setConfirmPassword,
  ]);

  // ── Auto-close when auth succeeds ────────────────────────────────
  useEffect(() => {
    if (isOpen && isAuthenticated && !isRecoveryMode) {
      resolveAuth();
    }
  }, [isAuthenticated, isOpen, isRecoveryMode, resolveAuth]);

  // ── Focus first input on open ────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [isOpen, displayView]);

  // ── Reset state when modal closes ────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setDisplayView("signin");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setSentTo("");
      setConfirmError("");
      setSuccessMessage("");
      clearError();
    }
  }, [
    isOpen,
    clearError,
    setEmail,
    setPassword,
    setConfirmPassword,
    setSentTo,
    setConfirmError,
    setSuccessMessage,
  ]);

  // ── View transition helper ───────────────────────────────────────
  const switchView = useCallback(
    (next: ModalView) => {
      clearError();
      setConfirmError("");
      setSuccessMessage("");
      setTransitioning(true);
      // Fade out for 150ms, then swap view and fade in
      setTimeout(() => {
        setDisplayView(next);
        setPassword("");
        setConfirmPassword("");
        setTransitioning(false);
      }, 150);
    },
    [
      clearError,
      setConfirmError,
      setSuccessMessage,
      setPassword,
      setConfirmPassword,
    ],
  );

  // ── Handlers ─────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (
          displayView === "signin" ||
          displayView === "signup" ||
          displayView === "forgot" ||
          displayView === "reset_password"
        ) {
          submitForView(displayView);
        }
      }
    },
    [displayView, submitForView],
  );

  // ── View titles ──────────────────────────────────────────────────
  const viewTitles: Record<ModalView, string> = {
    signin: "Sign In",
    signup: "Create Account",
    forgot: "Reset Password",
    check_email: "Check Your Email",
    reset_password: "Set New Password",
  };

  // The contextual prompt is the only body copy that names this dialog's
  // purpose, and it renders on exactly one view. `describedBy` must track it:
  // AccessibleDialog uses the id verbatim and suppresses its own description
  // node, so passing it unconditionally would point `aria-describedby` at an
  // element that does not exist on every other view and on the common
  // no-prompt sign-in.
  const showPrompt = Boolean(prompt) && displayView === "signin";

  return (
    <AccessibleDialog
      open={isOpen && isSupabaseConfigured}
      onClose={closeAuthModal}
      title={viewTitles[displayView]}
      chrome="bare"
      labelledBy={titleId}
      describedBy={showPrompt ? descriptionId : undefined}
      panelProps={{
        className:
          "w-full max-w-sm bg-void-black/95 border border-su-line/50 rounded-2xl shadow-2xl overflow-hidden",
      }}
    >
      <>
        {/* Header */}
        <div className="px-6 pt-6 pb-2">
          <h2 id={titleId} className="text-lg font-semibold text-su-text">
            {viewTitles[displayView]}
          </h2>
          {showPrompt && (
            <p id={descriptionId} className="text-sm text-su-muted mt-1">
              {prompt}
            </p>
          )}
        </div>

        {/* Error */}
        {(error || confirmError) && displayView !== "check_email" && (
          <div className="mx-6 mt-2 p-3 bg-alert-red/10 border border-alert-red/30 rounded-lg">
            <p className="text-xs text-alert-red">{confirmError || error}</p>
          </div>
        )}

        {/* Success message */}
        {successMessage && (
          <div className="mx-6 mt-2 p-3 bg-signal-green/10 border border-signal-green/30 rounded-lg">
            <p className="text-xs text-signal-green">{successMessage}</p>
          </div>
        )}

        {/* View content with transition */}
        <div
          className={`transition-all duration-150 ${
            transitioning
              ? "opacity-0 translate-y-1"
              : "opacity-100 translate-y-0"
          }`}
        >
          {/* ── Sign In view ──────────────────────────────────────── */}
          {displayView === "signin" && (
            <div className="px-6 py-4 space-y-4">
              <div>
                <label
                  htmlFor="auth-email"
                  className="block text-xs font-medium text-su-muted mb-1.5"
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
                  maxLength={254}
                  className="w-full bg-su-line/10 border border-su-line/40 rounded-lg px-3 py-2.5 text-sm text-su-text placeholder:text-su-muted/80 focus:outline-none focus:border-plasma-orange/50 focus-visible:ring-2 focus-visible:ring-plasma-orange/50 disabled:opacity-50 transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="auth-password"
                  className="block text-xs font-medium text-su-muted mb-1.5"
                >
                  Password
                </label>
                <PasswordInput
                  id="auth-password"
                  value={password}
                  onChange={setPassword}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter your password"
                  disabled={loading}
                />
              </div>

              <button
                onClick={handleSignIn}
                disabled={loading || !email.trim() || !password}
                className="w-full py-2.5 rounded-lg text-sm font-medium bg-plasma-orange text-su-on-accent hover:bg-plasma-orange/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>

              <div className="flex items-center justify-between text-xs">
                <button
                  onClick={() => switchView("forgot")}
                  className="text-su-muted hover:text-su-text transition-colors"
                >
                  Forgot password?
                </button>
                <button
                  onClick={() => switchView("signup")}
                  className="text-plasma-orange hover:text-plasma-orange/80 transition-colors"
                >
                  Create account
                </button>
              </div>
            </div>
          )}

          {/* ── Sign Up view ──────────────────────────────────────── */}
          {displayView === "signup" && (
            <div className="px-6 py-4 space-y-4">
              <div>
                <label
                  htmlFor="signup-email"
                  className="block text-xs font-medium text-su-muted mb-1.5"
                >
                  Email address
                </label>
                <input
                  ref={inputRef}
                  id="signup-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                  maxLength={254}
                  className="w-full bg-su-line/10 border border-su-line/40 rounded-lg px-3 py-2.5 text-sm text-su-text placeholder:text-su-muted/80 focus:outline-none focus:border-plasma-orange/50 focus-visible:ring-2 focus-visible:ring-plasma-orange/50 disabled:opacity-50 transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="signup-password"
                  className="block text-xs font-medium text-su-muted mb-1.5"
                >
                  Password
                </label>
                <PasswordInput
                  id="signup-password"
                  value={password}
                  onChange={setPassword}
                  onKeyDown={handleKeyDown}
                  placeholder="At least 8 characters"
                  disabled={loading}
                />
                {/* Strength meter */}
                {strength && <PasswordStrengthMeter result={strength} />}
              </div>

              <div>
                <label
                  htmlFor="signup-confirm"
                  className="block text-xs font-medium text-su-muted mb-1.5"
                >
                  Confirm password
                </label>
                <PasswordInput
                  id="signup-confirm"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  onBlur={handleConfirmBlur}
                  onKeyDown={handleKeyDown}
                  placeholder="Re-enter your password"
                  disabled={loading}
                />
              </div>

              <button
                onClick={handleSignUp}
                disabled={
                  loading ||
                  !email.trim() ||
                  !password ||
                  !confirmPassword ||
                  password.length < 8 ||
                  !meetsAccountPasswordPolicy(password)
                }
                className="w-full py-2.5 rounded-lg text-sm font-medium bg-plasma-orange text-su-on-accent hover:bg-plasma-orange/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
              >
                {loading ? "Creating account..." : "Create Account"}
              </button>

              <div className="text-center">
                <button
                  onClick={() => switchView("signin")}
                  className="text-xs text-su-muted hover:text-su-text transition-colors"
                >
                  Already have an account?{" "}
                  <span className="text-plasma-orange">Sign in</span>
                </button>
              </div>
            </div>
          )}

          {/* ── Forgot Password view ──────────────────────────────── */}
          {displayView === "forgot" && (
            <div className="px-6 py-4 space-y-4">
              <p className="text-sm text-su-muted">
                Enter your email and we'll send you a link to reset your
                password.
              </p>

              <div>
                <label
                  htmlFor="forgot-email"
                  className="block text-xs font-medium text-su-muted mb-1.5"
                >
                  Email address
                </label>
                <input
                  ref={inputRef}
                  id="forgot-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                  maxLength={254}
                  className="w-full bg-su-line/10 border border-su-line/40 rounded-lg px-3 py-2.5 text-sm text-su-text placeholder:text-su-muted/80 focus:outline-none focus:border-plasma-orange/50 focus-visible:ring-2 focus-visible:ring-plasma-orange/50 disabled:opacity-50 transition-colors"
                />
              </div>

              <button
                onClick={handleForgotPassword}
                disabled={loading || !email.trim()}
                className="w-full py-2.5 rounded-lg text-sm font-medium bg-plasma-orange text-su-on-accent hover:bg-plasma-orange/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>

              <div className="text-center">
                <button
                  onClick={() => switchView("signin")}
                  className="text-xs text-su-muted hover:text-su-text transition-colors"
                >
                  Back to sign in
                </button>
              </div>
            </div>
          )}

          {/* ── Check Email view ──────────────────────────────────── */}
          {displayView === "check_email" && (
            <div className="px-6 py-8 text-center space-y-4">
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
              <p className="text-sm text-su-muted">
                We sent a link to{" "}
                <strong className="text-su-text">{sentTo}</strong>
              </p>
              <p className="text-xs text-su-muted">
                Check your inbox and click the link to continue. You can close
                this dialog.
              </p>
              <button
                onClick={() => {
                  switchView("signin");
                  setEmail("");
                  setSentTo("");
                }}
                className="text-xs text-plasma-orange hover:text-plasma-orange/80 transition-colors"
              >
                Use a different email
              </button>
            </div>
          )}

          {/* ── Reset Password view ───────────────────────────────── */}
          {displayView === "reset_password" && (
            <div className="px-6 py-4 space-y-4">
              <p className="text-sm text-su-muted">
                Choose a new password for your account.
              </p>

              <div>
                <label
                  htmlFor="reset-password"
                  className="block text-xs font-medium text-su-muted mb-1.5"
                >
                  New password
                </label>
                <PasswordInput
                  id="reset-password"
                  inputRef={inputRef}
                  value={password}
                  onChange={setPassword}
                  onKeyDown={handleKeyDown}
                  placeholder="At least 8 characters"
                  disabled={loading}
                />
                {/* Strength meter */}
                {strength && <PasswordStrengthMeter result={strength} />}
              </div>

              <div>
                <label
                  htmlFor="reset-confirm"
                  className="block text-xs font-medium text-su-muted mb-1.5"
                >
                  Confirm new password
                </label>
                <PasswordInput
                  id="reset-confirm"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  onBlur={handleConfirmBlur}
                  onKeyDown={handleKeyDown}
                  placeholder="Re-enter your password"
                  disabled={loading}
                />
              </div>

              <button
                onClick={handleUpdatePassword}
                disabled={
                  loading ||
                  !password ||
                  !confirmPassword ||
                  password.length < 8 ||
                  !meetsAccountPasswordPolicy(password)
                }
                className="w-full py-2.5 rounded-lg text-sm font-medium bg-plasma-orange text-su-on-accent hover:bg-plasma-orange/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
              >
                {loading ? "Updating..." : "Update Password"}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 pt-2">
          <p className="text-xs text-su-muted text-center">
            No account needed -- the app works fully offline.
          </p>
        </div>
      </>
    </AccessibleDialog>
  );
}
