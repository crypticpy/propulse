/**
 * Accessibility Utilities
 *
 * Core utilities for making PropSphere accessible to users with visual impairments,
 * motor difficulties, or those using assistive technologies.
 */

/**
 * Announce a message to screen readers using an ARIA live region.
 *
 * @param message - The message to announce
 * @param priority - 'polite' waits for idle, 'assertive' interrupts immediately
 *
 * @example
 * ```ts
 * announceToScreenReader('5 new DX spots loaded');
 * announceToScreenReader('Alert: Solar storm detected!', 'assertive');
 * ```
 */
export function announceToScreenReader(
  message: string,
  priority: "polite" | "assertive" = "polite",
): void {
  // Create the announcement element
  const announcement = document.createElement("div");
  announcement.setAttribute("aria-live", priority);
  announcement.setAttribute("aria-atomic", "true");
  announcement.setAttribute(
    "role",
    priority === "assertive" ? "alert" : "status",
  );
  announcement.className = "sr-only";
  announcement.style.cssText = `
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    padding: 0 !important;
    margin: -1px !important;
    overflow: hidden !important;
    clip: rect(0, 0, 0, 0) !important;
    white-space: nowrap !important;
    border: 0 !important;
  `;

  // Add to DOM
  document.body.appendChild(announcement);

  // Set text after a small delay to ensure screen readers detect the change
  requestAnimationFrame(() => {
    announcement.textContent = message;
  });

  // Remove after announcement is likely read
  setTimeout(() => {
    announcement.remove();
  }, 1500);
}

/**
 * Check if user prefers reduced motion.
 * Respects the 'prefers-reduced-motion' media query.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Check if user prefers high contrast mode.
 * Respects the 'prefers-contrast' media query.
 */
export function prefersHighContrast(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia("(prefers-contrast: more)").matches;
}

/**
 * Check if user prefers dark mode.
 * PropSphere is dark by default, but this can be useful for adjustments.
 */
export function prefersDarkMode(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Focus trap utility for modals.
 * Returns cleanup function to restore focus.
 */
export function createFocusTrap(containerElement: HTMLElement): () => void {
  const previousActiveElement = document.activeElement as HTMLElement | null;
  const focusableSelector =
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  const focusableElements =
    containerElement.querySelectorAll<HTMLElement>(focusableSelector);
  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];

  // Focus first focusable element
  if (firstFocusable) {
    firstFocusable.focus();
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Tab") {
      return;
    }

    if (e.shiftKey) {
          // Shift + Tab
          if (document.activeElement === firstFocusable) {
            e.preventDefault();
            lastFocusable?.focus();
          }
        }
    else if (document.activeElement === lastFocusable) {
            e.preventDefault();
            firstFocusable?.focus();
          }
  };

  containerElement.addEventListener("keydown", handleKeyDown);

  // Return cleanup function
  return () => {
    containerElement.removeEventListener("keydown", handleKeyDown);
    // Restore focus to previously focused element
    if (
      previousActiveElement &&
      typeof previousActiveElement.focus === "function"
    ) {
      previousActiveElement.focus();
    }
  };
}

/**
 * Generate a unique ID for ARIA relationships.
 */
let idCounter = 0;
export function generateA11yId(prefix = "a11y"): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/**
 * Color blind simulation types.
 * Used for testing color accessibility.
 */
export type ColorBlindType =
  | "protanopia" // Red-blind
  | "deuteranopia" // Green-blind
  | "tritanopia" // Blue-blind
  | "achromatopsia"; // Total color blindness

/**
 * Get CSS filter for simulating color blindness.
 * Useful for testing color accessibility.
 */
export function getColorBlindFilter(type: ColorBlindType): string {
  const filters: Record<ColorBlindType, string> = {
    protanopia:
      'url(\'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><filter id="protanopia"><feColorMatrix type="matrix" values="0.567,0.433,0,0,0 0.558,0.442,0,0,0 0,0.242,0.758,0,0 0,0,0,1,0"/></filter></svg>#protanopia\')',
    deuteranopia:
      'url(\'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><filter id="deuteranopia"><feColorMatrix type="matrix" values="0.625,0.375,0,0,0 0.7,0.3,0,0,0 0,0.3,0.7,0,0 0,0,0,1,0"/></filter></svg>#deuteranopia\')',
    tritanopia:
      'url(\'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><filter id="tritanopia"><feColorMatrix type="matrix" values="0.95,0.05,0,0,0 0,0.433,0.567,0,0 0,0.475,0.525,0,0 0,0,0,1,0"/></filter></svg>#tritanopia\')',
    achromatopsia:
      'url(\'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><filter id="achromatopsia"><feColorMatrix type="matrix" values="0.299,0.587,0.114,0,0 0.299,0.587,0.114,0,0 0.299,0.587,0.114,0,0 0,0,0,1,0"/></filter></svg>#achromatopsia\')',
  };
  return filters[type];
}

