import { useMapStore } from "@/stores/mapStore";

const REASON_MESSAGES: Record<string, string> = {
  "no-context":
    "Your browser could not start WebGL — GPU acceleration may be disabled or the graphics process crashed.",
  threw:
    "Your browser could not start WebGL — GPU acceleration may be disabled or the graphics process crashed.",
  "no-document":
    "WebGL is unavailable in this environment.",
};

const DEFAULT_MESSAGE =
  "Your browser could not start WebGL — GPU acceleration may be disabled or the graphics process crashed.";

interface GlobeUnavailableProps {
  reason?: string;
  onRetry: () => void;
}

/**
 * Rendered in place of the R3F Canvas when a WebGL preflight check fails,
 * so a disabled GPU process never reaches Three.js context creation.
 */
export function GlobeUnavailable({ reason, onRetry }: GlobeUnavailableProps) {
  const setViewMode = useMapStore((s) => s.setViewMode);
  const message =
    (reason && REASON_MESSAGES[reason]) ?? DEFAULT_MESSAGE;

  return (
    <div
      data-globe-unavailable
      className="w-full h-full flex items-center justify-center bg-deep-space text-gray-500"
    >
      <div className="text-center px-4">
        <p className="text-white">3D globe unavailable</p>
        <p className="text-sm mt-1 max-w-sm">
          {message} The flat map still works and does not require WebGL.
        </p>
        <div className="flex gap-3 justify-center mt-4">
          <button
            type="button"
            onClick={() => setViewMode("flat")}
            className="rounded-lg border border-plasma-orange/30 bg-plasma-orange/10 px-3 py-1.5 text-sm text-plasma-orange transition-colors hover:bg-plasma-orange/20"
          >
            Use flat map
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-white/10"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
