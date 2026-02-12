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
import type {
  InterestTag,
  OnAirStatus,
  SkedAvailability,
  FavoriteFrequency,
} from "@/types/social";
import type { RankTier } from "@/types/rank";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { useSocialStore } from "@/stores/socialStore";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { AuthRequiredPlaceholder } from "@/components/auth";
// LocationManager moved to Settings — locations managed via /settings route
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
  HeroStatsBlock,
  PersonalRecords,
  ArchetypeRadar,
  MyShackTab,
} from "@/components/profile";
import { EquipmentSummary } from "@/components/profile/EquipmentSummary";
import { QSLSummary } from "@/components/profile/QSLSummary";
import { FriendList } from "@/components/profile/FriendList";
import { ActivityFeed } from "@/components/profile/ActivityFeed";
import { VisibilitySettings } from "@/components/profile/VisibilitySettings";
import { ShareCard } from "@/components/profile/ShareCard";
import { VisitorProfileCard } from "@/components/profile/VisitorProfileCard";
import { ContactThisStation } from "@/components/profile/ContactThisStation";
import { InterestTagDisplay } from "@/components/profile/InterestTagDisplay";
import { InterestTagPicker } from "@/components/profile/InterestTagPicker";
import { WhereToFindMe } from "@/components/profile/WhereToFindMe";
import { OnAirToggle } from "@/components/profile/OnAirToggle";
import type { ProfileTab } from "@/components/profile";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useOperatorRank } from "@/hooks/useOperatorRank";
import { getRankPageVars } from "@/components/rank/RankBorderStyles";
import { isRankAtLeast } from "@/lib/data/rankConstants";
import { useRankAssets } from "@/hooks/useRankAssets";
import { useLogbookStats } from "@/hooks/useLogbookStats";
import { useLogbook } from "@/hooks/useLogbook";

// ---- Callsign validation ----------------------------------------------------

/** Amateur radio: 1-3 prefix + digit + 0-3 middle + letter suffix (W5XXX, VE3ABC) */
const AMATEUR_CALLSIGN_REGEX = /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{0,3}[A-Z]$/i;
/** GMRS: W + 3 letters + 3 digits (WSLK349, WRFQ375) */
const GMRS_CALLSIGN_REGEX = /^W[A-Z]{3}[0-9]{3}$/i;

function isValidCallsign(cs: string): boolean {
  return AMATEUR_CALLSIGN_REGEX.test(cs) || GMRS_CALLSIGN_REGEX.test(cs);
}

// ---- Other profile view -----------------------------------------------------

/**
 * Renders a rich read-only view of another user's profile fetched from Supabase.
 * Desktop: two-column layout (VisitorProfileCard sidebar + tabbed content).
 * Mobile: stacked compact header + horizontal tab pills + tab content.
 */
