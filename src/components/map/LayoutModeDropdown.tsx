import { useState, useRef, useEffect, useCallback } from "react";
import { useMapStore, type LayoutMode } from "@/stores/mapStore";

interface LayoutModeDropdownProps {
  className?: string;
}

interface ModeOption {
  mode: LayoutMode;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const ICON_SIZE = 16;

const modeOptions: ModeOption[] = [
  {
    mode: "normal",
    label: "Normal",
    description: "Full dashboard",
    icon: (
      <svg
        width={ICON_SIZE}
        height={ICON_SIZE}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="1" y="1" width="6" height="6" rx="1" />
        <rect x="9" y="1" width="6" height="6" rx="1" />
        <rect x="1" y="9" width="6" height="6" rx="1" />
        <rect x="9" y="9" width="6" height="6" rx="1" />
      </svg>
    ),
  },
  {
    mode: "lite",
    label: "Lite",
    description: "Maximum map",
    icon: (
      <svg
        width={ICON_SIZE}
        height={ICON_SIZE}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M4 1L1 4M12 1l3 3M4 15l-3-3M12 15l3-3" />
        <rect x="3" y="3" width="10" height="10" rx="1" />
      </svg>
    ),
  },
  {
    mode: "pro",
    label: "Pro",
    description: "Immersive fullscreen",
    icon: (
      <svg
        width={ICON_SIZE}
        height={ICON_SIZE}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M1 6V2a1 1 0 011-1h4M15 6V2a1 1 0 00-1-1h-4M1 10v4a1 1 0 001 1h4M15 10v4a1 1 0 01-1 1h-4" />
      </svg>
    ),
  },
  {
    mode: "hamclock",
    label: "HamClock",
    description: "Dense info display",
    icon: (
      <svg
        width={ICON_SIZE}
        height={ICON_SIZE}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="1" y="2" width="14" height="11" rx="1.5" />
        <path d="M5 15h6" />
        <path d="M4 5h8M4 8h5" />
      </svg>
    ),
  },
];

export function LayoutModeDropdown({ className }: LayoutModeDropdownProps) {
  const layoutMode = useMapStore((s) => s.layoutMode);
  const setLayoutMode = useMapStore((s) => s.setLayoutMode);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeOption =
    modeOptions.find((o) => o.mode === layoutMode) ?? modeOptions[0];

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) setOpen(false);
    },
    [open],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  function selectMode(mode: LayoutMode) {
    setLayoutMode(mode);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 hover:border-white/20 text-gray-300 hover:text-white transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {activeOption.icon}
        <span className="text-xs font-medium">{activeOption.label}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 4l3 3 3-3" />
        </svg>
      </button>

      {/* Popover */}
      {open && (
        <div
          role="listbox"
          aria-label="Layout mode"
          className="absolute top-full left-0 mt-1.5 min-w-[200px] z-50 rounded-lg bg-void-black/90 backdrop-blur-md border border-white/10 shadow-xl py-1"
        >
          {modeOptions.map((opt) => {
            const isActive = opt.mode === layoutMode;
            return (
              <button
                key={opt.mode}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => selectMode(opt.mode)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                  isActive
                    ? "bg-plasma-orange/10 text-plasma-orange border-l-2 border-plasma-orange"
                    : "text-gray-300 hover:text-white hover:bg-white/5 border-l-2 border-transparent"
                }`}
              >
                <span className="shrink-0">{opt.icon}</span>
                <span className="flex flex-col min-w-0">
                  <span className="text-xs font-medium leading-tight">
                    {opt.label}
                  </span>
                  <span
                    className={`text-[10px] leading-tight ${isActive ? "text-plasma-orange/70" : "text-gray-500"}`}
                  >
                    {opt.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
