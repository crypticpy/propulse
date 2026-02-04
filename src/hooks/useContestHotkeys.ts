/**
 * useContestHotkeys Hook
 *
 * Contest-specific keyboard shortcuts and ESM (Enter Sends Message) state machine
 * for high-rate, keyboard-only contest logging.
 *
 * Features:
 * - Default hotkey bindings for contest operations
 * - Band quick-select via Alt+1..9
 * - F1-F12 macro keys (CQ/EXCH/TU/etc.)
 * - ESM state machine for Run and S&P modes
 * - Configurable bindings (optional for v1)
 */

import { useEffect, useCallback, useRef, useState } from "react";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Operating mode for ESM state machine
 */
export type OperatingMode = "run" | "sp";

/**
 * ESM (Enter Sends Message) states for Run mode
 * IDLE -> CQ_SENT -> EXCH_SENT -> TU_SENT -> IDLE
 */
export type RunModeESMState = "IDLE" | "CQ_SENT" | "EXCH_SENT" | "TU_SENT";

/**
 * ESM states for S&P (Search & Pounce) mode
 * IDLE -> CALLING -> EXCH_SENT -> IDLE
 */
export type SPModeESMState = "IDLE" | "CALLING" | "EXCH_SENT";

/**
 * Combined ESM state type
 */
export type ESMState = RunModeESMState | SPModeESMState;

/**
 * Macro types for F-key mappings
 */
export type MacroType =
  | "CQ"
  | "EXCH"
  | "TU"
  | "QRZ"
  | "AGN"
  | "CFM"
  | "NR"
  | "73"
  | "CUSTOM1"
  | "CUSTOM2"
  | "CUSTOM3"
  | "CUSTOM4";

/**
 * Band identifiers for quick-select
 */
export type ContestBand =
  | "160m"
  | "80m"
  | "40m"
  | "20m"
  | "15m"
  | "10m"
  | "6m"
  | "2m"
  | "70cm";

/**
 * Hotkey action types
 */
export type HotkeyAction =
  | "log"
  | "wipeInput"
  | "undoLast"
  | "editLast"
  | "bandSelect"
  | "macro"
  | "advanceESM";

/**
 * Hotkey definition
 */
export interface ContestHotkey {
  /** The key code (e.g., 'Enter', 'Escape', 'F1', '1') */
  key: string;
  /** Modifier keys required */
  modifiers?: ("ctrl" | "alt" | "shift" | "meta")[];
  /** The action to trigger */
  action: HotkeyAction;
  /** Additional data (band for bandSelect, macro type for macro) */
  data?: string;
  /** Human-readable description */
  description: string;
}

/**
 * Macro definition
 */
export interface ContestMacro {
  /** F-key number (1-12) */
  fKey: number;
  /** Macro type */
  type: MacroType;
  /** Display text for UI */
  displayText: string;
  /** Macro content/message (for v1, just returns the type) */
  content: string;
}

/**
 * ESM state machine result
 */
export interface ESMTransitionResult {
  /** The new ESM state after transition */
  newState: ESMState;
  /** Action to perform (e.g., 'sendMacro', 'log') */
  action: "sendMacro" | "log" | "none";
  /** Macro to send if action is 'sendMacro' */
  macro?: MacroType;
}

/**
 * Callbacks for contest hotkey actions
 */
export interface ContestHotkeyCallbacks {
  /** Called when logging/advancing ESM state via Enter */
  onLog?: () => void;
  /** Called when wiping input via Escape */
  onWipeInput?: () => void;
  /** Called when undoing last QSO via Ctrl+Z */
  onUndoLast?: () => void;
  /** Called when editing last QSO via Ctrl+E */
  onEditLast?: () => void;
  /** Called when changing band via Alt+1..9 */
  onBandChange?: (band: ContestBand) => void;
  /** Called when triggering a macro via F1..F12 */
  onMacro?: (macro: MacroType, content: string) => void;
  /** Called when ESM state changes */
  onESMStateChange?: (state: ESMState, mode: OperatingMode) => void;
}

/**
 * Options for the useContestHotkeys hook
 */
export interface UseContestHotkeysOptions {
  /** Callbacks for hotkey actions */
  callbacks: ContestHotkeyCallbacks;
  /** Current operating mode (run or s&p) */
  mode: OperatingMode;
  /** Whether hotkeys are enabled (default: true) */
  enabled?: boolean;
  /** Custom hotkey bindings (optional, merges with defaults) */
  customBindings?: Partial<Record<HotkeyAction, ContestHotkey>>;
  /** Custom macro definitions (optional, merges with defaults) */
  customMacros?: Partial<Record<number, ContestMacro>>;
}

