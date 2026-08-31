/**
 * Quick current-location override shared by the application header and map.
 * It updates one temporary travel slot and never edits the operator's home QTH.
 */

import { lazy, Suspense, useState } from "react";
import {
  useActiveLocation,
  useHomeLocation,
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
      <path
        fillRule="evenodd"
        d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function QuickLocationControl({
  className = "",
  variant = "grid",
}: QuickLocationControlProps) {
  const activeLocation = useActiveLocation();
  const homeLocation = useHomeLocation();
  const isTemporaryActive = useIsTemporaryActive();
  const [open, setOpen] = useState(false);

  const gridLabel = activeLocation?.grid ?? homeLocation?.grid ?? "Set location";
  const locationKind = isTemporaryActive ? "Travel location" : "Home location";
  const label = `Update current operating location — ${locationKind}: ${gridLabel}`;

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
