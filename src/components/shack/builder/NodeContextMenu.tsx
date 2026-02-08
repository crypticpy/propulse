/**
 * NodeContextMenu -- HTML-based context menu overlay for chain nodes.
 *
 * Renders as an absolute-positioned div on top of the SVG canvas.
 * Includes viewport boundary checking so it never clips off-screen.
 */

import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

// ---- Props ------------------------------------------------------------------

export interface NodeContextMenuProps {
  /** Node index in the chain */
  nodeIndex: number;
  /** Node type for label/icon purposes */
  nodeType: "radio" | "accessory" | "feedline_run" | "antenna";
  /** Node display name */
  nodeName: string;
  /** Pixel position (absolute, relative to canvas container) */
  x: number;
  y: number;
  /** Whether this node can move left/right */
  canMoveLeft: boolean;
  canMoveRight: boolean;
  /** Callbacks */
  onConfigure: () => void;
  onSwap: () => void;
  onRemove: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onClose: () => void;
}

// ---- Icons (inline SVG paths) -----------------------------------------------

function GearIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0"
    >
      <path
        d="M8 10a2 2 0 100-4 2 2 0 000 4z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.05 10a1.1 1.1 0 00.22 1.21l.04.04a1.33 1.33 0 11-1.89 1.89l-.04-.04a1.1 1.1 0 00-1.21-.22 1.1 1.1 0 00-.67 1.01v.11a1.33 1.33 0 11-2.67 0v-.06a1.1 1.1 0 00-.72-1.01 1.1 1.1 0 00-1.21.22l-.04.04a1.33 1.33 0 11-1.89-1.89l.04-.04a1.1 1.1 0 00.22-1.21 1.1 1.1 0 00-1.01-.67h-.11a1.33 1.33 0 110-2.67h.06a1.1 1.1 0 001.01-.72 1.1 1.1 0 00-.22-1.21l-.04-.04A1.33 1.33 0 114.6 2.97l.04.04a1.1 1.1 0 001.21.22h.05a1.1 1.1 0 00.67-1.01v-.11a1.33 1.33 0 012.67 0v.06a1.1 1.1 0 00.67 1.01 1.1 1.1 0 001.21-.22l.04-.04a1.33 1.33 0 111.89 1.89l-.04.04a1.1 1.1 0 00-.22 1.21v.05a1.1 1.1 0 001.01.67h.11a1.33 1.33 0 010 2.67h-.06a1.1 1.1 0 00-1.01.67z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0"
    >
      <path
        d="M12 5.33H4m0 0L6.67 2.67M4 5.33l2.67 2.67M4 10.67h8m0 0L9.33 8M12 10.67l-2.67 2.66"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0"
    >
      <path
        d="M13.33 8H2.67m0 0L6.67 4M2.67 8l4 4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0"
    >
      <path
        d="M2.67 8h10.66m0 0L9.33 4m4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0"
    >
      <path
        d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4m2 0v9.33a1.33 1.33 0 01-1.34 1.34H4.67a1.33 1.33 0 01-1.34-1.34V4h9.34z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---- Component --------------------------------------------------------------

export function NodeContextMenu({
  nodeName,
  canMoveLeft,
  canMoveRight,
  onConfigure,
  onSwap,
  onRemove,
  onMoveLeft,
  onMoveRight,
  onClose,
  x,
  y,
}: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Use setTimeout to avoid the same click that opened the menu from closing it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // Viewport boundary checking: adjust position so menu stays on-screen
  const getAdjustedPosition = useCallback(() => {
    const menuWidth = 200;
    const menuHeight = 300; // rough estimate
    const margin = 8;

    let adjustedX = x;
    let adjustedY = y;

    if (typeof window !== "undefined") {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (adjustedX + menuWidth + margin > vw) {
        adjustedX = vw - menuWidth - margin;
      }
      if (adjustedX < margin) {
        adjustedX = margin;
      }
      if (adjustedY + menuHeight + margin > vh) {
        adjustedY = vh - menuHeight - margin;
      }
      if (adjustedY < margin) {
        adjustedY = margin;
      }
    }

    return { left: adjustedX, top: adjustedY };
  }, [x, y]);

  const pos = getAdjustedPosition();

  const itemClass =
    "flex items-center gap-2.5 w-full px-3 text-left text-sm font-medium rounded-lg transition-colors duration-100 text-gray-200 hover:bg-white/10 focus:bg-white/10 focus:outline-none";

  const menu = (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[192px] bg-[#0a0a14]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl p-1 animate-in fade-in duration-100"
      style={{ left: pos.left, top: pos.top }}
      role="menu"
      aria-label="Node context menu"
    >
      {/* Header: node name */}
      <div className="px-3 py-2 text-xs font-medium text-gray-500 truncate select-none">
        {nodeName}
      </div>

      {/* View Details */}
      <button
        className={itemClass}
        style={{ minHeight: 44 }}
        onClick={() => {
          onConfigure();
          onClose();
        }}
        role="menuitem"
      >
        <GearIcon />
        View Details
      </button>

      {/* Swap Equipment */}
      <button
        className={itemClass}
        style={{ minHeight: 44 }}
        onClick={() => {
          onSwap();
          onClose();
        }}
        role="menuitem"
      >
        <SwapIcon />
        Swap Equipment
      </button>

      {/* Move Left */}
      {canMoveLeft && (
        <button
          className={itemClass}
          style={{ minHeight: 44 }}
          onClick={() => {
            onMoveLeft();
            onClose();
          }}
          role="menuitem"
        >
          <ArrowLeftIcon />
          Move Left
        </button>
      )}

      {/* Move Right */}
      {canMoveRight && (
        <button
          className={itemClass}
          style={{ minHeight: 44 }}
          onClick={() => {
            onMoveRight();
            onClose();
          }}
          role="menuitem"
        >
          <ArrowRightIcon />
          Move Right
        </button>
      )}

      {/* Divider */}
      <div className="my-1 mx-2 h-px bg-white/10" role="separator" />

      {/* Remove from Chain */}
      <button
        className="flex items-center gap-2.5 w-full px-3 text-left text-sm font-medium rounded-lg transition-colors duration-100 text-[#EF4444] hover:bg-[#EF4444]/10 focus:bg-[#EF4444]/10 focus:outline-none"
        style={{ minHeight: 44 }}
        onClick={() => {
          onRemove();
          onClose();
        }}
        role="menuitem"
      >
        <TrashIcon />
        Remove from Chain
      </button>
    </div>
  );

  return createPortal(menu, document.body);
}
