/**
 * UndoToast - Toast notification for undo/redo actions
 *
 * Displays a brief notification when an undoable action is performed,
 * with an "Undo" button for quick reversal.
 *
 * Auto-dismisses after 5 seconds.
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useUndoStore, selectActiveToast } from "@/stores/undoStore";
import { useUndoRedo } from "@/hooks/useUndoRedo";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Time in ms before toast auto-dismisses */
const AUTO_DISMISS_MS = 5000;

/** Progress bar update interval */
const PROGRESS_INTERVAL_MS = 50;

/** Exit animation duration */
const EXIT_ANIMATION_MS = 200;

// =============================================================================
// ICONS
// =============================================================================

const UndoIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M7.793 2.232a.75.75 0 01-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 010 10.75H10.75a.75.75 0 010-1.5h2.875a3.875 3.875 0 000-7.75H3.622l4.146 3.957a.75.75 0 01-1.036 1.085l-5.5-5.25a.75.75 0 010-1.085l5.5-5.25a.75.75 0 011.06.025z"
      clipRule="evenodd"
    />
  </svg>
);

const RedoIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M12.207 2.232a.75.75 0 00.025 1.06l4.146 3.958H6.375a5.375 5.375 0 000 10.75H9.25a.75.75 0 000-1.5H6.375a3.875 3.875 0 010-7.75h10.003l-4.146 3.957a.75.75 0 001.036 1.085l5.5-5.25a.75.75 0 000-1.085l-5.5-5.25a.75.75 0 00-1.06.025z"
      clipRule="evenodd"
    />
  </svg>
);

const CloseIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
  </svg>
);

// =============================================================================
// ACTION TYPE ICONS
// =============================================================================

