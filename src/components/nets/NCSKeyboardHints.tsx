/**
 * NCSKeyboardHints -- Centered modal overlay showing keyboard shortcuts
 * available during an active NCS live session.
 *
 * Includes phase navigation (1-4) and context-specific shortcuts for rounds.
 * Displayed when the user presses "?" or clicks the keyboard hint button.
 * Escape or clicking outside dismisses the overlay.
 */

import { useEffect, useId } from "react";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";

interface NCSKeyboardHintsProps {
  onClose: () => void;
}

const PHASE_SHORTCUTS = [
  { keys: ["1"], description: "Go to Preamble" },
  { keys: ["2"], description: "Go to Check-In" },
  { keys: ["3"], description: "Go to Rounds" },
  { keys: ["4"], description: "Go to Closeout" },
] as const;

const ACTION_SHORTCUTS = [
  { keys: ["N", "/"], description: "Focus callsign input" },
  { keys: ["Space", "\u2192"], description: "Done / advance (Rounds)" },
  { keys: ["S"], description: "Skip current (Rounds)" },
  { keys: ["T"], description: "Toggle turn timer (Rounds)" },
  { keys: ["Esc"], description: "Blur / close overlay" },
  { keys: ["?"], description: "Toggle this overlay" },
] as const;

const KBD_CLASS =
  "bg-su-line/20 border border-su-line/50 rounded-md px-2 py-0.5 text-xs font-mono text-su-text leading-tight min-w-[24px] text-center shadow-[0_1px_0_rgba(255,255,255,0.05)]";

function ShortcutRow({
  shortcut,
  isLast,
}: {
  shortcut: { keys: readonly string[]; description: string };
  isLast: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-2.5 ${
        !isLast ? "border-b border-su-line/20" : ""
      }`}
    >
      <span className="text-sm text-su-muted">{shortcut.description}</span>
      <div className="flex items-center gap-1.5">
        {shortcut.keys.map((key, j) => (
          <span key={j} className="flex items-center gap-1">
            {j > 0 && <span className="text-[10px] text-su-muted">or</span>}
            <kbd className={KBD_CLASS}>{key}</kbd>
          </span>
        ))}
      </div>
    </div>
  );
}

export function NCSKeyboardHints({ onClose }: NCSKeyboardHintsProps) {
  const titleId = useId();

  // This dialog advertises "? -- Toggle this overlay" in its own body, so it
  // has to own the closing half of that toggle. The dashboard's window
  // handler opens it, but since #817 that handler yields to any open modal
  // and can no longer see the second press. Escape and the backdrop are
  // handled by AccessibleDialog; only "?" needs a listener here.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "?") return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <AccessibleDialog
      open
      onClose={onClose}
      title="Keyboard Shortcuts"
      chrome="bare"
      labelledBy={titleId}
      panelProps={{
        className:
          "w-full max-w-sm bg-deep-space border border-su-line/40 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2
          id={titleId}
          className="text-sm font-orbitron font-bold text-su-text uppercase tracking-wider"
        >
          Keyboard Shortcuts
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-su-muted hover:text-su-text hover:bg-su-line/20 transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50"
          aria-label="Close keyboard shortcuts"
        >
          <svg
            className="w-4 h-4"
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

      {/* Shortcut rows */}
      <div className="space-y-0">
        {/* Phase navigation */}
        {PHASE_SHORTCUTS.map((shortcut, i) => (
          <ShortcutRow
            key={i}
            shortcut={shortcut}
            isLast={i === PHASE_SHORTCUTS.length - 1}
          />
        ))}

        {/* Section divider */}
        <div className="pt-2 pb-1">
          <span className="text-[10px] uppercase tracking-widest text-su-muted font-medium">
            Actions
          </span>
        </div>

        {/* Action shortcuts */}
        {ACTION_SHORTCUTS.map((shortcut, i) => (
          <ShortcutRow
            key={i}
            shortcut={shortcut}
            isLast={i === ACTION_SHORTCUTS.length - 1}
          />
        ))}
      </div>
    </AccessibleDialog>
  );
}
