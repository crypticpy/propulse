/**
 * AuthModal — Global authentication modal with email/password flows.
 *
 * Renders as a portal above all other content (z-[400]).
 * Five views: sign-in, sign-up, forgot password, check email, and reset password.
 * Auto-closes and resolves the pending callback when auth succeeds.
 * Detects recovery mode to auto-show the reset password view.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { useAuthUIStore } from "@/stores/authUIStore";
import { isSupabaseConfigured } from "@/lib/supabase";

type ModalView =
  | "signin"
  | "signup"
  | "forgot"
  | "check_email"
  | "reset_password";

// ── Password strength ────────────────────────────────────────────────
type PasswordStrength = "weak" | "fair" | "strong";

function getPasswordStrength(password: string): PasswordStrength {
  if (password.length < 8) return "weak";

  const hasNumber = /\d/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const isLong = password.length >= 12;

  if (hasNumber && hasSpecial && hasUppercase && isLong) return "strong";
  if (hasNumber && hasSpecial) return "fair";
  return "weak";
}

const strengthConfig: Record<
  PasswordStrength,
  { label: string; color: string; barColor: string; width: string }
> = {
  weak: {
    label: "Weak",
    color: "text-alert-red",
    barColor: "bg-alert-red",
    width: "w-1/3",
  },
  fair: {
    label: "Fair",
    color: "text-caution-amber",
    barColor: "bg-caution-amber",
    width: "w-2/3",
  },
  strong: {
    label: "Strong",
    color: "text-signal-green",
    barColor: "bg-signal-green",
    width: "w-full",
  },
};

// ── Eye icons for password visibility toggle ─────────────────────────
function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function EyeSlashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
      />
    </svg>
  );
}

// ── Password input with show/hide toggle ─────────────────────────────
function PasswordInput({
  id,
  value,
  onChange,
  onBlur,
  onKeyDown,
  placeholder,
  disabled,
  autoFocus,
  inputRef,
  maxLength = 128,
}: {
  id: string;
  value: string;
  onChange: (val: string) => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  maxLength?: number;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        disabled={disabled}
        autoFocus={autoFocus}
        maxLength={maxLength}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 pr-10 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-plasma-orange/50 focus-visible:ring-2 focus-visible:ring-plasma-orange/50 disabled:opacity-50 transition-colors"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? (
          <EyeSlashIcon className="w-4.5 h-4.5" />
        ) : (
          <EyeIcon className="w-4.5 h-4.5" />
        )}
      </button>
    </div>
  );
}

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
  const signInWithPassword = useAuthStore((s) => s.signInWithPassword);
  const signUpWithPassword = useAuthStore((s) => s.signUpWithPassword);
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const updatePassword = useAuthStore((s) => s.updatePassword);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Track whether views are transitioning for animation
  const [transitioning, setTransitioning] = useState(false);
  const [displayView, setDisplayView] = useState<ModalView>("signin");

  const inputRef = useRef<HTMLInputElement | null>(null);

  // Password strength for current password value
  const strength = useMemo(
    () => (password.length > 0 ? getPasswordStrength(password) : null),
    [password],
  );

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
  }, [isRecoveryMode, openAuthModal, clearError]);

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

  // ── Body scroll lock ─────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

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
  }, [isOpen, clearError]);

  // ── Escape key ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAuthModal();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, closeAuthModal]);

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
    [clearError],
  );

  // ── Handlers ─────────────────────────────────────────────────────
  const handleSignIn = useCallback(async () => {
    if (!email.trim() || !password) return;
    await signInWithPassword(email.trim(), password);
  }, [email, password, signInWithPassword]);

  const handleSignUp = useCallback(async () => {
    if (!email.trim() || !password) return;
    if (password !== confirmPassword) {
      setConfirmError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setConfirmError("Password must be at least 8 characters.");
      return;
    }
    const pwStrength = getPasswordStrength(password);
    if (pwStrength === "weak") {
      setConfirmError(
        "Password is too weak. Add numbers and special characters.",
      );
      return;
    }
    await signUpWithPassword(email.trim(), password);
    // If signup succeeded (no error), show check_email
    if (!useAuthStore.getState().error) {
      setSentTo(email.trim());
      switchView("check_email");
    }
  }, [email, password, confirmPassword, signUpWithPassword, switchView]);

  const handleForgotPassword = useCallback(async () => {
    if (!email.trim()) return;
    await resetPassword(email.trim());
    if (!useAuthStore.getState().error) {
      setSentTo(email.trim());
      switchView("check_email");
    }
  }, [email, resetPassword, switchView]);

  const handleUpdatePassword = useCallback(async () => {
    if (!password) return;
    if (password !== confirmPassword) {
      setConfirmError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setConfirmError("Password must be at least 8 characters.");
      return;
    }
    const pwStrength = getPasswordStrength(password);
    if (pwStrength === "weak") {
      setConfirmError(
        "Password is too weak. Add numbers and special characters.",
      );
      return;
    }
    await updatePassword(password);
    if (!useAuthStore.getState().error) {
      setSuccessMessage("Password updated successfully.");
      setTimeout(() => closeAuthModal(), 1500);
    }
  }, [password, confirmPassword, updatePassword, closeAuthModal]);

  const handleConfirmBlur = useCallback(() => {
    if (confirmPassword && password !== confirmPassword) {
      setConfirmError("Passwords do not match.");
    } else {
      setConfirmError("");
    }
  }, [password, confirmPassword]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (displayView === "signin") handleSignIn();
        else if (displayView === "signup") handleSignUp();
        else if (displayView === "forgot") handleForgotPassword();
        else if (displayView === "reset_password") handleUpdatePassword();
      }
    },
    [
      displayView,
      handleSignIn,
      handleSignUp,
      handleForgotPassword,
      handleUpdatePassword,
    ],
  );

  // ── View titles ──────────────────────────────────────────────────
  const viewTitles: Record<ModalView, string> = {
    signin: "Sign In",
    signup: "Create Account",
    forgot: "Reset Password",
    check_email: "Check Your Email",
    reset_password: "Set New Password",
  };

  if (!isOpen || !isSupabaseConfigured) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={viewTitles[displayView]}
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
            {viewTitles[displayView]}
          </h2>
          {prompt && displayView === "signin" && (
            <p className="text-sm text-gray-400 mt-1">{prompt}</p>
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
                  maxLength={254}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-plasma-orange/50 focus-visible:ring-2 focus-visible:ring-plasma-orange/50 disabled:opacity-50 transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="auth-password"
                  className="block text-xs font-medium text-gray-400 mb-1.5"
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
                className="w-full py-2.5 rounded-lg text-sm font-medium bg-plasma-orange text-white hover:bg-plasma-orange/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>

              <div className="flex items-center justify-between text-xs">
                <button
                  onClick={() => switchView("forgot")}
                  className="text-gray-500 hover:text-gray-300 transition-colors"
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
                  className="block text-xs font-medium text-gray-400 mb-1.5"
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
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-plasma-orange/50 focus-visible:ring-2 focus-visible:ring-plasma-orange/50 disabled:opacity-50 transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="signup-password"
                  className="block text-xs font-medium text-gray-400 mb-1.5"
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
                {strength && (
                  <div className="mt-2 space-y-1">
                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${strengthConfig[strength].barColor} ${strengthConfig[strength].width}`}
                      />
                    </div>
                    <p
                      className={`text-[10px] font-medium ${strengthConfig[strength].color}`}
                    >
                      {strengthConfig[strength].label}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label
                  htmlFor="signup-confirm"
                  className="block text-xs font-medium text-gray-400 mb-1.5"
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
                  getPasswordStrength(password) === "weak"
                }
                className="w-full py-2.5 rounded-lg text-sm font-medium bg-plasma-orange text-white hover:bg-plasma-orange/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
              >
                {loading ? "Creating account..." : "Create Account"}
              </button>

              <div className="text-center">
                <button
                  onClick={() => switchView("signin")}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
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
              <p className="text-sm text-gray-400">
                Enter your email and we'll send you a link to reset your
                password.
              </p>

              <div>
                <label
                  htmlFor="forgot-email"
                  className="block text-xs font-medium text-gray-400 mb-1.5"
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
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-plasma-orange/50 focus-visible:ring-2 focus-visible:ring-plasma-orange/50 disabled:opacity-50 transition-colors"
                />
              </div>

              <button
                onClick={handleForgotPassword}
                disabled={loading || !email.trim()}
                className="w-full py-2.5 rounded-lg text-sm font-medium bg-plasma-orange text-white hover:bg-plasma-orange/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>

              <div className="text-center">
                <button
                  onClick={() => switchView("signin")}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
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
              <p className="text-sm text-gray-300">
                We sent a link to{" "}
                <strong className="text-white">{sentTo}</strong>
              </p>
              <p className="text-xs text-gray-500">
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
              <p className="text-sm text-gray-400">
                Choose a new password for your account.
              </p>

              <div>
                <label
                  htmlFor="reset-password"
                  className="block text-xs font-medium text-gray-400 mb-1.5"
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
                {strength && (
                  <div className="mt-2 space-y-1">
                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${strengthConfig[strength].barColor} ${strengthConfig[strength].width}`}
                      />
                    </div>
                    <p
                      className={`text-[10px] font-medium ${strengthConfig[strength].color}`}
                    >
                      {strengthConfig[strength].label}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label
                  htmlFor="reset-confirm"
                  className="block text-xs font-medium text-gray-400 mb-1.5"
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
                  getPasswordStrength(password) === "weak"
                }
                className="w-full py-2.5 rounded-lg text-sm font-medium bg-plasma-orange text-white hover:bg-plasma-orange/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
              >
                {loading ? "Updating..." : "Update Password"}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 pt-2">
          <p className="text-xs text-gray-600 text-center">
            No account needed -- the app works fully offline.
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
