/**
 * CredentialUnlockDialog — centered modal for setting up or unlocking
 * the encrypted credential vault.
 *
 * Two modes:
 * - "setup": first-time passphrase creation with confirmation + strength meter
 * - "unlock": returning user enters existing passphrase, with auto-lock countdown
 *
 * Shows which service is requesting access (e.g. "Unlock to access LoTW credentials").
 * Portal-based rendering, escape/backdrop close, forgot passphrase with data loss warning.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  setupPassphrase,
  unlock as unlockStore,
  deleteAllCredentials,
  isUnlocked,
} from "@/lib/db/credentialStore";
import { useProfileStore } from "@/stores/profileStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CredentialUnlockDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUnlocked: () => void;
  /** "setup" = first-time creation, "unlock" = returning user */
  mode: "unlock" | "setup";
  /** Which service triggered the unlock (shown in subtitle) */
  requestingService?: string;
}

// ---------------------------------------------------------------------------
// Service display names
// ---------------------------------------------------------------------------

const SERVICE_LABELS: Record<string, string> = {
  lotw: "Logbook of The World (LoTW)",
  eqsl: "eQSL",
  clublog: "Club Log",
  qrz: "QRZ.com",
};

function getServiceLabel(service?: string): string | null {
  if (!service) return null;
  return SERVICE_LABELS[service] ?? service;
}

// ---------------------------------------------------------------------------
// Strength helpers
// ---------------------------------------------------------------------------

type Strength = "weak" | "fair" | "strong" | "very strong";

interface StrengthResult {
  level: Strength;
  score: number; // 0-4
  label: string;
}

function evaluateStrength(passphrase: string): StrengthResult {
  if (passphrase.length === 0) {
    return { level: "weak", score: 0, label: "Weak" };
  }

  let score = 0;

  // Length contributions
  if (passphrase.length >= 8) score += 1;
  if (passphrase.length >= 12) score += 1;
  if (passphrase.length >= 20) score += 1;

  // Character diversity
  const hasLower = /[a-z]/.test(passphrase);
  const hasUpper = /[A-Z]/.test(passphrase);
  const hasDigit = /\d/.test(passphrase);
  const hasSpecial = /[^a-zA-Z0-9]/.test(passphrase);
  const diversity = [hasLower, hasUpper, hasDigit, hasSpecial].filter(
    Boolean,
  ).length;
  if (diversity >= 3) score += 1;
  if (diversity === 4) score += 1;

  // Cap at 4
  score = Math.min(score, 4);

  const levels: Strength[] = [
    "weak",
    "fair",
    "strong",
    "very strong",
    "very strong",
  ];
  const labels = ["Weak", "Fair", "Strong", "Very strong", "Very strong"];

  return {
    level: levels[score],
    score,
    label: labels[score],
  };
}

const strengthColors: Record<Strength, string> = {
  weak: "bg-red-500",
  fair: "bg-yellow-500",
  strong: "bg-green-500",
  "very strong": "bg-emerald-400",
};

const strengthTextColors: Record<Strength, string> = {
  weak: "text-red-400",
  fair: "text-yellow-400",
  strong: "text-green-400",
  "very strong": "text-emerald-300",
};

// ---------------------------------------------------------------------------
// Auto-lock countdown
// ---------------------------------------------------------------------------

const AUTO_LOCK_MS = 30 * 60 * 1000; // must match credentialStore.ts