/**
 * Return value from the useContestHotkeys hook
 */
export interface UseContestHotkeysReturn {
  /** Current ESM state */
  esmState: ESMState;
  /** Reset ESM state to IDLE */
  resetESM: () => void;
  /** Manually advance ESM state (e.g., for UI buttons) */
  advanceESM: () => ESMTransitionResult;
  /** Get the current macro bindings */
  getMacros: () => ContestMacro[];
  /** Get the current hotkey bindings */
  getHotkeys: () => ContestHotkey[];
  /** Temporarily disable hotkeys */
  disable: () => void;
  /** Re-enable hotkeys */
  enable: () => void;
  /** Whether hotkeys are currently enabled */
  isEnabled: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Band quick-select mapping (Alt+1..9)
 */
export const BAND_QUICK_SELECT: Record<string, ContestBand> = {
  "1": "160m",
  "2": "80m",
  "3": "40m",
  "4": "20m",
  "5": "15m",
  "6": "10m",
  "7": "6m",
  "8": "2m",
  "9": "70cm",
};

/**
 * Default macro definitions (F1-F12)
 */
export const DEFAULT_MACROS: ContestMacro[] = [
  { fKey: 1, type: "CQ", displayText: "CQ", content: "CQ" },
  { fKey: 2, type: "EXCH", displayText: "Exchange", content: "EXCH" },
  { fKey: 3, type: "TU", displayText: "TU/QRZ", content: "TU" },
  { fKey: 4, type: "QRZ", displayText: "QRZ?", content: "QRZ" },
  { fKey: 5, type: "AGN", displayText: "Again?", content: "AGN" },
  { fKey: 6, type: "CFM", displayText: "Confirm", content: "CFM" },
  { fKey: 7, type: "NR", displayText: "Number?", content: "NR" },
  { fKey: 8, type: "73", displayText: "73", content: "73" },
  { fKey: 9, type: "CUSTOM1", displayText: "Custom 1", content: "CUSTOM1" },
  { fKey: 10, type: "CUSTOM2", displayText: "Custom 2", content: "CUSTOM2" },
  { fKey: 11, type: "CUSTOM3", displayText: "Custom 3", content: "CUSTOM3" },
  { fKey: 12, type: "CUSTOM4", displayText: "Custom 4", content: "CUSTOM4" },
];

/**
 * Default hotkey bindings
 */
export const DEFAULT_HOTKEYS: ContestHotkey[] = [
  {
    key: "Enter",
    action: "advanceESM",
    description: "Log QSO / Advance ESM state",
  },
  {
    key: "Escape",
    action: "wipeInput",
    description: "Wipe input field",
  },
  {
    key: "z",
    modifiers: ["ctrl"],
    action: "undoLast",
    description: "Undo last QSO",
  },
  {
    key: "e",
    modifiers: ["ctrl"],
    action: "editLast",
    description: "Edit last QSO",
  },
  // Band quick-select (Alt+1..9)
  ...Object.entries(BAND_QUICK_SELECT).map(
    ([key, band]): ContestHotkey => ({
      key,
      modifiers: ["alt"],
      action: "bandSelect",
      data: band,
      description: `Select ${band}`,
    }),
  ),
  // F-key macros (F1..F12)
  ...DEFAULT_MACROS.map(
    (macro): ContestHotkey => ({
      key: `F${macro.fKey}`,
      action: "macro",
      data: macro.type,
      description: macro.displayText,
    }),
  ),
];

// =============================================================================
// ESM STATE MACHINE HELPERS
// =============================================================================

/**
 * Get the initial ESM state for a given operating mode
 */
export function getInitialESMState(_mode: OperatingMode): ESMState {
  // Both Run and S&P modes start at IDLE
  // Parameter kept for future extensibility (e.g., remembering last state)
  return "IDLE";
}

/**
 * Compute the next ESM state and action for Run mode
 */
export function advanceRunModeESM(
  currentState: RunModeESMState,
): ESMTransitionResult {
  switch (currentState) {
    case "IDLE":
      return {
        newState: "CQ_SENT",
        action: "sendMacro",
        macro: "CQ",
      };
    case "CQ_SENT":
      return {
        newState: "EXCH_SENT",
        action: "sendMacro",
        macro: "EXCH",
      };
    case "EXCH_SENT":
      return {
        newState: "TU_SENT",
        action: "sendMacro",
        macro: "TU",
      };
    case "TU_SENT":
      // Log the QSO and return to IDLE
      return {
        newState: "IDLE",
        action: "log",
      };
    default:
      return {
        newState: "IDLE",
        action: "none",
      };
  }
}

/**
 * Compute the next ESM state and action for S&P mode
 */
export function advanceSPModeESM(
  currentState: SPModeESMState,
): ESMTransitionResult {
  switch (currentState) {
    case "IDLE":
      // In S&P, first Enter sends your call (CALLING state)
      return {
        newState: "CALLING",
        action: "sendMacro",
        macro: "CQ", // In S&P, this would be sending your call
      };
    case "CALLING":
      // After they respond, send exchange
      return {
        newState: "EXCH_SENT",
        action: "sendMacro",
        macro: "EXCH",
      };
    case "EXCH_SENT":
      // Log the QSO and return to IDLE
      return {
        newState: "IDLE",
        action: "log",
      };
    default:
      return {
        newState: "IDLE",
        action: "none",
      };
  }
}

/**
 * Advance the ESM state machine based on current mode
 */
export function advanceESMState(
  currentState: ESMState,
  mode: OperatingMode,
): ESMTransitionResult {
  if (mode === "run") {
    return advanceRunModeESM(currentState as RunModeESMState);
  } else {
    return advanceSPModeESM(currentState as SPModeESMState);
  }
}

/**
 * Get human-readable description of ESM state
 */
export function getESMStateDescription(
  state: ESMState,
  mode: OperatingMode,
): string {
  if (mode === "run") {
    switch (state) {
      case "IDLE":
        return "Ready to call CQ";
      case "CQ_SENT":
        return "CQ sent - waiting for reply";
      case "EXCH_SENT":
        return "Exchange sent - waiting for confirmation";
      case "TU_SENT":
        return "TU sent - ready to log";
      default:
        return "Ready";
    }
  } else {
    switch (state) {
      case "IDLE":
        return "Ready to call";
      case "CALLING":
        return "Calling - waiting for response";
      case "EXCH_SENT":
        return "Exchange sent - ready to log";
      default:
        return "Ready";
    }
  }
}

/**
 * Get the expected next action in ESM sequence
 */
export function getNextESMAction(state: ESMState, mode: OperatingMode): string {
  const result = advanceESMState(state, mode);
  if (result.action === "log") {
    return "Log QSO";
  } else if (result.action === "sendMacro" && result.macro) {
    return `Send ${result.macro}`;
  }
  return "Continue";
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

/**
 * Check if an element should suppress contest hotkeys
 * Note: For contest mode, we DO want hotkeys active even in inputs,
 * except for certain modifierless keys
 */
function shouldSuppressHotkey(
  event: KeyboardEvent,
  hotkey: ContestHotkey,
): boolean {
  const {target} = event;
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  const isInputField =
    tagName === "input" || tagName === "textarea" || tagName === "select";

  // Allow modifier-based shortcuts (Ctrl+Z, Ctrl+E, Alt+N) in input fields
  if (hotkey.modifiers && hotkey.modifiers.length > 0) {
    return false;
  }

  // Allow F-keys in input fields
  if (hotkey.key.startsWith("F") && hotkey.key.length <= 3) {
    return false;
  }

  // Allow Enter and Escape in input fields (core contest workflow)
  if (hotkey.key === "Enter" || hotkey.key === "Escape") {
    return false;
  }

  // Suppress other keys in input fields
  if (isInputField) {
    return true;
  }

  return false;
}

/**
 * Check if modifiers match for a keyboard event
 */
function modifiersMatch(
  event: KeyboardEvent,
  modifiers?: ("ctrl" | "alt" | "shift" | "meta")[],
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
 * Hook for contest-specific keyboard shortcuts and ESM state machine
 *
 * @example
 * ```tsx
 * const { esmState, advanceESM, resetESM } = useContestHotkeys({
 *   callbacks: {
 *     onLog: () => handleLogQSO(),
 *     onWipeInput: () => setInput(''),
 *     onUndoLast: () => undoLastQSO(),
 *     onEditLast: () => setShowEditModal(true),
 *     onBandChange: (band) => setCurrentBand(band),
 *     onMacro: (macro, content) => toast.info(`Macro: ${content}`),
 *   },
 *   mode: runMode,
 *   enabled: isContestActive,
 * });
 * ```
 */
export function useContestHotkeys({
  callbacks,
  mode,
  enabled = true,
  customBindings,
  customMacros,
}: UseContestHotkeysOptions): UseContestHotkeysReturn {
  // Track enabled state with ref for immediate updates in event handlers
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Track manually disabled state
  const manuallyDisabledRef = useRef(false);

  // ESM state
  const [esmState, setESMState] = useState<ESMState>(getInitialESMState(mode));

  // Reset ESM state when mode changes
  useEffect(() => {
    setESMState(getInitialESMState(mode));
  }, [mode]);

  // Build merged hotkey and macro lists
  const hotkeys = useRef<ContestHotkey[]>(DEFAULT_HOTKEYS);
  const macros = useRef<ContestMacro[]>(DEFAULT_MACROS);

  // Merge custom bindings if provided
  useEffect(() => {
    if (customBindings) {
      hotkeys.current = DEFAULT_HOTKEYS.map((hotkey) => {
        const customKey = Object.entries(customBindings).find(
          ([, custom]) => custom?.action === hotkey.action,
        );
        return customKey ? { ...hotkey, ...customKey[1] } : hotkey;
      });
    } else {
      hotkeys.current = DEFAULT_HOTKEYS;
    }
  }, [customBindings]);

  useEffect(() => {
    if (customMacros) {
      macros.current = DEFAULT_MACROS.map((macro) => {
        const custom = customMacros[macro.fKey];
        return custom ? { ...macro, ...custom } : macro;
      });
    } else {
      macros.current = DEFAULT_MACROS;
    }
  }, [customMacros]);

  // Advance ESM state manually
  const advanceESM = useCallback((): ESMTransitionResult => {
    const result = advanceESMState(esmState, mode);
    setESMState(result.newState);
    callbacks.onESMStateChange?.(result.newState, mode);
    return result;
  }, [esmState, mode, callbacks]);

  // Reset ESM to IDLE
  const resetESM = useCallback(() => {
    const initialState = getInitialESMState(mode);
    setESMState(initialState);
    callbacks.onESMStateChange?.(initialState, mode);
  }, [mode, callbacks]);

  // Handle keydown events
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Check if hotkeys are enabled
      if (!enabledRef.current || manuallyDisabledRef.current) {
        return;
      }

      // Find matching hotkey
      const matchingHotkey = hotkeys.current.find((hotkey) => {
        // Check key match (case-insensitive for letters)
        const pressedKey = event.key;
        const keysMatch =
          pressedKey === hotkey.key ||
          pressedKey.toLowerCase() === hotkey.key.toLowerCase();

        if (!keysMatch) {
          return false;
        }

        // Check modifiers match
        return modifiersMatch(event, hotkey.modifiers);
      });

      if (!matchingHotkey) {
        return;
      }

      // Check if we should suppress this hotkey
      if (shouldSuppressHotkey(event, matchingHotkey)) {
        return;
      }

      // Prevent default for matched shortcuts
      event.preventDefault();
      event.stopPropagation();

      // Execute the action
      switch (matchingHotkey.action) {
        case "advanceESM": {
          const result = advanceESMState(esmState, mode);
          setESMState(result.newState);
          callbacks.onESMStateChange?.(result.newState, mode);

          if (result.action === "log") {
            callbacks.onLog?.();
          } else if (result.action === "sendMacro" && result.macro) {
            const macro = macros.current.find((m) => m.type === result.macro);
            callbacks.onMacro?.(result.macro, macro?.content ?? result.macro);
          }
          break;
        }

        case "log":
          callbacks.onLog?.();
          break;

        case "wipeInput":
          callbacks.onWipeInput?.();
          resetESM();
          break;

        case "undoLast":
          callbacks.onUndoLast?.();
          break;

        case "editLast":
          callbacks.onEditLast?.();
          break;

        case "bandSelect":
          if (matchingHotkey.data) {
            callbacks.onBandChange?.(matchingHotkey.data as ContestBand);
          }
          break;

        case "macro":
          if (matchingHotkey.data) {
            const macroType = matchingHotkey.data as MacroType;
            const macro = macros.current.find((m) => m.type === macroType);
            callbacks.onMacro?.(macroType, macro?.content ?? macroType);
          }
          break;
      }
    },
    [esmState, mode, callbacks, resetESM],
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

  // Get macros
  const getMacros = useCallback(() => {
    return macros.current;
  }, []);

  // Get hotkeys
  const getHotkeys = useCallback(() => {
    return hotkeys.current;
  }, []);

  return {
    esmState,
    resetESM,
    advanceESM,
    getMacros,
    getHotkeys,
    disable,
    enable,
    isEnabled: enabled && !manuallyDisabledRef.current,
  };
}

export default useContestHotkeys;