function OtherProfileView({
  callsign,
  isMobile,
}: {
  callsign: string;
  isMobile: boolean;
}) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const requireAuth = useRequireAuth();
  const following = useSocialStore((s) => s.following);
  const fetchFollowing = useSocialStore((s) => s.fetchFollowing);
  const followUser = useSocialStore((s) => s.followUser);
  const unfollowUser = useSocialStore((s) => s.unfollowUser);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUnfollowConfirm, setShowUnfollowConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");

  // Viewer's own data for ContactThisStation and shared-interest highlighting
  const viewerStation = useProfileStore((s) => s.station);
  const viewerInterests = useProfileStore((s) => s.interests);
  const viewerStats = useLogbookStats();
  const { entries: viewerEntries } = useLogbook();

  // Compute viewer operating hours from logbook entries
  const viewerHours = useMemo(() => {
    const hourly = new Array<number>(24).fill(0);
    for (const entry of viewerEntries) {
      if (entry.timeOn) {
        const h = parseInt(entry.timeOn.split(":")[0], 10);
        if (Number.isFinite(h) && h >= 0 && h <= 23) hourly[h]++;
      }
    }
    return hourly;
  }, [viewerEntries]);

  // Fetch following list for follow button state
  useEffect(() => {
    if (isAuthenticated) fetchFollowing();
  }, [isAuthenticated, fetchFollowing]);

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
          country: (data as Record<string, unknown>).country as
            | string
            | undefined,
          interests: (data as Record<string, unknown>).interests as
            | InterestTag[]
            | undefined,
          onAirStatus: (data as Record<string, unknown>).on_air_status as
            | OnAirStatus
            | null
            | undefined,
          skedAvailability: (data as Record<string, unknown>)
            .sked_availability as SkedAvailability | undefined,
          favoriteFreqs: (data as Record<string, unknown>).favorite_freqs as
            | FavoriteFrequency[]
            | undefined,
          operatingHours: (data.stats_cache as Record<string, unknown> | null)
            ?.qsosByHourUtc as number[] | undefined,
          operatorRank: (data as Record<string, unknown>).operator_rank as
            | string
            | undefined,
          rankPoints: (data as Record<string, unknown>).rank_points as
            | number
            | undefined,
          lat: (data as Record<string, unknown>).lat as number | undefined,
          lon: (data as Record<string, unknown>).lon as number | undefined,
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

  // Auth gate: viewing other profiles requires sign-in
  if (isSupabaseConfigured && !isAuthenticated) {
    return (
      <div
        className={isMobile ? "px-4 py-4" : "max-w-[720px] mx-auto px-6 py-6"}
      >
        <div className="mb-4">
          <Link
            to="/profile"
            className="text-sm text-plasma-orange hover:text-plasma-orange/80 underline"
          >
            &larr; Back to My Profile
          </Link>
        </div>
        <AuthRequiredPlaceholder prompt="Sign in to view operator profiles" />
      </div>
    );
  }

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

  // Visibility shorthand
  const vis = profile.visibilitySettings;

  // Follow state
  const isFollowing = following.some((f) => f.id === profile.id);

  const handleFollow = () => {
    requireAuth(() => followUser(profile.id), "Sign in to follow operators");
  };

  // Rank theming
  const profileRank = (profile.operatorRank || "novice") as RankTier;
  const rankVars = getRankPageVars(profileRank);

  // Panel classes
  const panelClass = isMobile
    ? "bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4"
    : "bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6";

  // ---- Visitor Tab Content ----

  const visitorTabContent = (
    <>
      {activeTab === "overview" && (
        <div className={isMobile ? "space-y-4" : "space-y-8"}>
          {/* Contact This Station — path analysis, band conditions, schedule overlap */}
          <ContactThisStation
            profile={profile}
            viewerLat={viewerStation?.lat}
            viewerLon={viewerStation?.lon}
            viewerGrid={viewerStation?.grid}
            viewerStats={viewerStats as unknown as Record<string, unknown>}
            viewerHours={viewerHours}
          />

          {/* Hero Stats — visitor version from statsCache */}
          {(!vis || vis.stats !== "private") && profile.statsCache && (
            <div className={panelClass}>
              <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-3">
                Station Stats
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {typeof profile.statsCache.totalQSOs === "number" && (
                  <div className="bg-void/50 rounded-lg px-3 py-2.5 text-center">
                    <div className="text-lg font-bold text-white font-mono">
                      {profile.statsCache.totalQSOs.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-gray-500 uppercase">
                      Total QSOs
                    </div>
                  </div>
                )}
                {typeof profile.statsCache.uniqueCountries === "number" && (
                  <div className="bg-void/50 rounded-lg px-3 py-2.5 text-center">
                    <div className="text-lg font-bold text-white font-mono">
                      {profile.statsCache.uniqueCountries.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-gray-500 uppercase">
                      Countries
                    </div>
                  </div>
                )}
                {typeof profile.statsCache.uniqueCallsigns === "number" && (
                  <div className="bg-void/50 rounded-lg px-3 py-2.5 text-center">
                    <div className="text-lg font-bold text-white font-mono">
                      {profile.statsCache.uniqueCallsigns.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-gray-500 uppercase">
                      Unique Calls
                    </div>
                  </div>
                )}
                {profile.statsCache.qsosByBand &&
                typeof profile.statsCache.qsosByBand === "object" ? (
                  <div className="bg-void/50 rounded-lg px-3 py-2.5 text-center">
                    <div className="text-lg font-bold text-white font-mono">
                      {
                        Object.keys(
                          profile.statsCache.qsosByBand as Record<
                            string,
                            unknown
                          >,
                        ).length
                      }
                    </div>
                    <div className="text-[10px] text-gray-500 uppercase">
                      Bands
                    </div>
                  </div>
                ) : null}
                {profile.statsCache.qsosByMode &&
                typeof profile.statsCache.qsosByMode === "object" ? (
                  <div className="bg-void/50 rounded-lg px-3 py-2.5 text-center">
                    <div className="text-lg font-bold text-white font-mono">
                      {
                        Object.keys(
                          profile.statsCache.qsosByMode as Record<
                            string,
                            unknown
                          >,
                        ).length
                      }
                    </div>
                    <div className="text-[10px] text-gray-500 uppercase">
                      Modes
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Interest Tags — read-only with shared-interest highlighting */}
          {profile.interests && profile.interests.length > 0 && (
            <div className={panelClass}>
              <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-3">
                Interests
              </h3>
              <InterestTagDisplay
                tags={profile.interests}
                viewerTags={viewerInterests}
              />
            </div>
          )}

          {/* Where to Find Me — read-only */}
          {(!vis || vis.location !== "private") && (
            <div className={panelClass}>
              <WhereToFindMe
                hours={profile.operatingHours}
                qsosByDate={
                  profile.statsCache?.qsosByDate as
                    | Record<string, number>
                    | undefined
                }
                favoriteFreqs={profile.favoriteFreqs}
                skedAvailability={profile.skedAvailability}
              />
            </div>
          )}

          {/* Bio */}
          {profile.bio && (
            <div className={panelClass}>
              <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                About
              </h3>
              <p className="text-gray-300 text-sm whitespace-pre-wrap">
                {profile.bio}
              </p>
            </div>
          )}

          {/* Social Links */}
          {(!vis || vis.activity !== "private") &&
            profile.socialLinks &&
            profile.socialLinks.length > 0 && (
              <div className={panelClass}>
                <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                  Links
                </h3>
                <ul className="space-y-1">
                  {profile.socialLinks.map((link, i) => {
                    const url = link.url?.trim().toLowerCase() ?? "";
                    const isSafe =
                      url.startsWith("http://") ||
                      url.startsWith("https://") ||
                      url.startsWith("mailto:");
                    return (
                      <li key={i}>
                        {isSafe ? (
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-nebula-blue hover:underline"
                          >
                            {link.type}: {link.url}
                          </a>
                        ) : (
                          <span className="text-sm text-gray-400">
                            {link.type}: {link.url}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
        </div>
      )}

      {activeTab === "shack" && (
        <div className={panelClass}>
          {(!vis || vis.equipment !== "private") && profile.statsCache ? (
            <div>
              <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-3">
                Station Equipment
              </h3>
              {profile.statsCache.equipment ? (
                <pre className="text-sm text-gray-300 whitespace-pre-wrap">
                  {JSON.stringify(profile.statsCache.equipment, null, 2)}
                </pre>
              ) : (
                <p className="text-gray-500 text-sm italic py-4 text-center">
                  Equipment info not available
                </p>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-sm italic py-4 text-center">
              Equipment info is private
            </p>
          )}
        </div>
      )}

      {activeTab === "stats" && (
        <div className={panelClass}>
          {(!vis || vis.stats !== "private") && profile.statsCache ? (
            <div>
              <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-3">
                Stats &amp; Records
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(profile.statsCache)
                  .filter(
                    ([key]) =>
                      typeof profile.statsCache![key] === "number" ||
                      typeof profile.statsCache![key] === "string",
                  )
                  .map(([key, value]) => (
                    <div
                      key={key}
                      className="bg-void/50 rounded-lg px-3 py-2.5 text-center"
                    >
                      <div className="text-lg font-bold text-gray-200 font-mono">
                        {typeof value === "number"
                          ? value.toLocaleString()
                          : String(value)}
                      </div>
                      <div className="text-[10px] text-gray-500 capitalize">
                        {key
                          .replace(/([A-Z])/g, " $1")
                          .replace(/_/g, " ")
                          .trim()}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-sm italic py-4 text-center">
              Stats are private
            </p>
          )}
        </div>
      )}

      {activeTab === "awards" && (
        <div className={panelClass}>
          {(!vis || vis.awards !== "private") && profile.statsCache?.awards ? (
            <div>
              <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-3">
                Awards
              </h3>
              <pre className="text-sm text-gray-300 whitespace-pre-wrap">
                {JSON.stringify(profile.statsCache.awards, null, 2)}
              </pre>
            </div>
          ) : (
            <p className="text-gray-500 text-sm italic py-4 text-center">
              {vis?.awards === "private"
                ? "Awards are private"
                : "No awards data available"}
            </p>
          )}
        </div>
      )}

      {activeTab === "social" && (
        <div className={isMobile ? "space-y-4" : "space-y-8"}>
          <div className={panelClass}>
            <FriendList />
          </div>
        </div>
      )}
    </>
  );

  // ---- Desktop Layout ----

  if (!isMobile) {
    return (
      <div
        className="flex gap-8 max-w-[1080px] mx-auto px-6 py-6"
        style={rankVars}
      >
        {/* Sidebar */}
        <VisitorProfileCard
          profile={profile}
          viewerInterests={viewerInterests}
          isFollowing={isFollowing}
          onFollow={handleFollow}
          onUnfollow={() => setShowUnfollowConfirm(true)}
        />

        {/* Main content area */}
        <div className="flex-1 min-w-0 max-w-[720px]">
          <div className="mb-6">
            <Link
              to="/profile"
              className="text-sm text-plasma-orange hover:text-plasma-orange/80 underline"
            >
              &larr; Back to My Profile
            </Link>
          </div>
          <ProfileTabBar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            isMobile={false}
            isVisitor
          />
          <div
            role="tabpanel"
            id={`profile-tabpanel-${activeTab}`}
            aria-labelledby={`profile-tab-${activeTab}`}
            className="mt-4"
          >
            {visitorTabContent}
          </div>
        </div>

        <ConfirmDialog
          open={showUnfollowConfirm}
          title="Unfollow Operator"
          message="Are you sure you want to unfollow this operator?"
          confirmLabel="Unfollow"
          variant="warning"
          onConfirm={() => {
            unfollowUser(profile.id);
            setShowUnfollowConfirm(false);
          }}
          onCancel={() => setShowUnfollowConfirm(false)}
        />
      </div>
    );
  }

  // ---- Mobile Layout ----

  return (
    <div className="px-4 py-4" style={rankVars}>
      <div className="mb-4">
        <Link
          to="/profile"
          className="text-sm text-plasma-orange hover:text-plasma-orange/80 underline"
        >
          &larr; Back to My Profile
        </Link>
      </div>

      {/* Compact mobile profile header */}
      <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl px-4 py-3 mb-4">
        <div className="flex items-center gap-3">
          {profile.avatarUrl && (
            <img
              src={profile.avatarUrl}
              alt={`${profile.callsign} avatar`}
              className="w-12 h-12 rounded-full object-cover border-2 border-white/10"
            />
          )}
          <div className="flex-1 min-w-0">
            <h2 className="font-mono text-lg font-bold text-plasma-orange">
              {profile.callsign || "UNKNOWN"}
            </h2>
            {profile.operatorName && (
              <p className="text-sm text-gray-400">{profile.operatorName}</p>
            )}
            {profile.grid && (!vis || vis.location !== "private") && (
              <p className="text-xs text-gray-500 font-mono">{profile.grid}</p>
            )}
          </div>
          <button
            type="button"
            onClick={
              isFollowing ? () => setShowUnfollowConfirm(true) : handleFollow
            }
            className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              isFollowing
                ? "bg-signal-green/20 text-signal-green border-signal-green/30"
                : "bg-plasma-orange/15 text-plasma-orange border-plasma-orange/30"
            }`}
          >
            {isFollowing ? "Following" : "Follow"}
          </button>
        </div>
      </div>

      <ProfileTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isMobile
        isVisitor
      />

      <div
        role="tabpanel"
        id={`profile-tabpanel-${activeTab}`}
        aria-labelledby={`profile-tab-${activeTab}`}
        className="mt-4"
      >
        {visitorTabContent}
      </div>

      <ConfirmDialog
        open={showUnfollowConfirm}
        title="Unfollow Operator"
        message="Are you sure you want to unfollow this operator?"
        confirmLabel="Unfollow"
        variant="warning"
        onConfirm={() => {
          unfollowUser(profile.id);
          setShowUnfollowConfirm(false);
        }}
        onCancel={() => setShowUnfollowConfirm(false)}
      />
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
  const { rank, color: rankColor } = useOperatorRank();
  const rankPageVars = getRankPageVars(rank);
  const assets = useRankAssets(rank);

  // Wave 2 profile fields
  const interests = useProfileStore((s) => s.interests);
  const onAirStatus = useProfileStore((s) => s.onAirStatus);
  const skedAvailability = useProfileStore((s) => s.skedAvailability);
  const favoriteFreqs = useProfileStore((s) => s.favoriteFreqs);

  // Logbook data for operating hours and stats
  const stats = useLogbookStats();
  const { entries } = useLogbook();

  // Compute operating hours from logbook entries
  const operatingHours = useMemo(() => {
    const hourly = new Array<number>(24).fill(0);
    for (const entry of entries) {
      if (entry.timeOn) {
        const h = parseInt(entry.timeOn.split(":")[0], 10);
        if (Number.isFinite(h) && h >= 0 && h <= 23) hourly[h]++;
      }
    }
    return hourly;
  }, [entries]);

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
    if (trimmedCallsign && !isValidCallsign(trimmedCallsign)) {
      setCallsignError(
        "Please enter a valid callsign (e.g., W5XXX, VE3XXX, or GMRS like WSLK349)",
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
        // Only create home location if grid is provided
        if (grid) {
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
        } else {
          // Callsign only, no grid — create station without location
          setStation({
            callsign: trimmedCallsign,
            operatorName: operatorName.trim() || undefined,
            homeLocationId: "",
            activeLocationId: null,
            savedLocations: station?.savedLocations ?? [],
            grid: "",
            lat: 0,
            lon: 0,
          });
        }
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
  const displayName = station?.operatorName;
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
    ? "bg-panel/30 backdrop-blur-sm border rounded-2xl p-4"
    : "bg-panel/30 backdrop-blur-sm border rounded-2xl p-6";

  const panelStyle: React.CSSProperties = {
    borderColor: "var(--rank-border, rgba(255,255,255,0.05))",
    boxShadow: `0 0 30px var(--rank-glow, transparent)`,
  };

  // ---- Tab Content (shared between desktop and mobile) ----------------------

  const tabContent = (
    <>
      {activeTab === "overview" && (
        <div className={isMobile ? "space-y-4" : "space-y-8"}>
          {/* Hero Stats — the baseball card front */}
          <HeroStatsBlock />

          {/* Operating Archetypes — the D&D character sheet */}
          <ArchetypeRadar />

          {/* Personal Records — scrollable bests */}
          <PersonalRecords />

          {/* Interest Tags — editable picker */}
          <div className={panelClass} style={panelStyle}>
            <InterestTagPicker
              selected={interests}
              onChange={(tags) => useProfileStore.getState().setInterests(tags)}
            />
          </div>

          {/* Where to Find Me — editable */}
          <div className={panelClass} style={panelStyle}>
            <WhereToFindMe
              hours={operatingHours}
              qsosByDate={stats.qsosByDate}
              favoriteFreqs={favoriteFreqs}
              skedAvailability={skedAvailability}
              editable
              onSkedChange={(a) =>
                useProfileStore.getState().setSkedAvailability(a)
              }
              onFreqAdd={(f) => useProfileStore.getState().addFavoriteFreq(f)}
              onFreqRemove={(id) =>
                useProfileStore.getState().removeFavoriteFreq(id)
              }
            />
          </div>

          {/* On Air Toggle */}
          <div className={panelClass} style={panelStyle}>
            <OnAirToggle
              status={onAirStatus}
              onChange={(s) => useProfileStore.getState().setOnAirStatus(s)}
            />
          </div>

          {/* Station Identity — only show form on mobile where sidebar doesn't exist */}
          {isMobile && (
            <div className={panelClass} style={panelStyle}>
              <h3
                className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4"
                style={{ color: "var(--rank-text-accent, #9ca3af)" }}
              >
                Station Identity
              </h3>
              <StationIdentityForm {...formProps} idPrefix="mobile" />
            </div>
          )}

          {/* Bio */}
          <div className={panelClass} style={panelStyle}>
            <BioSection />
          </div>

          {/* License Card */}
          <div className={panelClass} style={panelStyle}>
            <LicenseCard />
          </div>

          {/* Social Links */}
          <div className={panelClass} style={panelStyle}>
            <SocialLinksSection />
          </div>

          {/* Equipment Summary (quick preview — full view in My Shack tab) */}
          <div className={panelClass} style={panelStyle}>
            <EquipmentSummary />
            <div className="mt-3 text-right">
              <Link
                to="/shack"
                className="text-sm text-plasma-orange hover:text-plasma-orange/80 transition-colors"
              >
                Go to Shack &rarr;
              </Link>
            </div>
          </div>

          {/* QSL Services */}
          <div className={panelClass} style={panelStyle}>
            <QSLSummary />
          </div>
        </div>
      )}

      {activeTab === "shack" && (
        <div className={panelClass} style={panelStyle}>
          <MyShackTab />
        </div>
      )}

      {activeTab === "awards" && (
        <div className={panelClass} style={panelStyle}>
          <AwardsTab />
        </div>
      )}

      {activeTab === "stats" && (
        <div className={panelClass} style={panelStyle}>
          <StatsTab />
          <div className="mt-3 text-right">
            <Link
              to="/logbook"
              className="text-sm text-plasma-orange hover:text-plasma-orange/80 transition-colors"
            >
              Go to Logbook &rarr;
            </Link>
          </div>
        </div>
      )}

      {activeTab === "social" && (
        <div className={isMobile ? "space-y-4" : "space-y-8"}>
          <div className={panelClass} style={panelStyle}>
            <FriendList />
          </div>
          <div className={panelClass} style={panelStyle}>
            <ActivityFeed />
          </div>
          <div className={panelClass} style={panelStyle}>
            <VisibilitySettings />
          </div>
          <ShareCard />
        </div>
      )}
    </>
  );

  // ---- Desktop Layout -------------------------------------------------------

  if (!isMobile) {
    return (
      <div
        className="relative flex gap-8 max-w-[1080px] mx-auto px-6 py-6"
        style={{
          ...rankPageVars,
          ...(isRankAtLeast(rank, "expert")
            ? {
                backgroundImage: `radial-gradient(ellipse at 50% 0%, ${rankColor}08, transparent 70%)`,
              }
            : {}),
        }}
      >
        {assets.profileBackground && (
          <div
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              backgroundImage: `url(${assets.profileBackground})`,
              backgroundSize: "cover",
              backgroundPosition: "center top",
              maskImage:
                "linear-gradient(to bottom, black 30%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, black 30%, transparent 100%)",
            }}
          />
        )}
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
            rankColor={
              isRankAtLeast(rank, "journeyman") ? rankColor : undefined
            }
          />
          <div
            role="tabpanel"
            id={`profile-tabpanel-${activeTab}`}
            aria-labelledby={`profile-tab-${activeTab}`}
            className="mt-4"
          >
            {tabContent}
          </div>
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
    <div
      className="relative px-4 py-4"
      style={{
        ...rankPageVars,
        ...(isRankAtLeast(rank, "expert")
          ? {
              backgroundImage: `radial-gradient(ellipse at 50% 0%, ${rankColor}08, transparent 70%)`,
            }
          : {}),
      }}
    >
      {assets.profileBackground && (
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: `url(${assets.profileBackground})`,
            backgroundSize: "cover",
            backgroundPosition: "center top",
            maskImage:
              "linear-gradient(to bottom, black 30%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, black 30%, transparent 100%)",
          }}
        />
      )}
      <ProfileCardMobile
        displayCallsign={displayCallsign}
        displayName={displayName}
        displayGrid={displayGrid}
        completeness={completeness}
        onShowQR={() => setShowQR(true)}
        onEdit={() => setIsEditing(true)}
      />

      <ProfileTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isMobile
        rankColor={isRankAtLeast(rank, "journeyman") ? rankColor : undefined}
      />

      <div
        role="tabpanel"
        id={`profile-tabpanel-${activeTab}`}
        aria-labelledby={`profile-tab-${activeTab}`}
        className="mt-4"
      >
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