function useAutoLockCountdown(active: boolean): string {
  const [remaining, setRemaining] = useState("");
  const unlockTime = useProfileStore((s) => s.lastCredentialUnlock);

  useEffect(() => {
    if (!active || !unlockTime || !isUnlocked()) {
      setRemaining("");
      return;
    }

    function update() {
      const elapsed = Date.now() - unlockTime;
      const left = Math.max(0, AUTO_LOCK_MS - elapsed);
      if (left <= 0) {
        setRemaining("Locking...");
        return;
      }
      const mins = Math.floor(left / 60_000);
      const secs = Math.floor((left % 60_000) / 1_000);
      setRemaining(`${mins}:${secs.toString().padStart(2, "0")}`);
    }

    update();
    const interval = setInterval(update, 1_000);
    return () => clearInterval(interval);
  }, [active, unlockTime]);

  return remaining;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CredentialUnlockDialog({
  isOpen,
  onClose,
  onUnlocked,
  mode,
  requestingService,
}: CredentialUnlockDialogProps) {
  // Form state
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [showForgotConfirm, setShowForgotConfirm] = useState(false);

  // Refs for focus management
  const passphraseRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Store actions
  const setCredentialStoreSetup = useProfileStore(
    (s) => s.setCredentialStoreSetup,
  );
  const setLastCredentialUnlock = useProfileStore(
    (s) => s.setLastCredentialUnlock,
  );

  // Auto-lock countdown (only shown after unlock)
  const countdown = useAutoLockCountdown(!isOpen && mode === "unlock");

  // Derived
  const strength = evaluateStrength(passphrase);
  const meetsMinLength = passphrase.length >= 8;
  const passwordsMatch =
    mode === "setup" ? passphrase === confirmPassphrase : true;
  const meetsMinStrength = strength.score >= 1; // >= fair
  const canSubmit =
    mode === "setup"
      ? passphrase.length > 0 &&
        meetsMinLength &&
        confirmPassphrase.length > 0 &&
        passwordsMatch &&
        meetsMinStrength
      : passphrase.length > 0;

  // Reset form state when opening/closing
  useEffect(() => {
    if (isOpen) {
      setPassphrase("");
      setConfirmPassphrase("");
      setShowPassphrase(false);
      setShowConfirm(false);
      setError(null);
      setShaking(false);
      setShowForgotConfirm(false);
      setLoading(false);

      // Focus the passphrase input after portal renders
      requestAnimationFrame(() => {
        passphraseRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background scroll
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Focus trap
  const handleTabTrap = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !modalRef.current) return;

    const focusable = modalRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || loading) return;

    setLoading(true);
    setError(null);

    try {
      if (mode === "setup") {
        await setupPassphrase(passphrase);
        setCredentialStoreSetup(true);
        setLastCredentialUnlock(Date.now());
        onUnlocked();
      } else {
        const success = await unlockStore(passphrase);
        if (success) {
          setLastCredentialUnlock(Date.now());
          onUnlocked();
        } else {
          setError("Incorrect passphrase");
          setShaking(true);
          setTimeout(() => setShaking(false), 600);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassphrase = async () => {
    if (!showForgotConfirm) {
      setShowForgotConfirm(true);
      return;
    }

    setLoading(true);
    try {
      await deleteAllCredentials();
      setCredentialStoreSetup(false);
      setShowForgotConfirm(false);
      setError(null);
      setPassphrase("");
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to reset credentials",
      );
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!isOpen || typeof document === "undefined") return null;

  const serviceLabel = getServiceLabel(requestingService);

  return createPortal(
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center p-4 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="credential-unlock-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        className={`
          relative z-10 w-full max-w-md p-6
          bg-deep-space border border-white/10
          rounded-xl shadow-2xl
          animate-in zoom-in-95
          ${shaking ? "animate-shake" : ""}
        `}
        onKeyDown={handleTabTrap}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          {/* Lock icon */}
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-plasma-orange/20 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-plasma-orange"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <h2
              id="credential-unlock-title"
              className="text-lg font-bold text-white"
            >
              {mode === "setup"
                ? "Secure Your Credentials"
                : "Unlock Credential Vault"}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {mode === "setup" ? (
                "Create a passphrase to encrypt your QSL service credentials"
              ) : serviceLabel ? (
                <>
                  Unlock to access{" "}
                  <span className="text-plasma-orange">{serviceLabel}</span>{" "}
                  credentials
                </>
              ) : (
                "Enter your passphrase to access saved credentials"
              )}
            </p>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="flex-shrink-0 p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Close"
            type="button"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Setup mode explanation */}
        {mode === "setup" && (
          <div className="mb-4 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10">
            <p className="text-xs text-gray-400 leading-relaxed">
              Your QSL service passwords will be encrypted with AES-256 and
              stored locally. The passphrase never leaves your device. You will
              need it each session to access your credentials.
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Passphrase field */}
          <div>
            <label
              htmlFor="cred-passphrase-input"
              className="block text-sm font-medium text-gray-300 mb-1.5"
            >
              Passphrase
            </label>
            <div className="relative">
              <input
                ref={passphraseRef}
                id="cred-passphrase-input"
                type={showPassphrase ? "text" : "password"}
                value={passphrase}
                onChange={(e) => {
                  setPassphrase(e.target.value);
                  setError(null);
                }}
                className="w-full px-3 py-2.5 pr-10 rounded-lg bg-white/5 border border-white/10
                  text-white placeholder-gray-500 text-sm
                  focus:outline-none focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
                  transition-colors"
                placeholder={
                  mode === "setup"
                    ? "Choose a strong passphrase (8+ chars)..."
                    : "Enter your passphrase..."
                }
                autoComplete="off"
                disabled={loading}
                minLength={mode === "setup" ? 8 : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPassphrase(!showPassphrase)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white transition-colors"
                aria-label={
                  showPassphrase ? "Hide passphrase" : "Show passphrase"
                }
                tabIndex={-1}
              >
                {showPassphrase ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {mode === "setup" && passphrase.length > 0 && !meetsMinLength && (
              <p className="mt-1 text-xs text-red-400">
                Must be at least 8 characters
              </p>
            )}
          </div>

          {/* Strength indicator (setup mode only) */}
          {mode === "setup" && passphrase.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex gap-1 h-1">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-full transition-colors duration-300 ${
                      i < strength.score
                        ? strengthColors[strength.level]
                        : "bg-white/10"
                    }`}
                  />
                ))}
              </div>
              <p
                className={`text-xs ${strengthTextColors[strength.level]} transition-colors`}
              >
                {strength.label}
              </p>
            </div>
          )}

          {/* Confirm passphrase (setup mode only) */}
          {mode === "setup" && (
            <div>
              <label
                htmlFor="cred-confirm-passphrase"
                className="block text-sm font-medium text-gray-300 mb-1.5"
              >
                Confirm Passphrase
              </label>
              <div className="relative">
                <input
                  id="cred-confirm-passphrase"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassphrase}
                  onChange={(e) => setConfirmPassphrase(e.target.value)}
                  className={`w-full px-3 py-2.5 pr-10 rounded-lg bg-white/5 border text-sm
                    text-white placeholder-gray-500
                    focus:outline-none focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30
                    transition-colors ${
                      confirmPassphrase.length > 0 && !passwordsMatch
                        ? "border-red-500/50"
                        : "border-white/10"
                    }`}
                  placeholder="Re-enter your passphrase..."
                  autoComplete="off"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white transition-colors"
                  aria-label={
                    showConfirm ? "Hide passphrase" : "Show passphrase"
                  }
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              {confirmPassphrase.length > 0 && !passwordsMatch && (
                <p className="mt-1 text-xs text-red-400">
                  Passphrases do not match
                </p>
              )}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <svg
                className="w-4 h-4 text-red-400 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Unlock-mode: auto-lock info */}
          {mode === "unlock" && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <svg
                className="w-3.5 h-3.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>Auto-locks after 30 minutes of inactivity</span>
              {countdown && (
                <span className="ml-auto text-plasma-orange font-mono text-xs">
                  {countdown}
                </span>
              )}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="w-full py-2.5 rounded-lg font-semibold text-sm transition-all
              bg-plasma-orange hover:bg-plasma-orange/90
              disabled:opacity-40 disabled:cursor-not-allowed
              text-black"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="w-4 h-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                {mode === "setup" ? "Setting up..." : "Unlocking..."}
              </span>
            ) : mode === "setup" ? (
              "Create Passphrase & Encrypt"
            ) : (
              "Unlock"
            )}
          </button>
        </form>

        {/* Forgot passphrase (unlock mode only) */}
        {mode === "unlock" && (
          <div className="mt-4 pt-4 border-t border-white/5">
            {!showForgotConfirm ? (
              <button
                type="button"
                onClick={handleForgotPassphrase}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                disabled={loading}
              >
                Forgot passphrase? You&apos;ll need to re-enter your service
                credentials.
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                  <svg
                    className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                  <p className="text-xs text-red-400">
                    This will{" "}
                    <span className="font-semibold">permanently delete</span>{" "}
                    all stored credentials. You will need to re-enter your LoTW,
                    eQSL, Club Log, and QRZ usernames and passwords.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleForgotPassphrase}
                    disabled={loading}
                    className="px-3 py-1.5 rounded text-xs font-medium bg-red-500/20 text-red-400
                      hover:bg-red-500/30 transition-colors disabled:opacity-40"
                  >
                    {loading ? "Resetting..." : "Yes, Reset Everything"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForgotConfirm(false)}
                    className="px-3 py-1.5 rounded text-xs font-medium bg-white/5 text-gray-400
                      hover:bg-white/10 transition-colors"
                    disabled={loading}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Icon sub-components
// ---------------------------------------------------------------------------

function EyeIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
      />
    </svg>
  );
}

export default CredentialUnlockDialog;
