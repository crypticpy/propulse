/**
 * ProfilePage -- Operator Profile management page.
 *
 * Manages callsign, operator name, license, locations, and grid locator.
 * Desktop: sticky sidebar profile card (320px) + tabbed content area.
 * Mobile: compact profile card at top + horizontal tab pills + tab content.
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useProfileStore } from "@/stores/profileStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useProfileCompleteness } from "@/hooks/useProfileCompleteness";
import { LocationManager } from "@/components/settings/LocationManager";
import { LicenseSection } from "@/components/settings/LicenseSection";
import { LocationInput } from "@/components/settings/LocationInput";
import {
  ProfileCompletenessRing,
  BioSection,
  SocialLinksSection,
  AwardsTab,
  StatsTab,
  QRCodeModal,
} from "@/components/profile";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";

// ---- Types ------------------------------------------------------------------

type ProfileTab = "overview" | "locations" | "awards" | "stats";

interface TabDef {
  id: ProfileTab;
  label: string;
}

const TABS: TabDef[] = [
  { id: "overview", label: "Overview" },
  { id: "locations", label: "Locations" },
  { id: "awards", label: "Awards" },
  { id: "stats", label: "Stats" },
];

// ---- Callsign validation ----------------------------------------------------

const CALLSIGN_REGEX = /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{0,3}[A-Z]$/i;

// ---- Page component ---------------------------------------------------------

export default function ProfilePage() {
  const station = useProfileStore((s) => s.station);
  const setStation = useProfileStore((s) => s.setStation);
  const activeLocation = useActiveLocation();
  const isMobile = useIsMobile();
  const completeness = useProfileCompleteness();

  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");

  // Local form state
  const [callsign, setCallsign] = useState(station?.callsign ?? "");
  const [operatorName, setOperatorName] = useState(station?.operatorName ?? "");
  const [grid, setGrid] = useState(station?.grid ?? "");

  // Validation errors
  const [callsignError, setCallsignError] = useState<string | null>(null);
  const [gridError, setGridError] = useState<string | null>(null);

  // Editing state for sidebar card inline edit
  const [isEditing, setIsEditing] = useState(false);
  const [showQR, setShowQR] = useState(false);

  // Sync form state when store changes externally
  useEffect(() => {
    setCallsign(station?.callsign ?? "");
    setOperatorName(station?.operatorName ?? "");
    setGrid(station?.grid ?? "");
    setCallsignError(null);
    setGridError(null);
  }, [station]);

  // Dirty tracking
  const isDirty = useMemo(() => {
    const currentCallsign = station?.callsign ?? "";
    const currentName = station?.operatorName ?? "";
    const currentGrid = station?.grid ?? "";
    return (
      callsign !== currentCallsign ||
      operatorName !== currentName ||
      grid !== currentGrid
    );
  }, [callsign, operatorName, grid, station]);

  // Save handler
  const handleSave = useCallback(() => {
    // Validate callsign
    const trimmedCallsign = callsign.toUpperCase().trim();
    if (trimmedCallsign && !CALLSIGN_REGEX.test(trimmedCallsign)) {
      setCallsignError(
        "Please enter a valid amateur radio callsign (e.g., W5XXX, VE3XXX)",
      );
      return;
    }
    setCallsignError(null);

    // Validate grid
    if (grid && !isValidGrid(grid)) {
      setGridError("Please enter a valid Maidenhead grid square");
      return;
    }
    setGridError(null);

    if (trimmedCallsign || grid) {
      const coords = grid ? gridToLatLon(grid) : { lat: 0, lon: 0 };
      const gridUpper = grid.toUpperCase();

      // Preserve existing multi-location data if available
      const existingHomeId = station?.homeLocationId;
      const hasValidHome =
        station &&
        existingHomeId &&
        station.savedLocations?.some((loc) => loc.id === existingHomeId);

      if (hasValidHome && station && existingHomeId) {
        const updatedLocations = station.savedLocations.map((loc) =>
          loc.id === existingHomeId
            ? { ...loc, grid: gridUpper, lat: coords.lat, lon: coords.lon }
            : loc,
        );
        setStation({
          ...station,
          callsign: trimmedCallsign,
          operatorName: operatorName.trim() || undefined,
          savedLocations: updatedLocations,
          grid: gridUpper,
          lat: coords.lat,
          lon: coords.lon,
        });
      } else {
        const homeLocationId = crypto.randomUUID();
        const homeLocation = {
          id: homeLocationId,
          name: "Home",
          grid: gridUpper,
          lat: coords.lat,
          lon: coords.lon,
          type: "home" as const,
          createdAt: new Date().toISOString(),
        };
        setStation({
          callsign: trimmedCallsign,
          operatorName: operatorName.trim() || undefined,
          homeLocationId,
          activeLocationId: null,
          savedLocations: [homeLocation],
          grid: gridUpper,
          lat: coords.lat,
          lon: coords.lon,
        });
      }
    } else {
      setStation(null);
    }

    setIsEditing(false);
  }, [callsign, operatorName, grid, station, setStation]);

  // Display values
  const displayCallsign = station?.callsign || "NO CALL";
  const displayName = station?.operatorName || station?.name;
  const displayGrid = activeLocation?.grid || station?.grid || "----";

  // ---- Desktop Layout -------------------------------------------------------

  if (!isMobile) {
    return (
      <div className="flex gap-8 max-w-[1080px] mx-auto px-6 py-6">
        {/* Sidebar profile card */}
        <div className="w-[320px] flex-shrink-0 sticky top-6 self-start">
          <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
            {/* Callsign */}
            <div className="text-center mb-4">
              <h2 className="font-mono text-2xl font-bold text-plasma-orange">
                {displayCallsign}
              </h2>
              {displayName && (
                <p className="text-sm text-gray-400 mt-1">{displayName}</p>
              )}
            </div>

            {/* Info rows */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between py-1.5 border-t border-white/5">
                <span className="text-gray-500">Grid</span>
                <span className="font-mono text-gray-200">{displayGrid}</span>
              </div>
              {activeLocation && (
                <div className="flex items-center justify-between py-1.5 border-t border-white/5">
                  <span className="text-gray-500">Coordinates</span>
                  <span className="font-mono text-gray-300 text-xs">
                    {activeLocation.lat.toFixed(2)},{" "}
                    {activeLocation.lon.toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {/* Completeness ring */}
            <div className="flex justify-center py-4 border-t border-white/5">
              <ProfileCompletenessRing
                score={completeness.score}
                tier={completeness.tier}
                tierColor={completeness.tierColor}
              />
            </div>

            {/* Actions */}
            {!isEditing ? (
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="flex-1 px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10
                             text-gray-300 hover:text-white hover:border-white/20 transition-colors"
                >
                  Edit Profile
                </button>
                {displayCallsign !== "NO CALL" && (
                  <button
                    type="button"
                    onClick={() => setShowQR(true)}
                    className="px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10
                               text-gray-300 hover:text-white hover:border-white/20 transition-colors"
                    title="Show QR Code"
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
                        d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                      />
                    </svg>
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
                {/* Inline callsign */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    Callsign
                  </label>
                  <input
                    type="text"
                    value={callsign}
                    onChange={(e) => {
                      setCallsign(e.target.value.toUpperCase());
                      setCallsignError(null);
                    }}
                    placeholder="N5XXX"
                    className={`w-full bg-void-black border rounded-lg px-3 py-2 text-sm text-gray-200
                               font-mono focus:border-plasma-orange/50 focus:outline-none
                               ${callsignError ? "border-alert-red/50" : "border-white/10"}`}
                  />
                  {callsignError && (
                    <p className="mt-1 text-xs text-alert-red">
                      {callsignError}
                    </p>
                  )}
                </div>
                {/* Inline name */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    Operator Name
                  </label>
                  <input
                    type="text"
                    value={operatorName}
                    onChange={(e) => setOperatorName(e.target.value)}
                    placeholder="John"
                    className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200
                               focus:border-plasma-orange/50 focus:outline-none"
                  />
                </div>
                {/* Inline grid */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    Grid Locator
                  </label>
                  <LocationInput
                    value={grid}
                    onChange={(v) => {
                      setGrid(v);
                    }}
                    error={gridError}
                    onError={setGridError}
                  />
                </div>
                {/* Save / Cancel */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      // Reset to store values
                      setCallsign(station?.callsign ?? "");
                      setOperatorName(station?.operatorName ?? "");
                      setGrid(station?.grid ?? "");
                      setCallsignError(null);
                      setGridError(null);
                      setIsEditing(false);
                    }}
                    className="flex-1 px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10
                               text-gray-300 hover:text-white hover:border-white/20 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!isDirty}
                    className={`flex-1 px-3 py-2 text-xs rounded-lg font-medium transition-colors ${
                      isDirty
                        ? "bg-plasma-orange hover:bg-plasma-orange/80 text-white"
                        : "bg-white/5 border border-white/10 text-gray-500 cursor-not-allowed"
                    }`}
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 min-w-0 max-w-[720px]">
          {/* Tab navigation */}
          <div className="flex gap-2 mb-6">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-plasma-orange/15 text-plasma-orange border border-plasma-orange/30"
                    : "text-gray-400 hover:text-gray-200 hover:bg-white/5 border border-transparent"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === "overview" && (
            <div className="space-y-8">
              {/* Profile form */}
              <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  Station Identity
                </h3>
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="profile-callsign"
                      className="block text-sm font-medium text-gray-300 mb-1"
                    >
                      Callsign
                    </label>
                    <input
                      type="text"
                      id="profile-callsign"
                      value={callsign}
                      onChange={(e) => {
                        setCallsign(e.target.value.toUpperCase());
                        setCallsignError(null);
                      }}
                      placeholder="N5XXX"
                      className={`w-full bg-void-black border rounded-lg px-3 py-2 text-sm text-gray-200
                                 font-mono focus:border-plasma-orange/50 focus:outline-none
                                 ${callsignError ? "border-alert-red/50" : "border-white/10"}`}
                    />
                    {callsignError && (
                      <p className="mt-1 text-xs text-alert-red">
                        {callsignError}
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="profile-name"
                      className="block text-sm font-medium text-gray-300 mb-1"
                    >
                      Operator Name
                      <span className="ml-1 text-xs text-gray-500 font-normal">
                        (optional)
                      </span>
                    </label>
                    <input
                      type="text"
                      id="profile-name"
                      value={operatorName}
                      onChange={(e) => setOperatorName(e.target.value)}
                      placeholder="John"
                      className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200
                                 focus:border-plasma-orange/50 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Home Grid Square
                    </label>
                    <LocationInput
                      value={grid}
                      onChange={(v) => {
                        setGrid(v);
                      }}
                      error={gridError}
                      onError={setGridError}
                    />
                  </div>
                  {isDirty && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={handleSave}
                        className="bg-plasma-orange hover:bg-plasma-orange/80 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        Save Profile
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* License section */}
              <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
                <LicenseSection />
              </div>

              {/* Bio */}
              <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
                <BioSection />
              </div>

              {/* Social Links */}
              <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
                <SocialLinksSection />
              </div>
            </div>
          )}

          {activeTab === "locations" && (
            <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
              <LocationManager />
            </div>
          )}

          {activeTab === "awards" && (
            <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
              <AwardsTab />
            </div>
          )}

          {activeTab === "stats" && (
            <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6">
              <StatsTab />
            </div>
          )}
        </div>

        <QRCodeModal
          isOpen={showQR}
          onClose={() => setShowQR(false)}
          callsign={displayCallsign}
          grid={displayGrid !== "----" ? displayGrid : undefined}
        />
      </div>
    );
  }

  // ---- Mobile Layout --------------------------------------------------------

  return (
    <div className="px-4 py-4">
      {/* Compact profile card */}
      <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl px-4 py-3 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-mono text-lg font-bold text-plasma-orange">
              {displayCallsign}
            </h2>
            <p className="text-xs text-gray-400 font-mono">{displayGrid}</p>
          </div>
          <div className="flex items-center gap-3">
            {displayName && (
              <span className="text-sm text-gray-400">{displayName}</span>
            )}
            <ProfileCompletenessRing
              score={completeness.score}
              tier={completeness.tier}
              tierColor={completeness.tierColor}
              size={56}
            />
          </div>
        </div>
      </div>

      {/* Tab pills */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "bg-plasma-orange text-white"
                : "bg-white/5 text-gray-400 hover:text-gray-200 hover:bg-white/10"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {/* Profile form */}
          <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Station Identity
            </h3>
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="mobile-callsign"
                  className="block text-sm font-medium text-gray-300 mb-1"
                >
                  Callsign
                </label>
                <input
                  type="text"
                  id="mobile-callsign"
                  value={callsign}
                  onChange={(e) => {
                    setCallsign(e.target.value.toUpperCase());
                    setCallsignError(null);
                  }}
                  placeholder="N5XXX"
                  className={`w-full bg-void-black border rounded-lg px-3 py-2 text-sm text-gray-200
                             font-mono focus:border-plasma-orange/50 focus:outline-none
                             ${callsignError ? "border-alert-red/50" : "border-white/10"}`}
                />
                {callsignError && (
                  <p className="mt-1 text-xs text-alert-red">{callsignError}</p>
                )}
              </div>
              <div>
                <label
                  htmlFor="mobile-name"
                  className="block text-sm font-medium text-gray-300 mb-1"
                >
                  Operator Name
                  <span className="ml-1 text-xs text-gray-500 font-normal">
                    (optional)
                  </span>
                </label>
                <input
                  type="text"
                  id="mobile-name"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  placeholder="John"
                  className="w-full bg-void-black border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200
                             focus:border-plasma-orange/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Home Grid Square
                </label>
                <LocationInput
                  value={grid}
                  onChange={(v) => {
                    setGrid(v);
                  }}
                  error={gridError}
                  onError={setGridError}
                />
              </div>
              {isDirty && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    className="w-full bg-plasma-orange hover:bg-plasma-orange/80 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    Save Profile
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* License */}
          <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
            <LicenseSection />
          </div>

          {/* Bio */}
          <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
            <BioSection />
          </div>

          {/* Social Links */}
          <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
            <SocialLinksSection />
          </div>
        </div>
      )}

      {activeTab === "locations" && (
        <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
          <LocationManager />
        </div>
      )}

      {activeTab === "awards" && (
        <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
          <AwardsTab />
        </div>
      )}

      {activeTab === "stats" && (
        <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4">
          <StatsTab />
        </div>
      )}

      <QRCodeModal
        isOpen={showQR}
        onClose={() => setShowQR(false)}
        callsign={displayCallsign}
        grid={displayGrid !== "----" ? displayGrid : undefined}
      />
    </div>
  );
}
