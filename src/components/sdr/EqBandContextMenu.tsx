/**
 * EqBandContextMenu -- Right-click "Add" menu for creating new EQ bands
 * on the spectrum display. Shown when right-clicking empty space.
 *
 * Band editing is handled by EqBandPanel (click/right-click on a dot).
 *
 * Renders via portal to avoid overflow clipping. Position-clamped to viewport.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EqBandCategory } from "@/lib/audio/eqTypes";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface EqBandContextMenuProps {
  /** Screen X position for the menu */
  x: number;
  /** Screen Y position for the menu */
  y: number;
  /** Called when the menu should close */
  onClose: () => void;
  /** Called to add a new band at the clicked position */
  onAddBand?: (category: EqBandCategory) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EqBandContextMenu({
  x,
  y,
  onClose,
  onAddBand,
}: EqBandContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number }>({
    left: x,
    top: y,
  });

  // ─── Position clamping ──────────────────────────────────────────────────

  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = x;
    let top = y;

    if (x + rect.width > vw) {
      left = vw - rect.width - 8;
    }
    if (y + rect.height > vh) {
      top = vh - rect.height - 8;
    }

    left = Math.max(4, left);
    top = Math.max(4, top);

    if (left !== position.left || top !== position.top) {
      setPosition({ left, top });
    }
    // Run once on mount to clamp — deps intentionally limited
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Click-outside & Escape dismiss ─────────────────────────────────────

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // ─── Handler ───────────────────────────────────────────────────────────

  const handleAddBand = useCallback(
    (category: EqBandCategory) => {
      onAddBand?.(category);
      onClose();
    },
    [onAddBand, onClose],
  );

  // ─── Render via portal ──────────────────────────────────────────────────

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: "fixed",
        left: position.left,
        top: position.top,
        zIndex: 9999,
      }}
      className="min-w-[180px] bg-gray-900/95 backdrop-blur-sm border border-white/10
        rounded-lg shadow-xl shadow-black/50 py-1.5 select-none"
    >
      <div className="space-y-0.5">
        <button
          onClick={() => handleAddBand("notch")}
          className="w-full px-3 py-1.5 text-left text-[11px] font-semibold rounded
            text-plasma-orange hover:bg-white/10 transition-colors"
        >
          Add Notch
        </button>
        <button
          onClick={() => handleAddBand("eq")}
          className="w-full px-3 py-1.5 text-left text-[11px] font-semibold rounded
            text-cosmic-cyan hover:bg-white/10 transition-colors"
        >
          Add EQ Band
        </button>
      </div>
    </div>,
    document.body,
  );
}
