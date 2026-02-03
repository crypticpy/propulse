/**
 * PinList Component
 *
 * Displays a list of saved pins with category filtering, edit/delete actions,
 * and click-to-select functionality. Uses glassmorphism styling.
 */

import { useState, useCallback } from "react";
import type { MapPin, PinCategory } from "../../types/pin";
import { PIN_CATEGORIES, getCategoryMeta } from "../../types/pin";
import { usePinStore } from "../../stores/pinStore";

export interface PinListProps {
  /** Callback when a pin is selected/clicked */
  onPinSelect?: (pin: MapPin) => void;
  /** Callback to open edit dialog for a pin */
  onPinEdit?: (pin: MapPin) => void;
  /** Additional CSS classes */
  className?: string;
}

/** Category filter option including "All" */
type CategoryFilter = PinCategory | "all";

/** Category filter tab configuration */
interface FilterTab {
  id: CategoryFilter;
  label: string;
  icon?: string;
}

const FILTER_TABS: FilterTab[] = [
  { id: "all", label: "All" },
  ...PIN_CATEGORIES.map((cat) => ({
    id: cat.id as CategoryFilter,
    label: cat.label,
    icon: cat.icon,
  })),
];

/**
 * PinList Component
 *
 * Renders a filterable list of pins with management controls.
 */
export function PinList({
  onPinSelect,
  onPinEdit,
  className = "",
}: PinListProps) {
  const { pins, removePin, getPinsByCategory } = usePinStore();

  const [activeFilter, setActiveFilter] = useState<CategoryFilter>("all");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  // Get filtered pins
  const filteredPins =
    activeFilter === "all" ? pins : getPinsByCategory(activeFilter);

  // Handle pin click
  const handlePinClick = useCallback(
    (pin: MapPin) => {
      onPinSelect?.(pin);
    },
    [onPinSelect],
  );

  // Handle edit button click
  const handleEditClick = useCallback(
    (e: React.MouseEvent, pin: MapPin) => {
      e.stopPropagation();
      onPinEdit?.(pin);
    },
    [onPinEdit],
  );

  // Handle delete button click (show confirmation)
  const handleDeleteClick = useCallback(
    (e: React.MouseEvent, pinId: string) => {
      e.stopPropagation();
      setPendingDelete(pinId);
    },
    [],
  );

  // Confirm delete
  const handleConfirmDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (pendingDelete) {
        removePin(pendingDelete);
        setPendingDelete(null);
      }
    },
    [pendingDelete, removePin],
  );

  // Cancel delete
  const handleCancelDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDelete(null);
  }, []);

  // Format expiration date for display
  const formatExpiresAt = (expiresAt: string | undefined): string | null => {
    if (!expiresAt) return null;
    const date = new Date(expiresAt);
    const now = new Date();
    const diffDays = Math.ceil(
      (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays < 0) return "Expired";
    if (diffDays === 0) return "Ends today";
    if (diffDays === 1) return "Ends tomorrow";
    return `Ends in ${diffDays} days`;
  };

  return (
    <div
      className={`flex flex-col bg-gray-900/50 backdrop-blur-sm rounded-lg border border-white/10 ${className}`}
    >
      {/* Category filter tabs */}
      <div className="flex gap-1 p-2 border-b border-white/10 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-700">
        {FILTER_TABS.map((tab) => {
          const count =
            tab.id === "all" ? pins.length : getPinsByCategory(tab.id).length;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`
                flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors
                ${
                  activeFilter === tab.id
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                    : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                }
              `}
              title={`Filter by ${tab.label}`}
            >
              {tab.icon && <span>{tab.icon}</span>}
              <span>{tab.label}</span>
              <span
                className={`
                ml-1 px-1.5 py-0.5 rounded-full text-[10px]
                ${
                  activeFilter === tab.id
                    ? "bg-cyan-500/30 text-cyan-300"
                    : "bg-gray-700/50 text-gray-500"
                }
              `}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Pin list */}
      <div className="flex-1 overflow-y-auto max-h-64 scrollbar-thin scrollbar-thumb-gray-700">
        {filteredPins.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <span className="text-3xl mb-2">
              {activeFilter === "all"
                ? "📍"
                : getCategoryMeta(activeFilter).icon}
            </span>
            <p className="text-gray-400 text-sm">
              {activeFilter === "all"
                ? "No pins saved yet"
                : `No ${activeFilter} pins`}
            </p>
            <p className="text-gray-500 text-xs mt-1">
              Click on the globe to add a pin
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {filteredPins.map((pin) => {
              const catMeta = getCategoryMeta(pin.category);
              const isDeleting = pendingDelete === pin.id;
              const expiresLabel = formatExpiresAt(pin.expiresAt);

              return (
                <li
                  key={pin.id}
                  onClick={() => handlePinClick(pin)}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 cursor-pointer transition-colors group"
                >
                  {/* Category icon with color indicator */}
                  <div
                    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: `${pin.color}20` }}
                  >
                    <span className="text-sm">{catMeta.icon}</span>
                  </div>

                  {/* Pin info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium truncate">
                        {pin.name || pin.grid}
                      </span>
                      {pin.name && (
                        <span className="text-gray-500 text-xs font-mono">
                          {pin.grid}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className="text-gray-400"
                        style={{ color: pin.color }}
                      >
                        {catMeta.label}
                      </span>
                      {expiresLabel && (
                        <span
                          className={`
                          ${expiresLabel === "Expired" ? "text-red-400" : "text-amber-400"}
                        `}
                        >
                          {expiresLabel}
                        </span>
                      )}
                      {pin.notes && (
                        <span className="text-gray-500" title={pin.notes}>
                          Has notes
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isDeleting ? (
                      <>
                        <button
                          onClick={handleConfirmDelete}
                          className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded transition-colors"
                          title="Confirm delete"
                          aria-label="Confirm delete pin"
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
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={handleCancelDelete}
                          className="p-1.5 text-gray-400 hover:text-gray-300 hover:bg-white/10 rounded transition-colors"
                          title="Cancel"
                          aria-label="Cancel delete"
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
                      </>
                    ) : (
                      <>
                        <button
                          onClick={(e) => handleEditClick(e, pin)}
                          className="p-1.5 text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/20 rounded transition-colors"
                          title="Edit pin"
                          aria-label="Edit pin"
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
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => handleDeleteClick(e, pin.id)}
                          className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/20 rounded transition-colors"
                          title="Delete pin"
                          aria-label="Delete pin"
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
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer with pin count */}
      {pins.length > 0 && (
        <div className="px-3 py-2 border-t border-white/10 text-xs text-gray-500">
          {pins.length} / 20 pins
        </div>
      )}
    </div>
  );
}

PinList.displayName = "PinList";

export default PinList;
