/**
 * LoginPage — Full-page login screen with four views.
 *
 * Rendered by AuthGate when the user is not authenticated.
 * Views: sign-in (default), magic link, forgot password, reset password.
 * No sign-up flow — invite-only beta.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuthStore } from "@/stores/authStore";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

// ── Types ────────────────────────────────────────────────────────────
type LoginView = "signin" | "magic_link" | "forgot" | "reset_password";

// ── Password strength (mirrored from AuthModal) ─────────────────────
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

// ── Eye icons ────────────────────────────────────────────────────────
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
        className="w-full bg-void-black/50 border border-white/10 rounded-lg px-3 py-2.5 pr-10 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-plasma-orange/50 focus-visible:ring-2 focus-visible:ring-plasma-orange/50 disabled:opacity-50 transition-colors"
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

// ── Input class (reused for all text inputs) ─────────────────────────
const INPUT_CLASS =
  "w-full bg-void-black/50 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-plasma-orange/50 focus-visible:ring-2 focus-visible:ring-plasma-orange/50 disabled:opacity-50 transition-colors";

// ── Main component ───────────────────────────────────────────────────
export function LoginPage() {
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const isRecoveryMode = useAuthStore((s) => s.isRecoveryMode);
  const sessionExpired = useAuthStore((s) => s.sessionExpired);
  const signInWithPassword = useAuthStore((s) => s.signInWithPassword);
  const signInWithMagicLink = useAuthStore((s) => s.signInWithMagicLink);
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const updatePassword = useAuthStore((s) => s.updatePassword);

  const [view, setView] = useState<LoginView>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const inputRef = useRef<HTMLInputElement | null>(null);

  // Password strength for current password value
  const strength = useMemo(
    () => (password.length > 0 ? getPasswordStrength(password) : null),
    [password],
  );

  // ── Recovery mode: auto-switch to reset_password view ─────────────
  useEffect(() => {
    if (isRecoveryMode) {
      clearError();
      setConfirmError("");
      setSuccessMessage("");
      setView("reset_password");
      setPassword("");
      setConfirmPassword("");
    }
  }, [isRecoveryMode, clearError]);

  // ── Focus first input on view change ──────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [view]);

  // ── View switching helper ─────────────────────────────────────────
  const switchView = useCallback(
    (next: LoginView) => {
      clearError();
      setConfirmError("");
      setSuccessMessage("");
      setPassword("");
      setConfirmPassword("");
      setView(next);
    },
    [clearError],
  );

  // ── Handlers ──────────────────────────────────────────────────────
  const handleSignIn = useCallback(async () => {
    if (!email.trim() || !password) return;
    await signInWithPassword(email.trim(), password);
  }, [email, password, signInWithPassword]);

  const handleMagicLink = useCallback(async () => {
    if (!email.trim()) return;
    await signInWithMagicLink(email.trim());
    if (!useAuthStore.getState().error) {
      setSuccessMessage("Check your email for a sign-in link.");
    }
  }, [email, signInWithMagicLink]);

  const handleForgotPassword = useCallback(async () => {
    if (!email.trim()) return;
    await resetPassword(email.trim());
    if (!useAuthStore.getState().error) {
      setSuccessMessage("Check your email for a password reset link.");
    }
  }, [email, resetPassword]);

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
      setSuccessMessage("Password updated successfully. Redirecting...");
    }
  }, [password, confirmPassword, updatePassword]);

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
        if (view === "signin") handleSignIn();
        else if (view === "magic_link") handleMagicLink();
        else if (view === "forgot") handleForgotPassword();
        else if (view === "reset_password") handleUpdatePassword();
      }
    },
    [
      view,
      handleSignIn,
      handleMagicLink,
      handleForgotPassword,
      handleUpdatePassword,
    ],
  );

  // ── Combined error display ────────────────────────────────────────
  const displayError = confirmError || error;

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-void-black p-4">
      <div className="w-full max-w-md">
        {/* Session expired info bar */}
        {sessionExpired && view === "signin" && (
          <div className="mb-4 p-3 bg-nebula-blue/10 border border-nebula-blue/30 rounded-xl text-center">
            <p className="text-xs text-nebula-blue">
              Your session expired. Please sign in again.
            </p>
          </div>
        )}

        {/* Card */}
        <div className="bg-deep-space/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header / Branding */}
          <div className="px-8 pt-8 pb-4 text-center">
            <h1
              className="text-3xl font-bold tracking-widest bg-gradient-to-r from-plasma-orange to-amber-400 bg-clip-text text-transparent mb-2"
              style={{ fontFamily: "Orbitron, sans-serif" }}
            >
              PROPULSE
            </h1>
            <p className="text-xs text-gray-500 tracking-wide uppercase">
              Ham Radio Propagation Intelligence
            </p>
          </div>

          {/* Error */}
          {displayError && (
            <div className="mx-6 mt-1 p-3 bg-alert-red/10 border border-alert-red/30 rounded-lg">
              <p className="text-xs text-alert-red">{displayError}</p>
            </div>
          )}

          {/* Success */}
          {successMessage && (
            <div className="mx-6 mt-1 p-3 bg-signal-green/10 border border-signal-green/30 rounded-lg">
              <p className="text-xs text-signal-green">{successMessage}</p>
            </div>
          )}

          {/* ── Sign In view ─────────────────────────────────────────── */}
          {view === "signin" && (
            <div className="px-6 py-5 space-y-4">
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs font-medium text-gray-400 mb-1.5"
                >
                  Email address
                </label>
                <input
                  ref={inputRef}
                  id="login-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                  maxLength={254}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-medium text-gray-400 mb-1.5"
                >
                  Password
                </label>
                <PasswordInput
                  id="login-password"
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
                className="w-full py-2.5 rounded-lg text-sm font-medium bg-plasma-orange text-white hover:bg-plasma-orange/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner size="sm" />
                    Signing in...
                  </span>
                ) : (
                  "Sign In"
                )}
              </button>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  onClick={() => switchView("forgot")}
                  className="text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Forgot password?
                </button>
                <button
                  onClick={() => switchView("magic_link")}
                  className="text-plasma-orange hover:text-plasma-orange/80 transition-colors"
                >
                  Use magic link instead
                </button>
              </div>
            </div>
          )}

          {/* ── Magic Link view ──────────────────────────────────────── */}
          {view === "magic_link" && (
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-gray-400">
                Enter your email and we'll send you a passwordless sign-in link.
              </p>

              <div>
                <label
                  htmlFor="magic-email"
                  className="block text-xs font-medium text-gray-400 mb-1.5"
                >
                  Email address
                </label>
                <input
                  ref={inputRef}
                  id="magic-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                  maxLength={254}
                  className={INPUT_CLASS}
                />
              </div>

              <button
                onClick={handleMagicLink}
                disabled={loading || !email.trim()}
                className="w-full py-2.5 rounded-lg text-sm font-medium bg-plasma-orange text-white hover:bg-plasma-orange/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner size="sm" />
                    Sending...
                  </span>
                ) : (
                  "Send Magic Link"
                )}
              </button>

              <div className="text-center">
                <button
                  onClick={() => switchView("signin")}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Back to password sign-in
                </button>
              </div>
            </div>
          )}

          {/* ── Forgot Password view ─────────────────────────────────── */}
          {view === "forgot" && (
            <div className="px-6 py-5 space-y-4">
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
                  className={INPUT_CLASS}
                />
              </div>

              <button
                onClick={handleForgotPassword}
                disabled={loading || !email.trim()}
                className="w-full py-2.5 rounded-lg text-sm font-medium bg-plasma-orange text-white hover:bg-plasma-orange/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner size="sm" />
                    Sending...
                  </span>
                ) : (
                  "Send Reset Link"
                )}
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

          {/* ── Reset Password view ──────────────────────────────────── */}
          {view === "reset_password" && (
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-gray-400">
                Choose a new password for your account.
              </p>

              <div>
                <label
                  htmlFor="reset-new-password"
                  className="block text-xs font-medium text-gray-400 mb-1.5"
                >
                  New password
                </label>
                <PasswordInput
                  id="reset-new-password"
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
                  htmlFor="reset-confirm-password"
                  className="block text-xs font-medium text-gray-400 mb-1.5"
                >
                  Confirm new password
                </label>
                <PasswordInput
                  id="reset-confirm-password"
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
                className="w-full py-2.5 rounded-lg text-sm font-medium bg-plasma-orange text-white hover:bg-plasma-orange/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner size="sm" />
                    Updating...
                  </span>
                ) : (
                  "Update Password"
                )}
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="px-6 pb-6 pt-2">
            <p className="text-[11px] text-gray-600 text-center">
              Invite-only beta
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