const ActionIcons: Record<string, React.ReactNode> = {
  DELETE_PIN: (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  ),
  CLEAR_TARGET: (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
      />
    </svg>
  ),
  HIDE_SPOT: (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
      />
    </svg>
  ),
  DELETE_ALERT: (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  ),
  CLEAR_RECENT_TARGETS: (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export interface UndoToastProps {
  /** Optional className for additional styling */
  className?: string;
}

/**
 * UndoToast Component
 *
 * Renders a toast notification for undo/redo actions.
 * Shows the action description with an undo button when applicable.
 *
 * @example
 * ```tsx
 * // Add to your layout component
 * <UndoToast />
 * ```
 */
export const UndoToast: React.FC<UndoToastProps> = ({ className = "" }) => {
  const activeToast = useUndoStore(selectActiveToast);
  const clearToast = useUndoStore((state) => state.clearToast);
  const { performUndo, performRedo, canUndo, canRedo } = useUndoRedo({
    enabled: false,
  }); // Don't add keyboard listeners here

  const [progress, setProgress] = useState(100);
  const [isExiting, setIsExiting] = useState(false);
  const [isEntered, setIsEntered] = useState(false);

  // Refs for cleanup and pause functionality
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const pausedTimeRef = useRef<number | null>(null);
  const toastTimestampRef = useRef<number | null>(null);

  /**
   * Handle toast dismissal with exit animation
   */
  const handleDismiss = useCallback(() => {
    if (isExiting) {
      return;
    }
    setIsExiting(true);
    setTimeout(() => {
      clearToast();
      setIsExiting(false);
      setIsEntered(false);
      setProgress(100);
    }, EXIT_ANIMATION_MS);
  }, [isExiting, clearToast]);

  /**
   * Handle undo button click
   */
  const handleUndo = useCallback(() => {
    if (canUndo) {
      performUndo();
    }
    handleDismiss();
  }, [canUndo, performUndo, handleDismiss]);

  /**
   * Handle redo button click
   */
  const handleRedo = useCallback(() => {
    if (canRedo) {
      performRedo();
    }
    handleDismiss();
  }, [canRedo, performRedo, handleDismiss]);

  /**
   * Pause auto-dismiss on hover
   */
  const handleMouseEnter = useCallback(() => {
    pausedTimeRef.current = Date.now();
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  /**
   * Resume auto-dismiss on mouse leave
   */
  const handleMouseLeave = useCallback(() => {
    if (pausedTimeRef.current === null) {
      return;
    }

    const pauseDuration = Date.now() - pausedTimeRef.current;
    startTimeRef.current += pauseDuration;
    pausedTimeRef.current = null;

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        handleDismiss();
      }
    }, PROGRESS_INTERVAL_MS);
  }, [handleDismiss]);

  /**
   * Effect: Handle toast appearance and auto-dismiss timer
   */
  useEffect(() => {
    if (!activeToast || activeToast.timestamp === toastTimestampRef.current) {
      return;
    }

    // New toast appeared
    toastTimestampRef.current = activeToast.timestamp;
    setIsExiting(false);
    setProgress(100);
    startTimeRef.current = Date.now();

    // Entry animation
    const entryTimer = setTimeout(() => {
      setIsEntered(true);
    }, 10);

    // Start auto-dismiss timer
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        handleDismiss();
      }
    }, PROGRESS_INTERVAL_MS);

    return () => {
      clearTimeout(entryTimer);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activeToast, handleDismiss]);

  // Don't render if no toast
  if (!activeToast) {
    return null;
  }

  const { action, type: toastType } = activeToast;

  // Determine toast color based on action type
  const isUndo = toastType === "undo";
  const isRedo = toastType === "redo";
  const borderColor = isUndo
    ? "border-l-cosmic-cyan"
    : isRedo
      ? "border-l-plasma-orange"
      : "border-l-caution-amber";
  const progressColor = isUndo
    ? "bg-cosmic-cyan"
    : isRedo
      ? "bg-plasma-orange"
      : "bg-caution-amber";

  // Get the action icon
  const actionIcon = ActionIcons[action.type] || null;

  // Build the message
  let message = action.description;
  if (isUndo) {
    message = `Undone: ${action.description}`;
  } else if (isRedo) {
    message = `Redone: ${action.description}`;
  }

  return (
    <div
      className={`
        fixed bottom-4 left-4 z-[75]
        ${className}
      `}
      role="status"
      aria-live="polite"
    >
      <div
        className={`
          w-80
          bg-deep-space/95 backdrop-blur-sm
          border border-white/10 ${borderColor} border-l-4 rounded-lg
          shadow-lg shadow-black/20
          transform transition-all duration-200 ease-out
          ${isExiting ? "-translate-x-full opacity-0" : isEntered ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0"}
        `}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Main content area */}
        <div className="p-3">
          <div className="flex items-start gap-2">
            {/* Action icon */}
            <span className="text-gray-400 flex-shrink-0 mt-0.5">
              {actionIcon}
            </span>

            {/* Text content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-200 line-clamp-2">{message}</p>

              {/* Keyboard hint */}
              <p className="text-[10px] text-gray-500 mt-1 font-mono">
                {isUndo
                  ? "Ctrl+Shift+Z to redo"
                  : isRedo
                    ? "Ctrl+Z to undo"
                    : "Ctrl+Z to undo"}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Undo/Redo button */}
              {toastType === "action" && canUndo && (
                <button
                  type="button"
                  onClick={handleUndo}
                  className="
                    flex items-center gap-1 px-2 py-1 rounded
                    text-xs font-medium
                    bg-cosmic-cyan/20 text-cosmic-cyan
                    hover:bg-cosmic-cyan/30
                    transition-colors duration-150
                    focus:outline-none focus:ring-2 focus:ring-cosmic-cyan/50
                  "
                >
                  <UndoIcon className="w-3 h-3" />
                  Undo
                </button>
              )}

              {toastType === "undo" && canRedo && (
                <button
                  type="button"
                  onClick={handleRedo}
                  className="
                    flex items-center gap-1 px-2 py-1 rounded
                    text-xs font-medium
                    bg-plasma-orange/20 text-plasma-orange
                    hover:bg-plasma-orange/30
                    transition-colors duration-150
                    focus:outline-none focus:ring-2 focus:ring-plasma-orange/50
                  "
                >
                  <RedoIcon className="w-3 h-3" />
                  Redo
                </button>
              )}

              {/* Dismiss button */}
              <button
                type="button"
                onClick={handleDismiss}
                className="
                  p-1 rounded
                  text-gray-500 hover:text-white
                  hover:bg-white/10
                  transition-colors duration-150
                  focus:outline-none focus:ring-2 focus:ring-white/20
                "
                aria-label="Dismiss"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-gray-800 rounded-b-lg overflow-hidden">
          <div
            className={`h-full ${progressColor} transition-[width] duration-50 ease-linear`}
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Time until auto-dismiss"
          />
        </div>
      </div>
    </div>
  );
};

UndoToast.displayName = "UndoToast";

export default UndoToast;
