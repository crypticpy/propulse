/**
 * KeyboardShortcutsOverlay Component
 *
 * A modal overlay displaying all available keyboard shortcuts for PropSphere.
 * Groups shortcuts by category and provides a quick reference for users.
 * Matches the existing dark theme with glassmorphism styling.
 */

import { useId } from "react";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { Card } from "@/components/ui/Card";
import {
  DEFAULT_SHORTCUTS,
  CATEGORY_LABELS,
  formatShortcut,
  groupShortcutsByCategory,
  type ShortcutCategory,
} from "@/types/keyboard";

export interface KeyboardShortcutsOverlayProps {
  /** Whether the overlay is visible */
  isOpen: boolean;
  /** Callback to close the overlay */
  onClose: () => void;
}

/** Order of categories for display */
const CATEGORY_ORDER: ShortcutCategory[] = [
  "view",
  "navigation",
  "target",
  "panels",
  "general",
];

/**
 * KeyboardShortcutsOverlay Component
 *
 * Displays a modal with all keyboard shortcuts organized by category.
 * Closes on Escape key or clicking outside the modal.
 *
 * @example
 * ```tsx
 * <KeyboardShortcutsOverlay
 *   isOpen={showHelp}
 *   onClose={() => setShowHelp(false)}
 * />
 * ```
 */
export function KeyboardShortcutsOverlay({
  isOpen,
  onClose,
}: KeyboardShortcutsOverlayProps) {
  const titleId = useId();
  const descriptionId = useId();

  // Group shortcuts by category
  const groupedShortcuts = groupShortcutsByCategory(DEFAULT_SHORTCUTS);

  return (
    <AccessibleDialog
      open={isOpen}
      onClose={onClose}
      title="Keyboard Shortcuts"
      chrome="bare"
      labelledBy={titleId}
      describedBy={descriptionId}
      panelProps={{ className: "w-full max-w-lg" }}
    >
      {/* Modal */}
      <Card
        className="
          relative z-10 w-full max-w-lg p-6
          !bg-su-panel/80 !backdrop-blur-md border border-su-line/50
          shadow-2xl
        "
        animate
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2
              id={titleId}
              className="font-orbitron text-xl font-bold text-gradient-orange flex items-center gap-2"
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
                  d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                />
              </svg>
              Keyboard Shortcuts
            </h2>
            <p id={descriptionId} className="mt-1 text-sm text-su-muted">
              Quick access to PropSphere features
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-su-muted hover:text-su-text hover:bg-su-line/20 rounded-lg transition-colors"
            aria-label="Close shortcuts help"
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

        {/* Shortcut Categories */}
        <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-2 -mr-2">
          {CATEGORY_ORDER.map((category) => {
            const shortcuts = groupedShortcuts.get(category);
            if (!shortcuts || shortcuts.length === 0) {
              return null;
            }

            return (
              <div key={category}>
                {/* Category Header */}
                <h3 className="text-xs uppercase tracking-wider text-plasma-orange/80 font-semibold mb-2">
                  {CATEGORY_LABELS[category]}
                </h3>

                {/* Shortcuts Grid */}
                <div className="space-y-1">
                  {shortcuts.map((shortcut) => (
                    <div
                      key={`${shortcut.category}-${shortcut.action}`}
                      className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-su-line/10 transition-colors"
                    >
                      {/* Description */}
                      <span className="text-sm text-su-muted">
                        {shortcut.description}
                      </span>

                      {/* Key Badge */}
                      <kbd
                        className="
                          inline-flex items-center justify-center
                          min-w-[28px] px-2 py-1
                          text-xs font-mono font-medium
                          bg-su-line/20 text-cosmic-cyan
                          border border-su-line/50 rounded
                        "
                      >
                        {formatShortcut(shortcut)}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-su-line/40 text-center">
          <p className="text-xs text-su-muted">
            Press{" "}
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-su-line/20 border border-su-line/50 rounded">
              ?
            </kbd>{" "}
            or{" "}
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-su-line/20 border border-su-line/50 rounded">
              F1
            </kbd>{" "}
            to show this help
          </p>
        </div>
      </Card>
    </AccessibleDialog>
  );
}

KeyboardShortcutsOverlay.displayName = "KeyboardShortcutsOverlay";

export default KeyboardShortcutsOverlay;
