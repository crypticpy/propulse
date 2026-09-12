/**
 * Password/passphrase strength — the one scale the app standardizes on
 * (#1093). Ported verbatim from the credential-vault pair's
 * `evaluateStrength` (CredentialUnlockDialog / PassphrasePrompt): a graded
 * 0-4 score that rewards length and treats character-class diversity as a
 * bonus rather than a hard requirement. This replaces the separate 3-level
 * weak/fair/strong checklist that used to live in AuthModal / LoginPage.
 */

export type PasswordStrengthLevel = "weak" | "fair" | "strong" | "very strong";

export interface PasswordStrengthResult {
  level: PasswordStrengthLevel;
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
}

export function evaluatePasswordStrength(
  password: string,
): PasswordStrengthResult {
  if (password.length === 0) {
    return { level: "weak", score: 0, label: "Weak" };
  }

  let score = 0;

  // Length contributions
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 20) score += 1;

  // Character diversity
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);
  const diversity = [hasLower, hasUpper, hasDigit, hasSpecial].filter(
    Boolean,
  ).length;
  if (diversity >= 3) score += 1;
  if (diversity === 4) score += 1;

  // Cap at 4
  const cappedScore = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;

  const levels: PasswordStrengthLevel[] = [
    "weak",
    "fair",
    "strong",
    "very strong",
    "very strong",
  ];
  const labels = ["Weak", "Fair", "Strong", "Very strong", "Very strong"];

  return {
    level: levels[cappedScore],
    score: cappedScore,
    label: labels[cappedScore],
  };
}

/** Shared presentation for strength meters: bar/text color and, for the
 * single-bar meter, how full the bar should be. Uses design tokens
 * (`alert-red` / `caution-amber` / `signal-green`, matching the auth pair's
 * original `strengthConfig`) plus `cosmic-cyan` — this repo's existing
 * "beyond good" accent (used across solar/logbook/sdr panels) — for the new
 * "very strong" tier. */
/**
 * The account password policy the sign-up and reset-password forms
 * enforce: at least 8 characters with a digit and a special character.
 * This is the old auth-form "not weak" rule kept verbatim so switching the
 * meter to the graded scale does not loosen what an account will accept
 * (#1093 keeps the policy out of scope). The meter shows
 * `evaluatePasswordStrength`; the gate uses this.
 */
export function meetsAccountPasswordPolicy(password: string): boolean {
  return (
    password.length >= 8 && /\d/.test(password) && /[^a-zA-Z0-9]/.test(password)
  );
}

export interface PasswordStrengthPresentation {
  barClass: string;
  textClass: string;
  widthClass: string;
}

export const PASSWORD_STRENGTH_PRESENTATION: Record<
  PasswordStrengthLevel,
  PasswordStrengthPresentation
> = {
  weak: {
    barClass: "bg-alert-red",
    textClass: "text-alert-red",
    widthClass: "w-1/4",
  },
  fair: {
    barClass: "bg-caution-amber",
    textClass: "text-caution-amber",
    widthClass: "w-2/4",
  },
  strong: {
    barClass: "bg-signal-green",
    textClass: "text-signal-green",
    widthClass: "w-3/4",
  },
  "very strong": {
    barClass: "bg-cosmic-cyan",
    textClass: "text-cosmic-cyan",
    widthClass: "w-full",
  },
};
