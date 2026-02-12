/**
 * NCSKeyboardHints -- Centered modal overlay showing keyboard shortcuts
 * available during an active NCS live session.
 *
 * Displayed when the user presses "?" or clicks the keyboard hint button.
 * Escape or clicking outside dismisses the overlay.
 */

import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

interface NCSKeyboardHintsProps {
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ["N", "/"], description: "Focus callsign input" },
  { keys: ["Space", "\u2192"], description: "Advance queue" },
  { keys: ["S"], description: "Skip current station" },
  { keys: ["T"], description: "Toggle turn timer" },
  { keys: ["P"], description: "Toggle preamble" },
  { keys: ["Esc"], description: "Blur / close overlay" },
  { keys: ["?"], description: "Toggle this overlay" },
] as const;

export function NCSKeyboardHints({ onClose }: NCSKeyboardHintsProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

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

  // Click outside to close
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === backdropRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  return createPortal(
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center"
    >
      <div className="bg-deep-space border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-white">Keyboard Shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
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
          {SHORTCUTS.map((shortcut, i) => (
            <div
              key={i}
              className={`flex items-center justify-between py-2.5 ${
                i < SHORTCUTS.length - 1 ? "border-b border-white/5" : ""
              }`}
            >
              <span className="text-sm text-gray-300">
                {shortcut.description}
              </span>
              <div className="flex items-center gap-1.5">
                {shortcut.keys.map((key, j) => (
                  <span key={j} className="flex items-center gap-1">
                    {j > 0 && (
                      <span className="text-[10px] text-gray-500">or</span>
                    )}
                    <kbd className="bg-white/10 border border-white/20 rounded px-2 py-0.5 text-xs font-mono text-gray-200 leading-tight">
                      {key}
                    </kbd>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
