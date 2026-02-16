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
import { useOperatingStore } from "@/stores/operatingStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { ALL_BANDS } from "@/types/user";
import type { BandId } from "@/types/user";
import { ALL_UI_MODES } from "@/lib/utils/modeNormalize";

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

    // -----------------------------------------------------------------------
    // B — cycle active band forward (only when not in input, not contest-locked)
    // -----------------------------------------------------------------------
    if (
      event.key === "b" &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const opState = useOperatingStore.getState();
      if (opState.contestSessionId) return; // contest controls band

      event.preventDefault();
      event.stopImmediatePropagation();

      const favored = useSettingsStore.getState().favoredBands?.primary ?? [];
      const bandList: BandId[] = favored.length > 0 ? favored : [...ALL_BANDS];
      const currentIdx = bandList.indexOf(opState.activeBand);
      const nextIdx =
        currentIdx === -1 ? 0 : (currentIdx + 1) % bandList.length;
      opState.setManualBand(bandList[nextIdx]);
      return;
    }

    // -----------------------------------------------------------------------
    // Shift+B — cycle active band reverse (only when not in input, not contest-locked)
    // -----------------------------------------------------------------------
    if (
      event.key === "B" &&
      event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const opState = useOperatingStore.getState();
      if (opState.contestSessionId) return; // contest controls band

      event.preventDefault();
      event.stopImmediatePropagation();

      const favored = useSettingsStore.getState().favoredBands?.primary ?? [];
      const bandList: BandId[] = favored.length > 0 ? favored : [...ALL_BANDS];
      const currentIdx = bandList.indexOf(opState.activeBand);
      const prevIdx =
        currentIdx === -1
          ? bandList.length - 1
          : (currentIdx - 1 + bandList.length) % bandList.length;
      opState.setManualBand(bandList[prevIdx]);
      return;
    }

    // -----------------------------------------------------------------------
    // M — cycle active mode forward (only when not in input, not contest-locked)
    // -----------------------------------------------------------------------
    if (
      event.key === "m" &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const opState = useOperatingStore.getState();
      if (opState.contestSessionId) return; // contest controls mode

      event.preventDefault();
      event.stopImmediatePropagation();

      const currentIdx = ALL_UI_MODES.indexOf(opState.activeMode);
      const nextIdx =
        currentIdx === -1 ? 0 : (currentIdx + 1) % ALL_UI_MODES.length;
      opState.setManualMode(ALL_UI_MODES[nextIdx]);
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
