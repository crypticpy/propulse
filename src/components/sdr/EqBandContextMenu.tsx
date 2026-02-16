/**
 * EqBandContextMenu -- Right-click context menu for managing EQ bands
 * on the spectrum display. FabFilter Pro-Q style parametric EQ interaction.
 *
 * Two modes:
 *  - Empty space: offers "Add Notch" and "Add EQ Band"
 *  - Existing band: filter type selector, enable/disable toggle, remove
 *
 * Renders via portal to avoid overflow clipping. Position-clamped to viewport.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EqBand, EqFilterType, EqBandCategory } from "@/lib/audio/eqTypes";
import { EQ_FILTER_TYPES, EQ_FILTER_LABELS } from "@/lib/audio/eqTypes";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface EqBandContextMenuProps {
  /** Screen X position for the menu */
  x: number;
  /** Screen Y position for the menu */
  y: number;
  /** If set, the menu is for an existing band; otherwise it's for empty space */
  band?: EqBand;
  /** Called when the menu should close */
  onClose: () => void;
  /** Called to add a new band at the clicked position */
  onAddBand?: (category: EqBandCategory) => void;
  /** Called to change the filter type of an existing band */
  onChangeType?: (id: string, filterType: EqFilterType) => void;
  /** Called to toggle an existing band */
  onToggle?: (id: string, enabled: boolean) => void;
  /** Called to remove an existing band */
  onRemove?: (id: string) => void;
}

// ─── Separator ───────────────────────────────────────────────────────────────

function MenuSeparator() {
  return <div className="my-1 border-t border-white/10" />;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EqBandContextMenu({
  x,
  y,
  band,
  onClose,
  onAddBand,
  onChangeType,
  onToggle,
  onRemove,
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

    // Ensure we never go negative
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

  // ─── Handlers ───────────────────────────────────────────────────────────

  const handleAddBand = useCallback(
    (category: EqBandCategory) => {
      onAddBand?.(category);
      onClose();
    },
    [onAddBand, onClose],
  );

  const handleChangeType = useCallback(
    (filterType: EqFilterType) => {
      if (band) {
        onChangeType?.(band.id, filterType);
      }
    },
    [band, onChangeType],
  );

  const handleToggle = useCallback(() => {
    if (band) {
      onToggle?.(band.id, !band.enabled);
    }
  }, [band, onToggle]);

  const handleRemove = useCallback(() => {
    if (band) {
      onRemove?.(band.id);
      onClose();
    }
  }, [band, onRemove, onClose]);

  // ─── Empty space mode ───────────────────────────────────────────────────

  const emptySpaceContent = (
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
  );

  // ─── Band mode ──────────────────────────────────────────────────────────

  const isNotch = band?.category === "notch";

  const bandContent = band ? (
    <div className="space-y-1">
      {/* Header */}
      <div className="px-2 py-1">
        <span className="text-[10px] font-mono text-gray-400">
          EqBand: {band.freqHz} Hz
        </span>
      </div>

      <MenuSeparator />

      {/* Filter type selector */}
      <div className="px-1.5">
        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 px-0.5">
          Filter Type
        </div>
        <div className="grid grid-cols-3 gap-1">
          {EQ_FILTER_TYPES.map((ft) => {
            const isActive = band.filterType === ft;
            const activeClasses = isNotch
              ? "bg-plasma-orange/20 border-plasma-orange/40 text-plasma-orange"
              : "bg-cosmic-cyan/20 border-cosmic-cyan/40 text-cosmic-cyan";

            return (
              <button
                key={ft}
                onClick={() => handleChangeType(ft)}
                className={`px-1.5 py-1 text-[10px] font-medium rounded border transition-colors ${
                  isActive
                    ? activeClasses
                    : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200"
                }`}
              >
                {EQ_FILTER_LABELS[ft]}
              </button>
            );
          })}
        </div>
      </div>

      <MenuSeparator />

      {/* Toggle + Remove */}
      <div className="px-1.5 space-y-0.5">
        <button
          onClick={handleToggle}
          className={`w-full px-2 py-1.5 text-[11px] font-semibold rounded border transition-colors ${
            band.enabled
              ? "bg-signal-green/15 border-signal-green/30 text-signal-green hover:bg-signal-green/25"
              : "bg-white/5 border-white/10 text-gray-500 hover:bg-white/10 hover:text-gray-300"
          }`}
        >
          {band.enabled ? "Disable" : "Enable"}
        </button>
        <button
          onClick={handleRemove}
          className="w-full px-2 py-1.5 text-[11px] font-semibold rounded border transition-colors
            bg-alert-red/10 border-alert-red/25 text-alert-red/80
            hover:bg-alert-red/20 hover:text-alert-red"
        >
          Remove
        </button>
      </div>
    </div>
  ) : null;

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
      {band ? bandContent : emptySpaceContent}
    </div>,
    document.body,
  );
}
