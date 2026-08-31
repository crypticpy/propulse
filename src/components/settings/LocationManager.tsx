/**
 * LocationManager Component
 *
 * Allows users to manage their operating locations (home and temporary).
 * Supports switching between home and temporary locations, editing locations,
 * and setting up new temporary locations for portable/field day operations.
 */

import { useState, useCallback } from "react";
import { useUserStore } from "@/stores/userStore";
import {
  useActiveLocation,
  useHomeLocation,
  useIsTemporaryActive,
  useSavedLocations,
} from "@/hooks/useActiveLocation";
import { isValidGrid, gridToLatLon } from "@/lib/utils/grid";
import { DetailModal } from "@/components/ui/DetailModal";
import { LocationInput } from "./LocationInput";
import type { LocationType } from "@/types/user";
import { CURRENT_LOCATION_ID } from "@/stores/profileStore";

interface LocationManagerProps {
  className?: string;
}

/** Location type options for the dropdown */
const LOCATION_TYPES: { value: LocationType; label: string }[] = [
  { value: "home", label: "Home" },
  { value: "portable", label: "Portable" },
  { value: "mobile", label: "Mobile" },
  { value: "pota", label: "POTA" },
  { value: "sota", label: "SOTA" },
  { value: "fieldday", label: "Field Day" },
  { value: "other", label: "Other" },
];

/**
 * LocationManager - Manage home and temporary operating locations
 */
