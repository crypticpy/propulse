/**
 * Quick current-location override shared by the application header and map.
 * It updates one temporary travel slot and never edits the operator's home QTH.
 */

import { lazy, Suspense, useState } from "react";
import {
  useActiveLocation,
  useIsTemporaryActive,
} from "@/hooks/useActiveLocation";

// The global header needs only this small trigger. Keep the modal, profile
// mutation logic, address search, and browser-geolocation code in an on-demand
// chunk so every route does not pay for location editing during startup.
const QuickLocationDialog = lazy(() =>
  import("./QuickLocationDialog").then((module) => ({
    default: module.QuickLocationDialog,
  })),
);

interface QuickLocationControlProps {
  className?: string;
  variant?: "grid" | "icon" | "profile";
}

function LocationPinIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M16 8c0 4-6 11-6 11S4 12 4 8a6 6 0 1112 0Zm-6 2a2 2 0 100-4 2 2 0 000 4Z" />
    </svg>
  );
}

export function QuickLocationControl({
  className = "",
  variant = "grid",
}: QuickLocationControlProps) {
  const activeLocation = useActiveLocation();
  const isTemporaryActive = useIsTemporaryActive();
  const [open, setOpen] = useState(false);

  const gridLabel = activeLocation?.grid ?? "Set location";
  const label = `Update current operating location — ${isTemporaryActive ? "Travel" : "Home"} location: ${gridLabel}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "icon"
            ? `flex min-h-10 min-w-10 items-center justify-center rounded-lg transition-colors ${
                isTemporaryActive
                  ? "bg-caution-amber/15 text-caution-amber"
                  : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
              } ${className}`
            : `inline-flex items-center gap-1 rounded font-mono transition-colors ${
                isTemporaryActive
                  ? "bg-caution-amber/10 text-caution-amber hover:bg-caution-amber/20"
                  : "text-gray-400 hover:bg-white/5 hover:text-white"
              } ${variant === "profile" ? "px-0.5 text-sm font-medium" : "px-1 text-[10px]"} ${className}`
        }
        aria-label={label}
        title={label}
      >
        <LocationPinIcon
          className={variant === "icon" ? "h-4 w-4" : "h-3.5 w-3.5"}
        />
        {variant !== "icon" && <span>{gridLabel}</span>}
      </button>

      {open && (
        <Suspense fallback={null}>
          <QuickLocationDialog onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}

export default QuickLocationControl;
