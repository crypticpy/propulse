import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PasswordStrengthMeter } from "./PasswordStrengthMeter";
import type { PasswordStrengthResult } from "@/lib/auth/passwordStrength";

function result(
  level: PasswordStrengthResult["level"],
  score: PasswordStrengthResult["score"],
  label: string,
): PasswordStrengthResult {
  return { level, score, label };
}

describe("PasswordStrengthMeter", () => {
  it.each([
    ["weak", 0, "Weak", "bg-alert-red", "w-1/4"],
    ["fair", 1, "Fair", "bg-caution-amber", "w-2/4"],
    ["strong", 2, "Strong", "bg-signal-green", "w-3/4"],
    ["very strong", 4, "Very strong", "bg-cosmic-cyan", "w-full"],
  ] as const)(
    "renders the %s level with its label and bar width",
    (level, score, label, barClass, widthClass) => {
      const { container } = render(
        <PasswordStrengthMeter result={result(level, score, label)} />,
      );

      expect(screen.getByText(label)).toBeTruthy();
      const bar = container.querySelector(`.${barClass}`);
      expect(bar).not.toBeNull();
      expect(bar?.className).toContain(widthClass);
    },
  );
});
