/**
 * ProfilePage -- Operator Profile management page.
 *
 * Manages callsign, operator name, license, locations, and grid locator.
 * Desktop: sticky sidebar profile card (320px) + tabbed content area.
 * Mobile: compact profile card at top + horizontal tab pills + tab content.
 *
 * Also supports viewing another user's profile via /profile/:callsign.
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useProfileStore } from "@/stores/profileStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useProfileCompleteness } from "@/hooks/useProfileCompleteness";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { PublicProfile } from "@/types/social";
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

// ---- Other profile view -----------------------------------------------------

/**
 * Renders a read-only view of another user's profile fetched from Supabase.
 */
function OtherProfileView({
  callsign,
  isMobile,
}: {
  callsign: string;
  isMobile: boolean;
}) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError("Profile viewing requires Supabase to be configured.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetchProfile = async () => {
      try {
        const supabase = getSupabase();
        const { data, error: fetchError } = await supabase
          .from("profiles")
          .select("*")
          .eq("callsign", callsign.toUpperCase())
          .maybeSingle();

        if (cancelled) return;

        if (fetchError) {
          setError(`Failed to load profile: ${fetchError.message}`);
          setLoading(false);
          return;
        }

        if (!data) {
          setError(`No profile found for ${callsign.toUpperCase()}`);
          setLoading(false);
          return;
        }

        setProfile({
          id: data.id,
          callsign: data.callsign ?? "",
          operatorName: data.operator_name ?? undefined,
          bio: data.bio ?? undefined,
          avatarUrl: data.avatar_url ?? undefined,
          grid: data.grid ?? undefined,
          licenseClass: (data.license as Record<string, unknown> | null)
            ?.class as string | undefined,
          socialLinks: data.social_links
            ? (data.social_links as { type: string; url: string }[])
            : undefined,
          statsCache:
            (data.stats_cache as Record<string, unknown>) ?? undefined,
          visibilitySettings: data.visibility_settings
            ? (data.visibility_settings as unknown as PublicProfile["visibilitySettings"])
            : undefined,
          lastActiveAt: data.last_active_at ?? undefined,
        });
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Unknown error loading profile",
        );
        setLoading(false);
      }
    };

    void fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [callsign]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-plasma-orange border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-400 text-sm">
            Loading profile for {callsign.toUpperCase()}...
          </p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center space-y-4">
          <p className="text-gray-400">{error || "Profile not found."}</p>
          <Link
            to="/profile"
            className="inline-block text-sm text-plasma-orange hover:text-plasma-orange/80 underline"
          >
            Back to My Profile
          </Link>
        </div>
      </div>
    );
  }

  const panelClass = isMobile
    ? "bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4"
    : "bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6";

  return (
    <div className={isMobile ? "px-4 py-4" : "max-w-[720px] mx-auto px-6 py-6"}>
      <div className="mb-4">
        <Link
          to="/profile"
          className="text-sm text-plasma-orange hover:text-plasma-orange/80 underline"
        >
          &larr; Back to My Profile
        </Link>
      </div>

      <div className={`${panelClass} mb-6`}>
        <div className="flex items-center gap-4">
          {profile.avatarUrl && (
            <img
              src={profile.avatarUrl}
              alt={`${profile.callsign} avatar`}
              className="w-16 h-16 rounded-full object-cover border-2 border-white/10"
            />
          )}
          <div>
            <h1 className="text-2xl font-bold text-plasma-orange tracking-wide font-mono">
              {profile.callsign || "UNKNOWN"}
            </h1>
            {profile.operatorName && (
              <p className="text-gray-300">{profile.operatorName}</p>
            )}
            {profile.grid && (
              <p className="text-gray-500 text-sm font-mono">{profile.grid}</p>
            )}
          </div>
        </div>
      </div>

      {profile.bio && (
        <div className={`${panelClass} mb-6`}>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
            About
          </h3>
          <p className="text-gray-300 text-sm whitespace-pre-wrap">
            {profile.bio}
          </p>
        </div>
      )}

      {profile.socialLinks && profile.socialLinks.length > 0 && (
        <div className={`${panelClass} mb-6`}>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Links
          </h3>
          <ul className="space-y-1">
            {profile.socialLinks.map((link, i) => (
              <li key={i}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-nebula-blue hover:underline"
                >
                  {link.type}: {link.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {profile.statsCache && (
        <div className={`${panelClass} mb-6`}>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Stats
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(profile.statsCache).map(([key, value]) => (
              <div
                key={key}
                className="bg-void/50 rounded-lg px-3 py-2 text-center"
              >
                <div className="text-lg font-bold text-gray-200">
                  {typeof value === "number"
                    ? value.toLocaleString()
                    : String(value)}
                </div>
                <div className="text-xs text-gray-500 capitalize">
                  {key
                    .replace(/([A-Z])/g, " $1")
                    .replace(/_/g, " ")
                    .trim()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {profile.lastActiveAt && (
        <p className="text-xs text-gray-600 text-center mt-4">
          Last active: {new Date(profile.lastActiveAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

// ---- Page component ---------------------------------------------------------

export default function ProfilePage() {
  const { callsign: routeCallsign } = useParams<{ callsign?: string }>();
  const isViewingOther = !!routeCallsign;

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

  // ---- Viewing another user's profile ----------------------------------------

  if (isViewingOther) {
    return <OtherProfileView callsign={routeCallsign} isMobile={isMobile} />;
  }

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
