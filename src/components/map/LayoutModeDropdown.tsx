import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMapStore, type LayoutMode } from "@/stores/mapStore";
import { useKioskStore } from "@/stores/kioskStore";

interface LayoutModeDropdownProps {
  className?: string;
  align?: "left" | "right";
  compact?: boolean;
  activeDestination?: "explorer" | "photorealistic";
}

interface LayoutOption {
  id: LayoutMode;
  kind: "layout";
  mode: LayoutMode;
  label: string;
  description: string;
  icon: React.ReactNode;
  dividerBefore?: boolean;
}

interface DestinationOption {
  id: "explorer" | "photorealistic" | "wall" | "displays";
  kind: "destination";
  path:
    | "/map/explorer"
    | "/map/photorealistic"
    | "/kiosk"
    | "/displays";
  label: string;
  description: string;
  icon: React.ReactNode;
  dividerBefore?: boolean;
}

type DisplayOption = LayoutOption | DestinationOption;

const ICON_SIZE = 16;

const displayOptions: DisplayOption[] = [
  {
    id: "normal",
    kind: "layout",
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
    id: "lite",
    kind: "layout",
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
    id: "pro",
    kind: "layout",
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
    id: "hamclock",
    kind: "layout",
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
  {
    id: "explorer",
    kind: "destination",
    path: "/map/explorer",
    label: "Deep-Zoom Map",
    description: "Regional satellite explorer",
    dividerBefore: true,
    icon: (
      <svg
        width={ICON_SIZE}
        height={ICON_SIZE}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5L15 15M7 4.5v5M4.5 7h5" />
      </svg>
    ),
  },
  {
    id: "photorealistic",
    kind: "destination",
    path: "/map/photorealistic",
    label: "Photorealistic 3D",
    description: "Experimental terrain and cities",
    icon: (
      <svg
        width={ICON_SIZE}
        height={ICON_SIZE}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M1.5 11.5L5.5 5l2.2 3.2L10 4.5l4.5 7" />
        <path d="M1 13.5h14M8 1.5v2" />
      </svg>
    ),
  },
  {
    id: "wall",
    kind: "destination",
    path: "/kiosk",
    label: "Wall Display",
    description: "Launch or configure scenes",
    icon: (
      <svg
        width={ICON_SIZE}
        height={ICON_SIZE}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="1" y="2" width="14" height="10" rx="1.5" />
        <path d="M5 15h6M8 12v3" />
        <path d="M3.5 4.5h9v5h-9z" />
      </svg>
    ),
  },
  {
    id: "displays",
    kind: "destination",
    path: "/displays",
    label: "Configure Displays",
    description: "Manage paired screens",
    icon: (
      <svg
        width={ICON_SIZE}
        height={ICON_SIZE}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="1" y="2" width="9" height="7" rx="1" />
        <rect x="6" y="7" width="9" height="7" rx="1" />
        <path d="M4 12.5l1.25-1.25M12 4.5l-1.25 1.25" />
      </svg>
    ),
  },
];

export function LayoutModeDropdown({
  className,
  align = "left",
  compact = false,
  activeDestination,
}: LayoutModeDropdownProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const layoutMode = useMapStore((s) => s.layoutMode);
  const setLayoutMode = useMapStore((s) => s.setLayoutMode);
  const isKiosk = useKioskStore((s) => s.active);
  const stopKiosk = useKioskStore((s) => s.stop);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeOption = activeDestination
    ? displayOptions.find((option) => option.id === activeDestination)!
    : isKiosk
      ? displayOptions.find((option) => option.id === "wall")!
      : displayOptions.find(
        (option) => option.kind === "layout" && option.mode === layoutMode,
      )!;

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
      if (e.key === "Escape" && open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    },
    [open],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);

  function selectMode(mode: LayoutMode) {
    if (isKiosk) stopKiosk();
    setLayoutMode(mode);
    if (location.pathname !== "/map") navigate("/map");
    setOpen(false);
  }

  function selectDestination(option: DestinationOption) {
    if (option.id === "wall" && isKiosk) {
      setOpen(false);
      return;
    }
    if (isKiosk) stopKiosk();
    navigate(option.path);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-lg bg-white/[0.03] border border-white/10 hover:border-white/20 text-gray-300 hover:text-white transition-colors ${
          compact ? "p-2" : "px-3 py-1.5"
        }`}
        aria-label={compact ? `Display mode: ${activeOption.label}` : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {activeOption.icon}
        {!compact && (
          <span className="text-xs font-medium">{activeOption.label}</span>
        )}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={`transition-transform ${compact ? "hidden" : ""} ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 4l3 3 3-3" />
        </svg>
      </button>

      {/* Popover */}
      {open && (
        <div
          role="menu"
          aria-label="Display mode"
          className={`absolute top-full mt-1.5 min-w-[230px] z-[260] rounded-lg bg-void-black/95 backdrop-blur-md border border-white/10 shadow-xl py-1 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {displayOptions.map((opt) => {
            const isActive =
              opt.kind === "layout"
                ? !isKiosk && !activeDestination && opt.mode === layoutMode
                : opt.id === activeDestination ||
                  (opt.id === "wall" && isKiosk) ||
                  (opt.id === "displays" && location.pathname === "/displays");
            return (
              <div key={opt.id}>
                {opt.dividerBefore && (
                  <div className="h-px bg-white/10 my-1" aria-hidden="true" />
                )}
                <button
                  type="button"
                  role={opt.kind === "layout" ? "menuitemradio" : "menuitem"}
                  aria-checked={opt.kind === "layout" ? isActive : undefined}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() =>
                    opt.kind === "layout"
                      ? selectMode(opt.mode)
                      : selectDestination(opt)
                  }
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
