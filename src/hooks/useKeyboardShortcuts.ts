/**
 * useKeyboardShortcuts Hook
 *
 * Global keyboard event handler for PropSphere keyboard navigation.
 * Listens for keydown events and triggers actions based on shortcut definitions.
 *
 * Features:
 * - Skips shortcuts when focus is in input/textarea elements
 * - Supports modifier keys (ctrl, alt, shift, meta)
 * - Provides a function to temporarily disable shortcuts (for modals)
 */

import { useEffect, useCallback, useRef } from "react";
import type { KeyboardShortcut, KeyModifier } from "@/types/keyboard";
import { DEFAULT_SHORTCUTS } from "@/types/keyboard";

/**
 * Options for the useKeyboardShortcuts hook
 */
export interface UseKeyboardShortcutsOptions {
  /** Keyboard shortcuts to listen for (defaults to DEFAULT_SHORTCUTS) */
  shortcuts?: KeyboardShortcut[];
  /** Callback when a shortcut action is triggered */
  onAction: (action: string) => void;
  /** Whether shortcuts are enabled (default: true) */
  enabled?: boolean;
}

/**
 * Return value from the useKeyboardShortcuts hook
 */
export interface UseKeyboardShortcutsReturn {
  /** Temporarily disable all shortcuts */
  disable: () => void;
  /** Re-enable shortcuts after disabling */
  enable: () => void;
  /** Whether shortcuts are currently enabled */
  isEnabled: boolean;
}

/**
 * Check if an element should suppress keyboard shortcuts
 * (input fields, textareas, contenteditable elements)
 */
function shouldSuppressShortcuts(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  // Suppress for form inputs
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }

  // Suppress for contenteditable elements
  if (target.isContentEditable) {
    return true;
  }

  // Suppress if inside a Monaco editor or similar
  if (target.closest('[role="textbox"]')) {
    return true;
  }

  return false;
}

/**
 * Check if modifiers match for a keyboard event
 */
function modifiersMatch(
  event: KeyboardEvent,
  modifiers?: KeyModifier[],
): boolean {
  const requiredCtrl = modifiers?.includes("ctrl") ?? false;
  const requiredAlt = modifiers?.includes("alt") ?? false;
  const requiredShift = modifiers?.includes("shift") ?? false;
  const requiredMeta = modifiers?.includes("meta") ?? false;

  return (
    event.ctrlKey === requiredCtrl &&
    event.altKey === requiredAlt &&
    event.shiftKey === requiredShift &&
    event.metaKey === requiredMeta
  );
}

/**
 * Normalize key for comparison
 * Handles special cases like space bar
 */
function normalizeKey(key: string): string {
  // Normalize space representations
  if (key === "Space" || key === "Spacebar") {
    return " ";
  }
  return key;
}

/**
 * Hook for global keyboard shortcuts
 *
 * @example
 * ```tsx
 * const { disable, enable } = useKeyboardShortcuts({
 *   onAction: (action) => {
 *     switch (action) {
 *       case 'viewGlobe':
 *         setViewMode('globe');
 *         break;
 *       case 'showHelp':
 *         setShowHelp(true);
 *         break;
 *     }
 *   },
 * });
 *
 * // Disable shortcuts while a modal is open
 * useEffect(() => {
 *   if (modalOpen) {
 *     disable();
 *   } else {
 *     enable();
 *   }
 * }, [modalOpen, disable, enable]);
 * ```
 */
export function useKeyboardShortcuts({
  shortcuts = DEFAULT_SHORTCUTS,
  onAction,
  enabled = true,
}: UseKeyboardShortcutsOptions): UseKeyboardShortcutsReturn {
  // Track enabled state with ref for immediate updates in event handlers
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Track manually disabled state (separate from the enabled prop)
  const manuallyDisabledRef = useRef(false);

  // Handle keydown events
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Check if shortcuts are enabled
      if (!enabledRef.current || manuallyDisabledRef.current) {
        return;
      }

      // Skip if focused on input element
      if (shouldSuppressShortcuts(event.target)) {
        return;
      }

      // Normalize the pressed key
      const pressedKey = normalizeKey(event.key);

      // Find matching shortcut
      const matchingShortcut = shortcuts.find((shortcut) => {
        // Check key match (case-insensitive for letters)
        const shortcutKey = shortcut.key;
        const keysMatch =
          pressedKey === shortcutKey ||
          pressedKey.toLowerCase() === shortcutKey.toLowerCase();

        if (!keysMatch) {
          return false;
        }

        // Check modifiers match
        return modifiersMatch(event, shortcut.modifiers);
      });

      if (matchingShortcut) {
        // Prevent default for matched shortcuts
        event.preventDefault();
        event.stopPropagation();

        // Trigger the action
        onAction(matchingShortcut.action);
      }
    },
    [shortcuts, onAction],
  );

  // Add/remove event listener
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  // Disable function
  const disable = useCallback(() => {
    manuallyDisabledRef.current = true;
  }, []);

  // Enable function
  const enable = useCallback(() => {
    manuallyDisabledRef.current = false;
  }, []);

  return {
    disable,
    enable,
    isEnabled: enabled && !manuallyDisabledRef.current,
  };
}

export default useKeyboardShortcuts;
