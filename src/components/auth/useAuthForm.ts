/**
 * useAuthForm — shared sign-in / sign-up / forgot-password / reset-password
 * logic for AuthModal and LoginPage (#1093 layer 2).
 *
 * Owns the field state (email/password/confirmPassword/sentTo/confirmError/
 * successMessage), the password-strength read-out, and the four submit
 * handlers plus the confirm-blur mismatch check. Every handler keeps the
 * exact validation order and copy both call sites already used: mismatch,
 * then minimum length, then the account password policy gate, then the
 * store call, then a `useAuthStore.getState().error` check.
 *
 * What each caller does *after* a successful sign-up / forgot-password /
 * update-password differs by chrome (AuthModal switches to its check-email
 * view or auto-closes; LoginPage sets an inline message and lets the auth
 * state change drive navigation) — that part was never shared logic, so it
 * stays out of this hook and is passed in as an optional callback instead.
 * AuthModal's view-switching/transition state, LoginPage's magic-link flow
 * and session-expired banner, and both files' own effects (recovery mode,
 * focus-on-open, reset-on-close) stay local to each component.
 *
 * This hook must not import from AuthModal or LoginPage.
 */

import { useCallback, useMemo, useState } from "react";
import { useAuthStore } from "@/stores/authStore";
import {
  evaluatePasswordStrength,
  meetsAccountPasswordPolicy,
} from "@/lib/auth/passwordStrength";

export type AuthFormView = "signin" | "signup" | "forgot" | "reset_password";

export interface UseAuthFormOptions {
  /** Called after a successful sign-up (AuthModal only; LoginPage has no sign-up view). */
  onSignUpSuccess?: () => void;
  /** Called after a successful forgot-password request. */
  onForgotPasswordSuccess?: () => void;
  /** Called after a successful password update. */
  onUpdatePasswordSuccess?: () => void;
}

export function useAuthForm(options: UseAuthFormOptions = {}) {
  const { onSignUpSuccess, onForgotPasswordSuccess, onUpdatePasswordSuccess } =
    options;

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

  // Password strength for the current password value.
  const strength = useMemo(
    () => (password.length > 0 ? evaluatePasswordStrength(password) : null),
    [password],
  );

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
    if (!meetsAccountPasswordPolicy(password)) {
      setConfirmError(
        "Password is too weak. Add numbers and special characters.",
      );
      return;
    }
    await signUpWithPassword(email.trim(), password);
    // If signup succeeded (no error), record where we sent it and let the
    // caller decide what happens next (AuthModal shows check_email).
    if (!useAuthStore.getState().error) {
      setSentTo(email.trim());
      onSignUpSuccess?.();
    }
  }, [email, password, confirmPassword, signUpWithPassword, onSignUpSuccess]);

  const handleForgotPassword = useCallback(async () => {
    if (!email.trim()) return;
    await resetPassword(email.trim());
    if (!useAuthStore.getState().error) {
      setSentTo(email.trim());
      onForgotPasswordSuccess?.();
    }
  }, [email, resetPassword, onForgotPasswordSuccess]);

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
    if (!meetsAccountPasswordPolicy(password)) {
      setConfirmError(
        "Password is too weak. Add numbers and special characters.",
      );
      return;
    }
    await updatePassword(password);
    if (!useAuthStore.getState().error) {
      onUpdatePasswordSuccess?.();
    }
  }, [password, confirmPassword, updatePassword, onUpdatePasswordSuccess]);

  const handleConfirmBlur = useCallback(() => {
    if (confirmPassword && password !== confirmPassword) {
      setConfirmError("Passwords do not match.");
    } else {
      setConfirmError("");
    }
  }, [password, confirmPassword]);

  // Dispatches Enter-to-submit for the views both callers share. Each
  // component's own handleKeyDown still owns its view-specific cases
  // (AuthModal has none beyond these four; LoginPage adds magic_link).
  const submitForView = useCallback(
    (view: AuthFormView) => {
      if (view === "signin") return handleSignIn();
      if (view === "signup") return handleSignUp();
      if (view === "forgot") return handleForgotPassword();
      return handleUpdatePassword();
    },
    [handleSignIn, handleSignUp, handleForgotPassword, handleUpdatePassword],
  );

  return {
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
  };
}
