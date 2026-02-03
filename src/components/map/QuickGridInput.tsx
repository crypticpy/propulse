/**
 * QuickGridInput Component
 *
 * A modal dialog for quickly entering a Maidenhead grid locator.
 * Features auto-uppercase input, real-time validation, and recent grids history.
 * Triggered by the 'G' keyboard shortcut.
 */

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/Card";
import { useGridInput } from "@/hooks/useGridInput";

export interface QuickGridInputProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Callback when a valid grid is submitted */
  onSubmit: (grid: string, lat: number, lon: number) => void;
}

/**
 * QuickGridInput Component
 *
 * Modal for entering Maidenhead grid squares with validation and history.
 *
 * @example
 * ```tsx
 * <QuickGridInput
 *   isOpen={showGridInput}
 *   onClose={() => setShowGridInput(false)}
 *   onSubmit={(grid, lat, lon) => {
 *     setTarget({ lat, lon, grid, name: grid });
 *     setShowGridInput(false);
 *   }}
 * />
 * ```
 */
export function QuickGridInput({
  isOpen,
  onClose,
  onSubmit,
}: QuickGridInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { value, setValue, isValid, recentGrids, submit, applyGrid, clear } =
    useGridInput();

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Small delay to ensure modal is rendered
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Clear input when modal closes
  useEffect(() => {
    if (!isOpen) {
      clear();
    }
  }, [isOpen, clear]);

  // Prevent background scroll while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(() => {
    const result = submit();
    if (result) {
      onSubmit(result.grid, result.lat, result.lon);
      onClose();
    }
  }, [submit, onSubmit, onClose]);

  // Handle keyboard events
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      } else if (event.key === "Enter") {
        event.preventDefault();
        handleSubmit();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, handleSubmit]);

  /**
   * Handle clicking a recent grid
   */
  const handleRecentClick = (grid: string) => {
    const result = applyGrid(grid);
    if (result) {
      onSubmit(result.grid, result.lat, result.lon);
      onClose();
    }
  };

  /**
   * Get input border color based on validation state
   */
  const getBorderColor = () => {
    if (isValid === null) {
      // Typing, not enough chars yet
      return "border-white/30 focus:border-white/50";
    }
    if (isValid) {
      return "border-signal-green focus:border-signal-green";
    }
    return "border-alert-crimson focus:border-alert-crimson";
  };

  if (!isOpen) return null;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-grid-input-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <Card
        className="
          relative z-10 w-full max-w-sm p-5
          !bg-black/85 !backdrop-blur-md border border-white/15
          shadow-2xl
        "
        animate
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2
              id="quick-grid-input-title"
              className="font-orbitron text-lg font-bold text-gradient-orange flex items-center gap-2"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
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
              Quick Grid Input
            </h2>
            <p className="mt-0.5 text-xs text-gray-400">
              Enter a Maidenhead grid locator
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Close grid input"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Input */}
        <div className="mb-4">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="CN87ml"
              className={`
                w-full px-4 py-3 text-lg font-mono font-medium tracking-wider
                bg-white/5 rounded-lg border-2 outline-none
                transition-colors duration-200
                placeholder:text-gray-600 placeholder:tracking-normal
                ${getBorderColor()}
              `}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={6}
            />
            {/* Validation indicator */}
            {value.length >= 4 && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {isValid ? (
                  <svg
                    className="w-5 h-5 text-signal-green"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5 text-alert-crimson"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                )}
              </div>
            )}
          </div>
          <p className="mt-1.5 text-[10px] text-gray-500">
            Format: 2 letters + 2 digits + optional 2 letters (e.g., EM10,
            CN87ml)
          </p>
        </div>

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={!isValid}
          className={`
            w-full py-2.5 rounded-lg font-medium text-sm
            transition-all duration-200
            ${
              isValid
                ? "bg-plasma-orange hover:bg-plasma-orange/80 text-white cursor-pointer"
                : "bg-white/10 text-gray-500 cursor-not-allowed"
            }
          `}
        >
          Go to Grid
        </button>

        {/* Recent Grids */}
        {recentGrids.length > 0 && (
          <div className="mt-5 pt-4 border-t border-white/10">
            <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2">
              Recent Grids
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {recentGrids.map((grid) => (
                <button
                  key={grid}
                  onClick={() => handleRecentClick(grid)}
                  className="
                    px-2.5 py-1 text-xs font-mono
                    bg-white/5 hover:bg-white/15
                    border border-white/10 hover:border-plasma-orange/50
                    rounded transition-all duration-150
                    text-gray-300 hover:text-white
                  "
                >
                  {grid}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer hint */}
        <div className="mt-4 pt-3 border-t border-white/10 text-center">
          <p className="text-[10px] text-gray-500">
            Press{" "}
            <kbd className="px-1.5 py-0.5 text-[9px] font-mono bg-white/10 border border-white/20 rounded">
              Enter
            </kbd>{" "}
            to go or{" "}
            <kbd className="px-1.5 py-0.5 text-[9px] font-mono bg-white/10 border border-white/20 rounded">
              Esc
            </kbd>{" "}
            to close
          </p>
        </div>
      </Card>
    </div>,
    document.body,
  );
}

QuickGridInput.displayName = "QuickGridInput";

export default QuickGridInput;