/**
 * Get an accessible description for a propagation status.
 * Useful for screen readers when colors alone convey meaning.
 */
export function getStatusDescription(
  status: "excellent" | "good" | "fair" | "poor" | "closed",
): string {
  const descriptions: Record<typeof status, string> = {
    excellent: "Excellent conditions - strong signals expected",
    good: "Good conditions - reliable communication likely",
    fair: "Fair conditions - may work with patience",
    poor: "Poor conditions - marginal, try weak-signal modes",
    closed: "Band closed - propagation unlikely",
  };
  return descriptions[status];
}

/**
 * Get an accessible icon indicator for a status.
 * Returns both a visual icon and screen reader text.
 */
export function getStatusIndicator(
  status: "excellent" | "good" | "fair" | "poor" | "closed",
): { icon: string; label: string; pattern?: string } {
  const indicators: Record<
    typeof status,
    { icon: string; label: string; pattern?: string }
  > = {
    excellent: { icon: "++", label: "Excellent", pattern: "solid" },
    good: { icon: "+", label: "Good", pattern: "solid" },
    fair: { icon: "~", label: "Fair", pattern: "dashed" },
    poor: { icon: "-", label: "Poor", pattern: "dotted" },
    closed: { icon: "X", label: "Closed", pattern: "none" },
  };
  return indicators[status];
}

/**
 * Get accessible text for difficulty levels.
 * Used in path analysis for screen readers.
 */
export function getDifficultyDescription(
  difficulty: 1 | 2 | 3 | 4 | 5,
): string {
  const descriptions: Record<typeof difficulty, string> = {
    1: "Easy - short distance, clear path",
    2: "Moderate - standard conditions expected",
    3: "Challenging - may require patience",
    4: "Difficult - marginal conditions, consider digital modes",
    5: "Extreme - long distance or difficult path, try during optimal times",
  };
  return descriptions[difficulty];
}

/**
 * Format a bearing for screen readers.
 */
export function formatBearingForA11y(bearing: number): string {
  const directions = [
    "north",
    "northeast",
    "east",
    "southeast",
    "south",
    "southwest",
    "west",
    "northwest",
  ];
  const index = Math.round(bearing / 45) % 8;
  return `${Math.round(bearing)} degrees, ${directions[index]}`;
}

/**
 * Format a distance for screen readers.
 */
export function formatDistanceForA11y(
  distanceKm: number,
  useImperial: boolean,
): string {
  if (useImperial) {
    const miles = distanceKm * 0.621371;
    if (miles < 100) {
      return `${Math.round(miles)} miles`;
    }
    return `${Math.round(miles / 100) * 100} miles`;
  }
  if (distanceKm < 100) {
    return `${Math.round(distanceKm)} kilometers`;
  }
  return `${Math.round(distanceKm / 100) * 100} kilometers`;
}

/**
 * Format a frequency for screen readers.
 */
export function formatFrequencyForA11y(freqMhz: number): string {
  return `${freqMhz.toFixed(3)} megahertz`;
}

/**
 * Check if an element is visible in the viewport.
 * Useful for skip-link implementations.
 */
export function isElementVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <=
      (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * Skip to main content handler.
 * Focuses the main content area.
 */
export function skipToMain(): void {
  const main = document.querySelector<HTMLElement>(
    "main, [role='main'], #main-content",
  );
  if (main) {
    main.tabIndex = -1;
    main.focus();
    main.scrollIntoView({ behavior: "smooth" });
  }
}

/**
 * Get keyboard shortcut description for screen readers.
 */
export function getKeyboardShortcutDescription(
  key: string,
  modifiers?: string[],
): string {
  const modifierNames: Record<string, string> = {
    ctrl: "Control",
    alt: "Alt",
    shift: "Shift",
    meta: "Command",
  };

  const modifierParts = modifiers
    ? modifiers.map((m) => modifierNames[m] || m).join(" plus ")
    : "";

  const keyName = key === " " ? "Space" : key;

  if (modifierParts) {
    return `${modifierParts} plus ${keyName}`;
  }
  return keyName;
}
