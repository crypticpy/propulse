/**
 * PasswordStrengthMeter — single-bar strength indicator (bar + label).
 *
 * Shared by AuthModal and LoginPage (previously duplicated verbatim in
 * both, see #1093). Renders the four levels of `evaluatePasswordStrength`
 * via the shared `PASSWORD_STRENGTH_PRESENTATION` map; markup is unchanged
 * from the original inline meter.
 */

import {
  PASSWORD_STRENGTH_PRESENTATION,
  type PasswordStrengthResult,
} from "@/lib/auth/passwordStrength";

export interface PasswordStrengthMeterProps {
  result: PasswordStrengthResult;
}

export function PasswordStrengthMeter({ result }: PasswordStrengthMeterProps) {
  const presentation = PASSWORD_STRENGTH_PRESENTATION[result.level];

  return (
    <div className="mt-2 space-y-1">
      <div className="h-1 w-full bg-su-line/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${presentation.barClass} ${presentation.widthClass}`}
        />
      </div>
      <p className={`text-xs font-medium ${presentation.textClass}`}>
        {result.label}
      </p>
    </div>
  );
}
