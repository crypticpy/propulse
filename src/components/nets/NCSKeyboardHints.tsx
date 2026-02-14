/**
 * NCSKeyboardHints -- Centered modal overlay showing keyboard shortcuts
 * available during an active NCS live session.
 *
 * Includes phase navigation (1-4) and context-specific shortcuts for rounds.
 * Displayed when the user presses "?" or clicks the keyboard hint button.
 * Escape or clicking outside dismisses the overlay.
 */

import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

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
  "bg-white/[0.06] border border-white/15 rounded-md px-2 py-0.5 text-xs font-mono text-gray-200 leading-tight min-w-[24px] text-center shadow-[0_1px_0_rgba(255,255,255,0.05)]";

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
        !isLast ? "border-b border-white/5" : ""
      }`}
    >
      <span className="text-sm text-gray-300">{shortcut.description}</span>
      <div className="flex items-center gap-1.5">
        {shortcut.keys.map((key, j) => (
          <span key={j} className="flex items-center gap-1">
            {j > 0 && <span className="text-[10px] text-gray-400">or</span>}
            <kbd className={KBD_CLASS}>{key}</kbd>
          </span>
        ))}
      </div>
    </div>
  );
}

export function NCSKeyboardHints({ onClose }: NCSKeyboardHintsProps) {
  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [onClose]);

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ncs-keyboard-hints-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-void-black/80 animate-in fade-in"
        onClick={onClose}
      />

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-sm bg-deep-space border border-white/10 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95"
        onClick={handleCardClick}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2
            id="ncs-keyboard-hints-title"
            className="text-sm font-orbitron font-bold text-white uppercase tracking-wider"
          >
            Keyboard Shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors focus-visible:ring-2 focus-visible:ring-plasma-orange/50"
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
            <span className="text-[10px] uppercase tracking-widest text-gray-400 font-medium">
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
      </div>
    </div>,
    document.body,
  );
}
