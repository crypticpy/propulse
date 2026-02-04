/**
 * Zustand store for undo/redo functionality
 *
 * Tracks undoable destructive actions like:
 * - Delete pin
 * - Clear target
 * - Hide spot
 * - Delete alert
 * - Clear recent targets
 *
 * Maximum history of 10 actions to prevent memory bloat.
 */

import { create } from "zustand";
import type { MapPin } from "@/types/pin";
import type { TargetLocation } from "@/stores/mapStore";
import type { DXSpot } from "@/types/dxcluster";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Union type of all undoable action types
 */
export type UndoableAction =
  | {
      type: "DELETE_PIN";
      /** The ID of the deleted pin */
      pinId: string;
      /** Full pin data for restoration */
      pinData: MapPin;
      /** Human-readable description for toast */
      description: string;
    }
  | {
      type: "CLEAR_TARGET";
      /** The target that was cleared */
      target: TargetLocation;
      /** Human-readable description for toast */
      description: string;
    }
  | {
      type: "HIDE_SPOT";
      /** The ID of the hidden spot */
      spotId: string;
      /** Full spot data for reference */
      spotData: DXSpot;
      /** Human-readable description for toast */
      description: string;
    }
  | {
      type: "DELETE_ALERT";
      /** The ID of the deleted alert */
      alertId: string;
      /** Alert data for restoration (if applicable) */
      alertData: unknown;
      /** Human-readable description for toast */
      description: string;
    }
  | {
      type: "CLEAR_RECENT_TARGETS";
      /** The targets that were cleared */
      targets: TargetLocation[];
      /** Human-readable description for toast */
      description: string;
    }
  | {
      type: "CLEAR_PINS";
      /** All pins that were cleared */
      pins: MapPin[];
      /** Human-readable description for toast */
      description: string;
    };

/**
 * Undo store state interface
 */
interface UndoState {
  /** Stack of undoable actions (most recent last) */
  history: UndoableAction[];
  /** Stack of redoable actions (most recent last) */
  redoStack: UndoableAction[];
  /** Toast to display (set when action is pushed or undo/redo is triggered) */
  activeToast: {
    action: UndoableAction;
    type: "undo" | "redo" | "action";
    timestamp: number;
  } | null;

  // Actions
  /** Push a new undoable action to history */
  pushAction: (action: UndoableAction) => void;
  /** Pop the most recent action from history (for undo) */
  undo: () => UndoableAction | null;
  /** Pop the most recent action from redo stack (for redo) */
  redo: () => UndoableAction | null;
  /** Clear all history and redo stack */
  clear: () => void;
  /** Clear the active toast */
  clearToast: () => void;
  /** Check if undo is available */
  canUndo: () => boolean;
  /** Check if redo is available */
  canRedo: () => boolean;
  /** Get the count of undoable actions */
  getHistoryCount: () => number;
  /** Get the count of redoable actions */
  getRedoCount: () => number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Maximum number of actions to keep in history */
const MAX_HISTORY = 10;

// =============================================================================
// STORE
// =============================================================================

/**
 * Undo/redo store for managing destructive action history
 *
 * @example
 * ```tsx
 * const { pushAction, undo, redo, canUndo, canRedo } = useUndoStore();
 *
 * // Record an undoable action
 * pushAction({
 *   type: 'DELETE_PIN',
 *   pinId: pin.id,
 *   pinData: pin,
 *   description: `Deleted pin "${pin.name || pin.grid}"`
 * });
 *
 * // Undo the last action
 * if (canUndo()) {
 *   const action = undo();
 *   // Handle restoration based on action.type
 * }
 *
 * // Redo the last undone action
 * if (canRedo()) {
 *   const action = redo();
 *   // Re-apply the action based on action.type
 * }
 * ```
 */
export const useUndoStore = create<UndoState>((set, get) => ({
  history: [],
  redoStack: [],
  activeToast: null,

  pushAction: (action) =>
    set((state) => ({
      // Keep only the most recent (MAX_HISTORY - 1) actions, then add the new one
      history: [...state.history.slice(-(MAX_HISTORY - 1)), action],
      // Clear redo stack when a new action is pushed
      redoStack: [],
      // Show toast for the new action
      activeToast: {
        action,
        type: "action",
        timestamp: Date.now(),
      },
    })),

  undo: () => {
    const state = get();
    if (state.history.length === 0) return null;

    const action = state.history[state.history.length - 1];

    set({
      history: state.history.slice(0, -1),
      redoStack: [...state.redoStack, action],
      activeToast: {
        action,
        type: "undo",
        timestamp: Date.now(),
      },
    });

    return action;
  },

  redo: () => {
    const state = get();
    if (state.redoStack.length === 0) return null;

    const action = state.redoStack[state.redoStack.length - 1];

    set({
      history: [...state.history, action],
      redoStack: state.redoStack.slice(0, -1),
      activeToast: {
        action,
        type: "redo",
        timestamp: Date.now(),
      },
    });

    return action;
  },

  clear: () =>
    set({
      history: [],
      redoStack: [],
      activeToast: null,
    }),

  clearToast: () => set({ activeToast: null }),

  canUndo: () => get().history.length > 0,

  canRedo: () => get().redoStack.length > 0,

  getHistoryCount: () => get().history.length,

  getRedoCount: () => get().redoStack.length,
}));

// =============================================================================
// SELECTORS
// =============================================================================

/**
 * Selector: Get the most recent undoable action (peek without pop)
 */
export const selectLastAction = (state: UndoState): UndoableAction | null =>
  state.history.length > 0 ? state.history[state.history.length - 1] : null;

/**
 * Selector: Get the most recent redoable action (peek without pop)
 */
export const selectLastRedoAction = (
  state: UndoState,
): UndoableAction | null =>
  state.redoStack.length > 0
    ? state.redoStack[state.redoStack.length - 1]
    : null;

/**
 * Selector: Get the active toast for display
 */
export const selectActiveToast = (state: UndoState): UndoState["activeToast"] =>
  state.activeToast;
