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
import {
  BioSection,
  SocialLinksSection,
  AwardsTab,
  StatsTab,
  QRCodeModal,
  LicenseCard,
  StationIdentityForm,
  ProfileTabBar,
  ProfileCardDesktop,
  ProfileCardMobile,
} from "@/components/profile";
import { EquipmentSummary } from "@/components/profile/EquipmentSummary";
import { QSLSummary } from "@/components/profile/QSLSummary";
import { FriendList } from "@/components/profile/FriendList";
import { ActivityFeed } from "@/components/profile/ActivityFeed";
import { VisibilitySettings } from "@/components/profile/VisibilitySettings";
import { ShareCard } from "@/components/profile/ShareCard";
import type { ProfileTab } from "@/components/profile";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";

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

  // Cancel edit -- reset form to store values
  const handleCancelEdit = useCallback(() => {
    setCallsign(station?.callsign ?? "");
    setOperatorName(station?.operatorName ?? "");
    setGrid(station?.grid ?? "");
    setCallsignError(null);
    setGridError(null);
    setIsEditing(false);
  }, [station]);

  // Display values
  const displayCallsign = station?.callsign || "NO CALL";
  const displayName = station?.operatorName || station?.name;
  const displayGrid = activeLocation?.grid || station?.grid || "----";

  // Shared form props
  const formProps = {
    callsign,
    setCallsign,
    operatorName,
    setOperatorName,
    grid,
    setGrid,
    isDirty,
    handleSave,
    callsignError,
    setCallsignError,
    gridError,
    setGridError,
  };

  // Shared panel class
  const panelClass = isMobile
    ? "bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4"
    : "bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6";

  // ---- Tab Content (shared between desktop and mobile) ----------------------

  const tabContent = (
    <>
      {activeTab === "overview" && (
        <div className={isMobile ? "space-y-4" : "space-y-8"}>
          {/* Station Identity Form */}
          <div className={panelClass}>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Station Identity
            </h3>
            <StationIdentityForm
              {...formProps}
              idPrefix={isMobile ? "mobile" : "profile"}
            />
          </div>

          {/* License Card */}
          <div className={panelClass}>
            <LicenseCard />
          </div>

          {/* Bio */}
          <div className={panelClass}>
            <BioSection />
          </div>

          {/* Social Links */}
          <div className={panelClass}>
            <SocialLinksSection />
          </div>

          {/* Equipment Summary */}
          <div className={panelClass}>
            <EquipmentSummary />
          </div>

          {/* QSL Services */}
          <div className={panelClass}>
            <QSLSummary />
          </div>
        </div>
      )}

      {activeTab === "locations" && (
        <div className={panelClass}>
          <LocationManager />
        </div>
      )}

      {activeTab === "awards" && (
        <div className={panelClass}>
          <AwardsTab />
        </div>
      )}

      {activeTab === "stats" && (
        <div className={panelClass}>
          <StatsTab />
        </div>
      )}

      {activeTab === "social" && (
        <div className={isMobile ? "space-y-4" : "space-y-8"}>
          <div className={panelClass}>
            <FriendList />
          </div>
          <div className={panelClass}>
            <ActivityFeed />
          </div>
          <div className={panelClass}>
            <VisibilitySettings />
          </div>
          <div className={panelClass}>
            <ShareCard />
          </div>
        </div>
      )}
    </>
  );

  // ---- Desktop Layout -------------------------------------------------------

  if (!isMobile) {
    return (
      <div className="flex gap-8 max-w-[1080px] mx-auto px-6 py-6">
        <ProfileCardDesktop
          displayCallsign={displayCallsign}
          displayName={displayName}
          displayGrid={displayGrid}
          activeLocation={activeLocation}
          completeness={completeness}
          isEditing={isEditing}
          setIsEditing={setIsEditing}
          showQR={() => setShowQR(true)}
          onCancelEdit={handleCancelEdit}
          formProps={formProps}
        />

        {/* Main content area */}
        <div className="flex-1 min-w-0 max-w-[720px]">
          <ProfileTabBar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            isMobile={false}
          />
          {tabContent}
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
      <ProfileCardMobile
        displayCallsign={displayCallsign}
        displayName={displayName}
        displayGrid={displayGrid}
        completeness={completeness}
      />

      <ProfileTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isMobile
      />

      {tabContent}

      <QRCodeModal
        isOpen={showQR}
        onClose={() => setShowQR(false)}
        callsign={displayCallsign}
        grid={displayGrid !== "----" ? displayGrid : undefined}
      />
    </div>
  );
}
