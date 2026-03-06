/**
 * QuickTargets Component
 *
 * Displays a list of saved target locations for quick access.
 * Click a target to set it as the current map target.
 * Includes pin management via PinList and optional watch indicator.
 */

import { useCallback, useState } from "react";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore, type SavedTarget } from "@/stores/userStore";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PinList } from "./PinList";
import type { MapPin } from "@/types/pin";

interface QuickTargetsProps {
  className?: string;
  /** Callback when edit pin is requested */
  onEditPin?: (pin: MapPin) => void;
}

export function QuickTargets({ className = "", onEditPin }: QuickTargetsProps) {
  const setTarget = useMapStore((s) => s.setTarget);
  const { savedTargets, removeTarget, clearTargets } = useUserStore();

  // Active tab: "targets" or "pins"
  const [activeTab, setActiveTab] = useState<"targets" | "pins">("targets");

  // Delete confirmation state
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showClearAll, setShowClearAll] = useState(false);

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

  // Handle remove target — opens confirmation dialog
  const handleRemoveTarget = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteTargetId(id);
  }, []);

  // Handle pin selection - set as target
  const handlePinSelect = useCallback(
    (pin: MapPin) => {
      setTarget({
        lat: pin.lat,
        lon: pin.lon,
        grid: pin.grid,
        name: pin.name,
      });
    },
    [setTarget],
  );

  // Handle pin edit
  const handlePinEdit = useCallback(
    (pin: MapPin) => {
      onEditPin?.(pin);
    },
    [onEditPin],
  );

  return (
    <Card className={className}>
      {/* Header with title and watch indicator */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-white">Quick Access</h3>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-3 border-b border-white/10 pb-2">
        <button
          onClick={() => setActiveTab("targets")}
          className={`
            flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors
            ${
              activeTab === "targets"
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
            }
          `}
        >
          Targets ({savedTargets.length})
        </button>
        <button
          onClick={() => setActiveTab("pins")}
          className={`
            flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors
            ${
              activeTab === "pins"
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
            }
          `}
        >
          Pins
        </button>
      </div>

      {/* Targets tab content */}
      {activeTab === "targets" && (
        <>
          {savedTargets.length > 0 && (
            <div className="flex justify-end mb-2">
              <button
                onClick={() => setShowClearAll(true)}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                title="Clear all saved targets"
              >
                Clear all
              </button>
            </div>
          )}

          {savedTargets.length === 0 ? (
            <div className="text-center py-4 text-gray-500">
              <p className="text-sm">No saved targets</p>
              <p className="text-xs mt-1">
                Click &quot;Save&quot; in path analysis to add targets
              </p>
            </div>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-y-auto">
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
        </>
      )}

      {/* Pins tab content */}
      {activeTab === "pins" && (
        <PinList onPinSelect={handlePinSelect} onPinEdit={handlePinEdit} />
      )}

      {/* Delete confirmation dialogs */}
      <ConfirmDialog
        open={deleteTargetId !== null}
        title="Remove Target"
        message="Remove this saved target?"
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={() => {
          if (deleteTargetId) removeTarget(deleteTargetId);
          setDeleteTargetId(null);
        }}
        onCancel={() => setDeleteTargetId(null)}
      />
      <ConfirmDialog
        open={showClearAll}
        title="Clear All Targets"
        message="Remove all saved targets? This cannot be undone."
        confirmLabel="Clear All"
        variant="destructive"
        onConfirm={() => {
          clearTargets();
          setShowClearAll(false);
        }}
        onCancel={() => setShowClearAll(false)}
      />
    </Card>
  );
}
