import { describe, expect, it } from "vitest";
import {
  evaluatePasswordStrength,
  meetsAccountPasswordPolicy,
  PASSWORD_STRENGTH_PRESENTATION,
} from "./passwordStrength";

describe("evaluatePasswordStrength", () => {
  it("scores an empty password as weak/0", () => {
    expect(evaluatePasswordStrength("")).toEqual({
      level: "weak",
      score: 0,
      label: "Weak",
    });
  });

  it("length boundary: 7 chars stays below the length-8 threshold", () => {
    // 7 lowercase letters -> 0 length points, 1 diversity class -> score 0
    expect(evaluatePasswordStrength("abcdefg").score).toBe(0);
  });

  it("length boundary: 8 chars crosses the length-8 threshold", () => {
    // 8 lowercase letters -> +1 length point, 1 diversity class -> score 1
    const result = evaluatePasswordStrength("abcdefgh");
    expect(result.score).toBe(1);
    expect(result.level).toBe("fair");
  });

  it("length boundary: 11 chars stays below the length-12 threshold", () => {
    expect(evaluatePasswordStrength("abcdefghijk").score).toBe(1);
  });

  it("length boundary: 12 chars crosses the length-12 threshold", () => {
    // +1 (>=8) +1 (>=12) = 2
    expect(evaluatePasswordStrength("abcdefghijkl").score).toBe(2);
  });

  it("length boundary: 19 chars stays below the length-20 threshold", () => {
    expect(evaluatePasswordStrength("abcdefghijklmnopqr9").score).toBe(2);
  });

  it("length boundary: 20 chars crosses the length-20 threshold", () => {
    // +1 (>=8) +1 (>=12) +1 (>=20) = 3, single diversity class (lowercase)
    const result = evaluatePasswordStrength("abcdefghijklmnopqrst");
    expect(result.score).toBe(3);
    expect(result.level).toBe("very strong");
  });

  it("diversity boundary: 2 character classes adds no diversity bonus", () => {
    // lower + digit only (2 classes), length 8 -> +1 length, +0 diversity
    const result = evaluatePasswordStrength("abcdefg1");
    expect(result.score).toBe(1);
    expect(result.level).toBe("fair");
  });

  it("diversity boundary: 3 character classes adds +1", () => {
    // lower + upper + digit (3 classes), length 8 -> +1 length, +1 diversity
    const result = evaluatePasswordStrength("abcdEF12");
    expect(result.score).toBe(2);
    expect(result.level).toBe("strong");
  });

  it("diversity boundary: 4 character classes adds +2 total", () => {
    // lower + upper + digit + special (4 classes), length 8 -> +1 length, +2 diversity
    const result = evaluatePasswordStrength("abcdEF1!");
    expect(result.score).toBe(3);
    expect(result.level).toBe("very strong");
  });

  it("caps the score at 4 even when every contribution is earned", () => {
    // length >=20 (+3) and 4 diversity classes (+2) = 5 raw, capped to 4
    const result = evaluatePasswordStrength("abcdEFGH1234!@#$very-long");
    expect(result.score).toBe(4);
    expect(result.level).toBe("very strong");
    expect(result.label).toBe("Very strong");
  });

  it("labels every score 0-4", () => {
    expect(evaluatePasswordStrength("").label).toBe("Weak");
    expect(evaluatePasswordStrength("abcdefgh").label).toBe("Fair");
    expect(evaluatePasswordStrength("abcdEF12").label).toBe("Strong");
    expect(evaluatePasswordStrength("abcdEF1!").label).toBe("Very strong");
    expect(evaluatePasswordStrength("abcdEFGH1234!@#$very-long").label).toBe(
      "Very strong",
    );
  });
});

describe("PASSWORD_STRENGTH_PRESENTATION", () => {
  it("defines a distinct bar/text token for every level", () => {
    const levels = ["weak", "fair", "strong", "very strong"] as const;
    const barClasses = levels.map(
      (l) => PASSWORD_STRENGTH_PRESENTATION[l].barClass,
    );
    const textClasses = levels.map(
      (l) => PASSWORD_STRENGTH_PRESENTATION[l].textClass,
    );
    expect(new Set(barClasses).size).toBe(4);
    expect(new Set(textClasses).size).toBe(4);
  });

  it("uses design tokens, not raw Tailwind palette classes", () => {
    for (const level of ["weak", "fair", "strong", "very strong"] as const) {
      const { barClass, textClass } = PASSWORD_STRENGTH_PRESENTATION[level];
      expect(barClass).not.toMatch(/-(red|yellow|green|blue|emerald)-\d/);
      expect(textClass).not.toMatch(/-(red|yellow|green|blue|emerald)-\d/);
    }
  });
});

describe("meetsAccountPasswordPolicy", () => {
  it("is the old sign-up rule: 8+ chars with a digit and a special", () => {
    expect(meetsAccountPasswordPolicy("abcdef1!")).toBe(true);
    expect(meetsAccountPasswordPolicy("abcdefg1!")).toBe(true);
  });
  it("rejects what the old checklist called weak even when the meter rates it fair or better", () => {
    expect(meetsAccountPasswordPolicy("abcde1!")).toBe(false); // 7 chars
    expect(meetsAccountPasswordPolicy("password")).toBe(false); // no digit, no special
    expect(meetsAccountPasswordPolicy("Password1")).toBe(false); // no special
    expect(meetsAccountPasswordPolicy("Password!")).toBe(false); // no digit
    expect(meetsAccountPasswordPolicy("correcthorsebatterystaple")).toBe(false);
    expect(
      evaluatePasswordStrength("correcthorsebatterystaple").level,
    ).not.toBe("weak");
  });
});
