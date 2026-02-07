/**
 * useGlobalShortcuts Hook
 *
 * App-wide keyboard shortcuts that work on every page (not just PropSphere).
 * Handles command palette, shortcuts help, and escape key globally.
 *
 * Unlike useKeyboardShortcuts (which is PropSphere-specific), this hook
 * provides navigation and UI shortcuts that are always available.
 *
 * Features:
 * - Ctrl+K / Cmd+K always fires, even when focused in input fields
 * - Escape always fires, even when focused in input fields
 * - ? only fires when NOT focused in an input field
 * - Cleans up listener on unmount
 */

import { useEffect, useCallback, useRef } from "react";

// =============================================================================
// TYPES
// =============================================================================

export interface UseGlobalShortcutsOptions {
  /** Called when Ctrl+K / Cmd+K is pressed */
  onOpenCommandPalette: () => void;
  /** Called when ? is pressed (outside input fields) */
  onShowShortcuts: () => void;
  /** Called when Escape is pressed */
  onEscape: () => void;
  /** Whether the global shortcuts are enabled (default: true) */
  enabled?: boolean;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Check if the active element is an input-like field where single-key
 * shortcuts (like ?) should be suppressed.
 */
function isInputFocused(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }

  if (target.isContentEditable) {
    return true;
  }

  if (target.closest('[role="textbox"]')) {
    return true;
  }

  return false;
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Registers app-wide keyboard shortcuts on `document`.
 *
 * @example
 * ```tsx
 * useGlobalShortcuts({
 *   onOpenCommandPalette: () => setCommandPaletteOpen(true),
 *   onShowShortcuts: () => setShortcutsHelpOpen(true),
 *   onEscape: () => {
 *     setCommandPaletteOpen(false);
 *     setShortcutsHelpOpen(false);
 *   },
 * });
 * ```
 */
export function useGlobalShortcuts({
  onOpenCommandPalette,
  onShowShortcuts,
  onEscape,
  enabled = true,
}: UseGlobalShortcutsOptions): void {
  // Keep callbacks in refs so the event handler never goes stale
  const callbacksRef = useRef({
    onOpenCommandPalette,
    onShowShortcuts,
    onEscape,
  });
  callbacksRef.current = {
    onOpenCommandPalette,
    onShowShortcuts,
    onEscape,
  };

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabledRef.current) {
      return;
    }

    // -----------------------------------------------------------------------
    // Ctrl+K / Cmd+K — always fires, even in inputs
    // -----------------------------------------------------------------------
    if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.stopPropagation();
      callbacksRef.current.onOpenCommandPalette();
      return;
    }

    // -----------------------------------------------------------------------
    // Escape — always fires, even in inputs, but does NOT preventDefault
    // so that other handlers (PropSphere clear target, etc.) can also act.
    // -----------------------------------------------------------------------
    if (event.key === "Escape") {
      callbacksRef.current.onEscape();
      return;
    }

    // -----------------------------------------------------------------------
    // All remaining shortcuts are suppressed when focused in input fields
    // -----------------------------------------------------------------------
    if (isInputFocused(event.target)) {
      return;
    }

    // -----------------------------------------------------------------------
    // ? — show shortcuts help (only when not in input)
    // -----------------------------------------------------------------------
    if (
      event.key === "?" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      callbacksRef.current.onShowShortcuts();
      return;
    }
  }, []);

  useEffect(() => {
    // Register in capture phase so global shortcuts fire BEFORE page-level
    // handlers (e.g. PropSphere's useKeyboardShortcuts). This prevents
    // duplicate `?` handling where both global and map overlays open.
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [handleKeyDown]);
}
