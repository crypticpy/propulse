/**
 * useUndoRedo Hook
 *
 * Provides undo/redo functionality with keyboard shortcuts:
 * - Ctrl+Z (or Cmd+Z on Mac): Undo
 * - Ctrl+Shift+Z (or Cmd+Shift+Z) or Ctrl+Y: Redo
 *
 * Handles restoration of:
 * - Deleted pins
 * - Cleared targets
 * - Hidden spots
 * - Deleted alerts
 * - Cleared recent targets
 */

import { useEffect, useCallback, useRef } from "react";
import { useUndoStore, type UndoableAction } from "@/stores/undoStore";
import { usePinStore } from "@/stores/pinStore";
import { useMapStore } from "@/stores/mapStore";
import { useDXStore } from "@/stores/dxStore";

// =============================================================================
// TYPES
// =============================================================================

export interface UseUndoRedoOptions {
  /** Whether keyboard shortcuts are enabled (default: true) */
  enabled?: boolean;
}

export interface UseUndoRedoReturn {
  /** Perform undo of the last action */
  performUndo: () => void;
  /** Perform redo of the last undone action */
  performRedo: () => void;
  /** Record a new undoable action */
  pushAction: (action: UndoableAction) => void;
  /** Check if undo is available */
  canUndo: boolean;
  /** Check if redo is available */
  canRedo: boolean;
  /** Number of undoable actions */
  historyCount: number;
  /** Number of redoable actions */
  redoCount: number;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

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

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook for undo/redo functionality with keyboard shortcuts
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { performUndo, performRedo, pushAction, canUndo, canRedo } = useUndoRedo();
 *
 *   const handleDeletePin = (pin: MapPin) => {
 *     // Record the action before deleting
 *     pushAction({
 *       type: 'DELETE_PIN',
 *       pinId: pin.id,
 *       pinData: pin,
 *       description: `Deleted pin "${pin.name || pin.grid}"`
 *     });
 *
 *     // Now delete the pin
 *     pinStore.removePin(pin.id);
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={performUndo} disabled={!canUndo}>Undo</button>
 *       <button onClick={performRedo} disabled={!canRedo}>Redo</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useUndoRedo({
  enabled = true,
}: UseUndoRedoOptions = {}): UseUndoRedoReturn {
  const {
    undo,
    redo,
    canUndo: checkCanUndo,
    canRedo: checkCanRedo,
    pushAction,
    getHistoryCount,
    getRedoCount,
  } = useUndoStore();

  // Use refs to avoid stale closures in event handlers
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  /**
   * Perform undo: restore the state based on action type
   */
  const performUndo = useCallback(() => {
    const action = undo();
    if (!action) {
      return;
    }

    switch (action.type) {
      case "DELETE_PIN": {
        // Restore the deleted pin
        const pinStore = usePinStore.getState();
        pinStore.addPin({
          lat: action.pinData.lat,
          lon: action.pinData.lon,
          grid: action.pinData.grid,
          name: action.pinData.name,
          color: action.pinData.color,
          category: action.pinData.category,
          notes: action.pinData.notes,
          expiresAt: action.pinData.expiresAt,
        });
        break;
      }

      case "CLEAR_TARGET": {
        // Restore the cleared target
        const mapStore = useMapStore.getState();
        mapStore.setTarget(action.target);
        break;
      }

      case "HIDE_SPOT": {
        // Unhide the spot
        const dxStore = useDXStore.getState();
        dxStore.unhideSpot(action.spotId);
        break;
      }

      case "CLEAR_RECENT_TARGETS": {
        // Note: This is complex because we'd need to restore the exact array
        // For now, we just restore the targets one by one (they'll be added to recent)
        const mapStore = useMapStore.getState();
        // Set each target to add it back to recent targets
        action.targets.forEach((target) => {
          mapStore.setTarget(target);
        });
        // Clear the current target if there was one (or set to last in list)
        if (action.targets.length > 0) {
          mapStore.setTarget(action.targets[0]);
        }
        break;
      }

      case "CLEAR_PINS": {
        // Restore all cleared pins
        const pinStore = usePinStore.getState();
        action.pins.forEach((pin) => {
          pinStore.addPin({
            lat: pin.lat,
            lon: pin.lon,
            grid: pin.grid,
            name: pin.name,
            color: pin.color,
            category: pin.category,
            notes: pin.notes,
            expiresAt: pin.expiresAt,
          });
        });
        break;
      }

      case "DELETE_ALERT": {
        // Filtered out by undoStore.pushAction; should never reach here
        break;
      }
    }
  }, [undo]);

  /**
   * Perform redo: re-apply the undone action
   */
  const performRedo = useCallback(() => {
    const action = redo();
    if (!action) {
      return;
    }

    switch (action.type) {
      case "DELETE_PIN": {
        // Re-delete the pin
        const pinStore = usePinStore.getState();
        pinStore.removePin(action.pinId);
        break;
      }

      case "CLEAR_TARGET": {
        // Re-clear the target
        const mapStore = useMapStore.getState();
        mapStore.setTarget(null);
        break;
      }

      case "HIDE_SPOT": {
        // Re-hide the spot
        const dxStore = useDXStore.getState();
        dxStore.hideSpot(action.spotId);
        break;
      }

      case "CLEAR_RECENT_TARGETS": {
        // Re-clear recent targets
        const mapStore = useMapStore.getState();
        mapStore.clearRecentTargets();
        break;
      }

      case "CLEAR_PINS": {
        // Re-clear all pins
        const pinStore = usePinStore.getState();
        pinStore.clearPins();
        break;
      }

      case "DELETE_ALERT": {
        // Filtered out by undoStore.pushAction; should never reach here
        break;
      }
    }
  }, [redo]);

  /**
   * Handle keyboard shortcuts
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if shortcuts are enabled
      if (!enabledRef.current) {
        return;
      }

      // Skip if focused on input element
      if (shouldSuppressShortcuts(e.target)) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      // Undo: Ctrl+Z (Windows/Linux) or Cmd+Z (Mac)
      if (modKey && e.key === "z" && !e.shiftKey) {
        if (checkCanUndo()) {
          e.preventDefault();
          e.stopPropagation();
          performUndo();
        }
        return;
      }

      // Redo: Ctrl+Shift+Z, Cmd+Shift+Z, or Ctrl+Y
      if (
        (modKey && e.key === "z" && e.shiftKey) ||
        (e.ctrlKey && e.key === "y")
      ) {
        if (checkCanRedo()) {
          e.preventDefault();
          e.stopPropagation();
          performRedo();
        }
        return;
      }
    };

    // Use capture phase to intercept before other handlers
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [checkCanUndo, checkCanRedo, performUndo, performRedo]);

  return {
    performUndo,
    performRedo,
    pushAction,
    canUndo: checkCanUndo(),
    canRedo: checkCanRedo(),
    historyCount: getHistoryCount(),
    redoCount: getRedoCount(),
  };
}

export default useUndoRedo;
