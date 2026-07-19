/**
 * useFateKeyboard -- Keyboard shortcut handler for the F8 (Fate) skin.
 *
 * F1-F11: Band hop (tune to FT8 dial frequency)
 * Space: Quick-log the most recent CQ callsign
 * C: Toggle CQ-only filter
 * D: Toggle decoder on/off
 * Escape: Clear selection
 *
 * Shortcuts are suppressed when focus is in an input/textarea element.
 * Controlled by the `enabled` flag so overlays/modals can disable them.
 */

import { useEffect, useCallback, useRef, useMemo } from "react";
import { FT8_DIAL_FREQUENCIES } from "./useFateDecodes";
import type { EnrichedDecode } from "./useFateDecodes";

// ---- Band-to-F-key mapping (F1..F11 -> dial frequencies) --------------------

const FKEY_BAND_MAP: Record<string, string> = {
  F1: "160m",
  F2: "80m",
  F3: "40m",
  F4: "30m",
  F5: "20m",
  F6: "17m",
  F7: "15m",
  F8: "12m",
  F9: "10m",
  F10: "6m",
  F11: "2m",
};

/** Resolve an F-key to the FT8 dial frequency (Hz) for that band. */
function dialFreqForFKey(key: string): number | null {
  const band = FKEY_BAND_MAP[key];
  if (!band) return null;
  const entry = FT8_DIAL_FREQUENCIES.find(
    (f) => f.band === band && f.mode === "FT8",
  );
  return entry?.freqHz ?? null;
}

// ---- Interactive-target detection -------------------------------------------

/** ARIA roles that indicate the element handles its own keyboard input. */
const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "checkbox",
  "radio",
  "switch",
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "textbox",
  "combobox",
  "searchbox",
  "spinbutton",
  "slider",
]);

/**
 * True when the event target is a control that should receive the keystroke
 * itself (form fields, buttons, links, contenteditable, ARIA widgets). Single-
 * letter and Space shortcuts must not steal keys from these — e.g. Space
 * activating a focused button, or "c"/"d" being typed into a field.
 */
function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLButtonElement ||
    target instanceof HTMLAnchorElement
  ) {
    return true;
  }
  if (target.isContentEditable) return true;
  const role = target.getAttribute("role");
  return role != null && INTERACTIVE_ROLES.has(role);
}

// ---- Hook interface ---------------------------------------------------------

export interface UseFateKeyboardOptions {
  /** Tune radio to a frequency (Hz). */
  onPickFrequencyHz: (hz: number) => void;
  /** Toggle the FT8 decoder on/off. */
  onFt8Toggle: () => void;
  /** Current state of CQ-only filter. */
  showCqOnly: boolean;
  /** Toggle CQ-only filter. */
  onCqFilterChange: (value: boolean) => void;
  /** Quick-log a callsign. Called with the last CQ callsign on Space. */
  onQuickLog: (callsign: string) => void;
  /** Enriched decode array -- used to track the most recent CQ callsign. */
  decodes: EnrichedDecode[];
  /** Master enable/disable flag. */
  enabled: boolean;
}

export interface UseFateKeyboardResult {
  /** The most recent CQ callsign seen (for Space quick-log display). */
  lastCqCallsign: string | null;
}

// ---- Hook implementation ----------------------------------------------------

export function useFateKeyboard({
  onPickFrequencyHz,
  onFt8Toggle,
  showCqOnly,
  onCqFilterChange,
  onQuickLog,
  decodes,
  enabled,
}: UseFateKeyboardOptions): UseFateKeyboardResult {
  // Derive the most recent CQ callsign from decodes (sorted by time desc)
  const lastCqCallsign = useMemo(() => {
    // Find the most recent CQ decode with a parsedCallsign
    let best: EnrichedDecode | null = null;
    for (const d of decodes) {
      if (d.isCQ && d.parsedCallsign) {
        // Compare by epochMs (absolute), not the midnight-wrapping time, so the
        // newest CQ is still picked across 00:00 UTC.
        if (!best || d.epochMs > best.epochMs) {
          best = d;
        }
      }
    }
    return best?.parsedCallsign ?? null;
  }, [decodes]);

  // Refs to avoid stale closures in the keydown handler
  const onPickFrequencyHzRef = useRef(onPickFrequencyHz);
  onPickFrequencyHzRef.current = onPickFrequencyHz;

  const onFt8ToggleRef = useRef(onFt8Toggle);
  onFt8ToggleRef.current = onFt8Toggle;

  const showCqOnlyRef = useRef(showCqOnly);
  showCqOnlyRef.current = showCqOnly;

  const onCqFilterChangeRef = useRef(onCqFilterChange);
  onCqFilterChangeRef.current = onCqFilterChange;

  const onQuickLogRef = useRef(onQuickLog);
  onQuickLogRef.current = onQuickLog;

  const lastCqCallsignRef = useRef(lastCqCallsign);
  lastCqCallsignRef.current = lastCqCallsign;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Stable handler -- registered once, reads refs for current values
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabledRef.current) return;

    // Don't intercept when focus is on a control that handles its own keys
    // (form fields, buttons, links, contenteditable, ARIA widgets).
    if (isInteractiveTarget(e.target)) return;

    const key = e.key;

    // ---- F1..F11: Band hop --------------------------------------------------
    if (key.startsWith("F") && key.length >= 2) {
      const freqHz = dialFreqForFKey(key);
      if (freqHz != null) {
        e.preventDefault();
        onPickFrequencyHzRef.current(freqHz);
        return;
      }
    }

    // ---- Space: Quick-log last CQ callsign ----------------------------------
    if (key === " ") {
      const cs = lastCqCallsignRef.current;
      if (cs) {
        e.preventDefault(); // suppress page scroll only when we actually act
        onQuickLogRef.current(cs);
      }
      return;
    }

    // ---- C: Toggle CQ-only filter -------------------------------------------
    if (key === "c" || key === "C") {
      e.preventDefault();
      onCqFilterChangeRef.current(!showCqOnlyRef.current);
      return;
    }

    // ---- D: Toggle decoder --------------------------------------------------
    if (key === "d" || key === "D") {
      e.preventDefault();
      onFt8ToggleRef.current();
      return;
    }

    // ---- Escape: Clear highlight / selection --------------------------------
    if (key === "Escape") {
      // Don't preventDefault on Escape -- allow it to bubble for modal closing etc.
      return;
    }
  }, []);

  // Register / unregister event listener
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return { lastCqCallsign };
}
