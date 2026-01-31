/**
 * QuickTargets Component
 *
 * Displays a list of saved target locations for quick access.
 * Click a target to set it as the current map target.
 */

import { useCallback } from "react";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore, type SavedTarget } from "@/stores/userStore";
import { Card } from "@/components/ui/Card";

interface QuickTargetsProps {
  className?: string;
}

export function QuickTargets({ className = "" }: QuickTargetsProps) {
  const { setTarget } = useMapStore();
  const { savedTargets, removeTarget, clearTargets } = useUserStore();

  // Handle click on a saved target
  const handleTargetClick = useCallback(
    (target: SavedTarget) => {
      setTarget({
        lat: target.lat,
        lon: target.lon,
        grid: target.grid,
        name: target.name,
      });
    },
    [setTarget],
  );

  // Handle remove target
  const handleRemoveTarget = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      removeTarget(id);
    },
    [removeTarget],
  );

  return (
    <Card className={className}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-white">Quick Targets</h3>
        {savedTargets.length > 0 && (
          <button
            onClick={clearTargets}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            title="Clear all saved targets"
          >
            Clear all
          </button>
        )}
      </div>

      {savedTargets.length === 0 ? (
        <div className="text-center py-4 text-gray-500">
          <p className="text-sm">No saved targets</p>
          <p className="text-xs mt-1">
            Click &quot;Save&quot; in path analysis to add targets
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {savedTargets.map((target) => (
            <li key={target.id}>
              <button
                onClick={() => handleTargetClick(target)}
                className="w-full group flex items-center justify-between gap-2 p-2
                           bg-white/[0.02] hover:bg-white/[0.05] border border-white/5
                           hover:border-white/10 rounded-lg transition-all text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white font-medium truncate">
                    {target.name}
                  </div>
                  <div className="text-xs text-gray-500 font-mono">
                    {target.grid ||
                      `${target.lat.toFixed(2)}°, ${target.lon.toFixed(2)}°`}
                  </div>
                </div>
                <button
                  onClick={(e) => handleRemoveTarget(e, target.id)}
                  className="p-1 text-gray-600 hover:text-alert-red
                             opacity-0 group-hover:opacity-100 transition-all"
                  title="Remove target"
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
              </button>
            </li>
          ))}
        </ul>
      )}

      {savedTargets.length > 0 && (
        <p className="text-xs text-gray-600 mt-3 text-center">
          {savedTargets.length}/10 targets saved
        </p>
      )}
    </Card>
  );
}
