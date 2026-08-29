/**
 * useNetAccessibility Hook
 *
 * Returns Tailwind class modifiers tuned for net session UIs.
 * Reads textScale and highContrast from settingsStore — no new
 * settings are introduced. Ham operators average age 68; this hook
 * makes check-in lists, queue panels, and timers easier to read.
 */

import { useSettingsStore } from "@/stores/settingsStore";

export interface NetAccessibilityClasses {
  /** Text size class boost */
  textXs: string; // normally 'text-xs', large mode 'text-sm'
  textSm: string; // normally 'text-sm', large mode 'text-base'
  textBase: string; // normally 'text-base', large mode 'text-lg'
  textLg: string; // normally 'text-lg', large mode 'text-xl'
  /** Touch target minimum height */
  minTouch: string; // normally '', large mode 'min-h-[44px]'
  /** Border width class */
  border: string; // normally 'border', high contrast 'border-2'
  /** Whether large font mode is active */
  isLargeFont: boolean;
  /** Whether high contrast mode is active */
  isHighContrast: boolean;
}

export function useNetAccessibility(): NetAccessibilityClasses {
  const textScale = useSettingsStore((s) => s.textScale ?? "md");
  const highContrast = useSettingsStore((s) => s.highContrast);

  // "lg"/"xl" text scale ➜ large font mode
  const isLargeFont = textScale === "lg" || textScale === "xl";
  const isHighContrast = !!highContrast;

  return {
    textXs: isLargeFont ? "text-sm" : "text-xs",
    textSm: isLargeFont ? "text-base" : "text-sm",
    textBase: isLargeFont ? "text-lg" : "text-base",
    textLg: isLargeFont ? "text-xl" : "text-lg",
    minTouch: isLargeFont ? "min-h-[44px]" : "",
    border: isHighContrast ? "border-2" : "border",
    isLargeFont,
    isHighContrast,
  };
}