export function LocationManager({ className = "" }: LocationManagerProps) {
  const {
    setActiveLocation,
    setTemporaryLocation,
    clearTemporaryLocation,
    updateLocation,
  } = useUserStore();

  const activeLocation = useActiveLocation();
  const homeLocation = useHomeLocation();
  const isTemporaryActive = useIsTemporaryActive();
  const savedLocations = useSavedLocations();

  const temporaryLocations = savedLocations.filter(
    (loc) => loc.id !== homeLocation?.id && loc.type !== "home",
  );
  // Keep the card aligned with the location that propagation is actually
  // using. When Home is active, prefer the stable quick-travel slot while
  // retaining older portable locations in the saved collection.
  const temporaryLocation =
    (isTemporaryActive
      ? temporaryLocations.find((loc) => loc.id === activeLocation?.id)
      : null) ??
    temporaryLocations.find((loc) => loc.id === CURRENT_LOCATION_ID) ??
    temporaryLocations[0];

  // Edit home modal state
  const [editHomeOpen, setEditHomeOpen] = useState(false);
  const [editHomeGrid, setEditHomeGrid] = useState("");
  const [editHomeName, setEditHomeName] = useState("");
  const [editHomeError, setEditHomeError] = useState<string | null>(null);

  // Temporary location modal state
  const [tempModalOpen, setTempModalOpen] = useState(false);
  const [tempGrid, setTempGrid] = useState("");
  const [tempName, setTempName] = useState("");
  const [tempType, setTempType] = useState<LocationType>("portable");
  const [tempError, setTempError] = useState<string | null>(null);

  // Open edit home modal
  const openEditHome = useCallback(() => {
    if (homeLocation) {
      setEditHomeGrid(homeLocation.grid);
      setEditHomeName(homeLocation.name);
      setEditHomeError(null);
      setEditHomeOpen(true);
    }
  }, [homeLocation]);

  // Save home location edits
  const saveHomeEdits = useCallback(() => {
    if (!homeLocation) {
      return;
    }

    if (!editHomeGrid.trim()) {
      setEditHomeError("Grid square is required");
      return;
    }

    if (!isValidGrid(editHomeGrid)) {
      setEditHomeError("Invalid grid square format");
      return;
    }

    const coords = gridToLatLon(editHomeGrid);
    updateLocation(homeLocation.id, {
      grid: editHomeGrid.toUpperCase(),
      lat: coords.lat,
      lon: coords.lon,
      name: editHomeName.trim() || "Home",
    });

    setEditHomeOpen(false);
    setEditHomeError(null);
  }, [homeLocation, editHomeGrid, editHomeName, updateLocation]);

  // Open temporary location modal
  const openTempModal = useCallback(() => {
    setTempGrid("");
    setTempName("");
    setTempType("portable");
    setTempError(null);
    setTempModalOpen(true);
  }, []);

  // Save temporary location
  const saveTempLocation = useCallback(() => {
    if (!tempGrid.trim()) {
      setTempError("Grid square is required");
      return;
    }

    if (!isValidGrid(tempGrid)) {
      setTempError("Invalid grid square format");
      return;
    }

    const coords = gridToLatLon(tempGrid);
    setTemporaryLocation(
      tempGrid.toUpperCase(),
      coords.lat,
      coords.lon,
      tempName.trim() || "Temporary",
      tempType,
    );

    setTempModalOpen(false);
    setTempError(null);
  }, [tempGrid, tempName, tempType, setTemporaryLocation]);

  // Handle switching to home
  const switchToHome = useCallback(() => {
    setActiveLocation(null);
  }, [setActiveLocation]);

  // Handle switching to temporary
  const switchToTemporary = useCallback(() => {
    if (temporaryLocation) {
      setActiveLocation(temporaryLocation.id);
    } else {
      openTempModal();
    }
  }, [temporaryLocation, setActiveLocation, openTempModal]);

  // Handle clearing temporary location
  const handleClearTemporary = useCallback(() => {
    clearTemporaryLocation();
  }, [clearTemporaryLocation]);

  if (!homeLocation) {
    return (
      <div
        className={`p-4 text-center text-gray-500 text-sm bg-white/[0.03] rounded-lg border border-white/10 ${className}`}
      >
        No station configured. Complete station setup first.
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <h3
        id="location-group-label"
        className="text-sm font-semibold text-gray-400 uppercase tracking-wider"
      >
        Operating Location
      </h3>

      {/* Location radio group */}
      <div
        role="radiogroup"
        aria-labelledby="location-group-label"
        className="space-y-4"
      >
        {/* Home Location */}
        <div
          role="radio"
          aria-checked={!isTemporaryActive}
          tabIndex={0}
          onClick={switchToHome}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              switchToHome();
            }
          }}
          className={`
          p-3 rounded-lg border transition-colors cursor-pointer
          focus:outline-none focus:ring-2 focus:ring-plasma-orange/50
          ${
            isTemporaryActive ? "bg-white/[0.03] border-white/10 hover:border-white/20" : "bg-signal-green/10 border-signal-green/30"
          }
        `}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Radio button indicator */}
              <div
                className={`
                w-4 h-4 rounded-full border-2 flex items-center justify-center
                ${isTemporaryActive ? "border-gray-500" : "border-signal-green"}
              `}
              >
                {!isTemporaryActive && (
                  <div className="w-2 h-2 rounded-full bg-signal-green" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-400 uppercase">
                    Home
                  </span>
                  <span className="text-white font-mono font-medium">
                    {homeLocation.grid}
                  </span>
                </div>
                {homeLocation.name && homeLocation.name !== "Home" && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    {homeLocation.name}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openEditHome();
              }}
              className="px-2 py-1 text-xs rounded bg-white/5 border border-white/10
                       text-gray-200 hover:text-white hover:border-white/20 transition-colors"
            >
              Edit
            </button>
          </div>
        </div>

        {/* Temporary Location */}
        <div
          role="radio"
          aria-checked={isTemporaryActive}
          tabIndex={0}
          onClick={switchToTemporary}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              switchToTemporary();
            }
          }}
          className={`
          p-3 rounded-lg border transition-colors cursor-pointer
          focus:outline-none focus:ring-2 focus:ring-plasma-orange/50
          ${
            isTemporaryActive
              ? "bg-caution-amber/10 border-caution-amber/30"
              : "bg-white/[0.03] border-white/10 hover:border-white/20"
          }
        `}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Radio button indicator */}
              <div
                className={`
                w-4 h-4 rounded-full border-2 flex items-center justify-center
                ${isTemporaryActive ? "border-caution-amber" : "border-gray-500"}
              `}
              >
                {isTemporaryActive && (
                  <div className="w-2 h-2 rounded-full bg-caution-amber" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-400 uppercase">
                    Temporary
                  </span>
                  {temporaryLocation ? (
                    <span className="text-white font-mono font-medium">
                      {temporaryLocation.grid}
                    </span>
                  ) : (
                    <span className="text-gray-500 text-sm">Not set</span>
                  )}
                </div>
                {temporaryLocation?.name &&
                  temporaryLocation.name !== "Temporary" && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      {temporaryLocation.name}
                    </div>
                  )}
              </div>
            </div>
            {temporaryLocation ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClearTemporary();
                }}
                className="px-2 py-1 text-xs rounded bg-alert-red/10 border border-alert-red/30
                         text-alert-red hover:bg-alert-red/20 transition-colors"
              >
                Clear
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openTempModal();
                }}
                className="px-2 py-1 text-xs rounded bg-plasma-orange/20 border border-plasma-orange/40
                         text-plasma-orange hover:bg-plasma-orange/30 transition-colors"
              >
                + Set
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Active Status Indicator */}
      <div className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-white/[0.02] border border-white/5">
        <span className="text-xs text-gray-500">Active:</span>
        {isTemporaryActive ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-caution-amber">
            <span className="w-2 h-2 rounded-full bg-caution-amber animate-pulse" />
            PORTABLE
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-medium text-signal-green">
            <span className="w-2 h-2 rounded-full bg-signal-green" />
            HOME
          </span>
        )}
        {activeLocation && (
          <span className="text-xs text-gray-500 font-mono ml-2">
            {activeLocation.grid}
          </span>
        )}
      </div>

      {/* Edit Home Modal */}
      <DetailModal
        isOpen={editHomeOpen}
        onClose={() => setEditHomeOpen(false)}
        title="Edit Home Location"
        subtitle="Update your home station grid square and name"
        size="md"
        zIndexClassName="z-[450]"
      >
        <div className="space-y-4">
          {editHomeError && (
            <div className="p-3 rounded-lg border border-alert-red/30 bg-alert-red/10 text-alert-red text-sm">
              {editHomeError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              Grid Square
            </label>
            <LocationInput
              value={editHomeGrid}
              onChange={setEditHomeGrid}
              error={editHomeError}
              onError={setEditHomeError}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              Location Name (optional)
            </label>
            <input
              type="text"
              value={editHomeName}
              onChange={(e) => setEditHomeName(e.target.value)}
              placeholder="Home"
              className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                         text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setEditHomeOpen(false)}
              className="flex-1 px-4 py-2 bg-nebula-blue/60 border border-white/10 rounded-lg
                         text-gray-200 hover:text-white hover:border-white/20 transition-colors font-medium text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveHomeEdits}
              className="flex-1 px-4 py-2 bg-plasma-orange/20 border border-plasma-orange/50 rounded-lg
                         text-plasma-orange hover:bg-plasma-orange/30 transition-colors font-medium text-sm"
            >
              Save
            </button>
          </div>
        </div>
      </DetailModal>

      {/* Set Temporary Location Modal */}
      <DetailModal
        isOpen={tempModalOpen}
        onClose={() => setTempModalOpen(false)}
        title="Set Temporary Location"
        subtitle="Set a temporary operating location for portable operations"
        size="md"
        zIndexClassName="z-[450]"
      >
        <div className="space-y-4">
          {tempError && (
            <div className="p-3 rounded-lg border border-alert-red/30 bg-alert-red/10 text-alert-red text-sm">
              {tempError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              Grid Square
            </label>
            <LocationInput
              value={tempGrid}
              onChange={setTempGrid}
              error={tempError}
              onError={setTempError}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              Location Name (optional)
            </label>
            <input
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              placeholder="Field Day Site, POTA K-1234, etc."
              className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                         text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              Location Type
            </label>
            <select
              value={tempType}
              onChange={(e) => setTempType(e.target.value as LocationType)}
              className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                         text-white focus:outline-none focus:border-plasma-orange/50"
            >
              {LOCATION_TYPES.filter((t) => t.value !== "home").map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setTempModalOpen(false)}
              className="flex-1 px-4 py-2 bg-nebula-blue/60 border border-white/10 rounded-lg
                         text-gray-200 hover:text-white hover:border-white/20 transition-colors font-medium text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveTempLocation}
              className="flex-1 px-4 py-2 bg-plasma-orange/20 border border-plasma-orange/50 rounded-lg
                         text-plasma-orange hover:bg-plasma-orange/30 transition-colors font-medium text-sm"
            >
              Set Location
            </button>
          </div>
        </div>
      </DetailModal>
    </div>
  );
}
