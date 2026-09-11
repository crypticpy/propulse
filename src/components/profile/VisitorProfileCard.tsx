import { useVisualEffects } from "@/hooks/useVisualEffects";
/**
 * VisitorProfileCard -- Read-only sidebar card for viewing another operator's profile.
 *
 * Matches the visual layout of ProfileCardDesktop but reads all data from a
 * PublicProfile prop instead of local stores. Replaces edit/QR actions with
 * a Follow/Unfollow button and highlights shared interest tags.
 */

import type { PublicProfile, InterestTag } from "@/types/social";
import type { RankTier } from "@/types/rank";
import { useRankAssets } from "@/hooks/useRankAssets";
import { RankBadge } from "@/components/rank/RankBadge";
import {
  getProfileFrameStyle,
  getProfileGlowStyle,
  getRankCardClasses,
} from "@/components/rank/RankBorderStyles";
import { isRankAtLeast, RANK_COLORS } from "@/lib/data/rankConstants";
import { LivingSymbols } from "@/components/rank/EtherealEffects";
import { OnAirBadge } from "./OnAirBadge";
import { InterestTagDisplay } from "./InterestTagDisplay";
import { OperatingHoursMini } from "./OperatingHoursMini";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface VisitorProfileCardProps {
  profile: PublicProfile;
  /**
   * Whether the target's published location may be shown to this viewer.
   * Decided once on ProfilePage with `isSectionVisibleToViewer` so the grid,
   * the coordinates and the contact panel cannot disagree.
   */
  locationDisclosed: boolean;
  /** Viewer's own interest tags — used to highlight shared interests */
  viewerInterests?: InterestTag[];
  isFollowing: boolean;
  /**
   * Whether the viewer's follow relation to this profile is known yet. While
   * it is not, neither action is offered: "Follow" would risk a duplicate
   * write on the follows primary key, "Following" would claim a relation we
   * cannot see.
   */
  relationshipKnown: boolean;
  /**
   * Present when the follow set failed to load for this viewer: the gated
   * control becomes a spelled-out retry rather than a permanently disabled
   * Follow.
   */
  onRetryRelationship?: () => void;
  onFollow: () => void;
  onUnfollow: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Safely cast the profile's operatorRank string to a RankTier (defaulting to "newcomer" → "novice"). */
function resolveRank(raw: string | undefined): RankTier {
  const VALID_RANKS: RankTier[] = [
    "novice",
    "apprentice",
    "journeyman",
    "expert",
    "master",
    "legendary",
    "ethereal",
  ];
  if (raw && VALID_RANKS.includes(raw as RankTier)) return raw as RankTier;
  return "novice";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VisitorProfileCard({
  profile,
  locationDisclosed,
  viewerInterests,
  isFollowing,
  relationshipKnown,
  onRetryRelationship,
  onFollow,
  onUnfollow,
}: VisitorProfileCardProps) {
  const rank = resolveRank(profile.operatorRank);
  const rankColor = RANK_COLORS[rank];
  const assets = useRankAssets(rank);
  const effects = useVisualEffects();
  const frameStyle = getProfileFrameStyle(rank, effects);
  const glowStyle = getProfileGlowStyle(rank, effects);

  const totalQSOs = (profile.statsCache?.totalQSOs as number) || 0;
  const uniqueCountries = (profile.statsCache?.uniqueCountries as number) || 0;
  const displayGrid = locationDisclosed ? profile.grid || "\u2014" : "\u2014";
  const interests = profile.interests ?? [];
  const operatingHours = profile.operatingHours ?? [];

  // Coordinate visibility — the page decided it; a friends-only location was
  // treated as public here before (#995 round 4).
  const showLocation =
    locationDisclosed && profile.lat != null && profile.lon != null;

  return (
    <div className="w-[320px] flex-shrink-0 sticky top-6 self-start max-h-[calc(100vh-3rem)] overflow-y-auto">
      <div
        className={[
          "relative bg-panel/30 backdrop-blur-sm border border-su-line/20 rounded-2xl p-6",
          getRankCardClasses(rank, effects),
        ]
          .filter(Boolean)
          .join(" ")}
        style={glowStyle}
      >
        {/* Rank-themed background overlay */}
        {assets.profileCardBg && (
          <div
            className="absolute inset-0 rounded-[inherit] overflow-hidden pointer-events-none"
            style={{
              backgroundImage: `url(${assets.profileCardBg})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              opacity: 0.15,
            }}
          />
        )}

        {/* ── Header: Avatar + Callsign + Rank Badge ─────────────── */}
        <div className="text-center mb-4">
          {/* Avatar */}
          {profile.avatarUrl && (
            <LivingSymbols enabled={rank === "ethereal"} accentHex={rankColor}>
              <div className="relative inline-block">
                <img
                  src={profile.avatarUrl}
                  alt=""
                  className={[
                    "w-16 h-16 rounded-full object-cover mx-auto mb-3",
                    !effects.animatedBadges || !effects.glow
                      ? ""
                      : rank === "ethereal"
                        ? "animate-rank-chromatic-ring"
                        : isRankAtLeast(rank, "master")
                          ? "animate-rank-golden-ring"
                          : isRankAtLeast(rank, "expert")
                            ? "animate-rank-pulse-glow"
                            : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={frameStyle}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                {assets.avatarFrame && (
                  <img
                    src={assets.avatarFrame}
                    alt=""
                    className="absolute inset-0 w-16 h-16 pointer-events-none"
                    aria-hidden="true"
                  />
                )}
              </div>
            </LivingSymbols>
          )}

          {/* Callsign + On Air Badge */}
          <div className="flex items-center justify-center gap-2">
            <OnAirBadge status={profile.onAirStatus} size="sm" />
            <span className="font-mono text-2xl font-bold text-plasma-orange">
              {profile.callsign}
            </span>
          </div>

          {/* Rank Badge */}
          <div className="mt-1">
            <RankBadge rank={rank} size="sm" />
          </div>

          {/* Quick Stats Row */}
          <div className="flex items-center justify-center gap-4 mt-2 text-center">
            <div>
              <div className="font-mono text-sm font-bold text-su-text">
                {totalQSOs.toLocaleString()}
              </div>
              <div className="text-[9px] text-su-muted uppercase">QSOs</div>
            </div>
            <div className="w-px h-6 bg-su-line/20" />
            <div>
              <div className="font-mono text-sm font-bold text-su-text">
                {uniqueCountries}
              </div>
              <div className="text-[9px] text-su-muted uppercase">DXCC</div>
            </div>
            <div className="w-px h-6 bg-su-line/20" />
            <div>
              <div className="font-mono text-sm font-bold text-su-text">
                {displayGrid}
              </div>
              <div className="text-[9px] text-su-muted uppercase">Grid</div>
            </div>
          </div>

          {/* Operator Name */}
          {profile.operatorName && (
            <p className="text-sm text-su-muted mt-1">{profile.operatorName}</p>
          )}
        </div>

        {/* ── Info Rows ──────────────────────────────────────────── */}
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between py-1.5 border-t border-su-line/20">
            <span className="text-su-muted">Grid</span>
            <span className="font-mono text-su-text">{displayGrid}</span>
          </div>
          {showLocation && (
            <div className="flex items-center justify-between py-1.5 border-t border-su-line/20">
              <span className="text-su-muted">Coordinates</span>
              <span className="font-mono text-su-muted text-xs">
                {profile.lat!.toFixed(2)}, {profile.lon!.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* ── Interest Tags ──────────────────────────────────────── */}
        {interests.length > 0 && (
          <div className="mt-3">
            <InterestTagDisplay
              tags={interests}
              viewerTags={viewerInterests}
              compact
            />
          </div>
        )}

        {/* ── Operating Hours Mini Strip ──────────────────────────── */}
        {operatingHours.length === 24 && operatingHours.some((h) => h > 0) && (
          <div className="py-2 border-t border-su-line/20">
            <OperatingHoursMini hours={operatingHours} />
          </div>
        )}

        {/* ── Follow / Unfollow Button ───────────────────────────── */}
        <div className="mt-4 pt-4 border-t border-su-line/20">
          {!relationshipKnown && onRetryRelationship ? (
            <button
              type="button"
              onClick={onRetryRelationship}
              className="w-full px-4 py-2.5 text-sm font-medium rounded-full text-center
                         bg-su-line/10 text-su-text border border-su-line/40
                         hover:bg-su-line/20 transition-colors"
            >
              Retry follow status
            </button>
          ) : isFollowing ? (
            <button
              type="button"
              disabled={!relationshipKnown}
              onClick={onUnfollow}
              className="w-full px-4 py-2.5 text-sm font-medium rounded-full text-center
                         bg-signal-green/20 text-signal-green border border-signal-green/30
                         hover:bg-signal-green/30 transition-colors
                         disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Following
            </button>
          ) : (
            <button
              type="button"
              disabled={!relationshipKnown}
              onClick={onFollow}
              className="w-full px-4 py-2.5 text-sm font-medium rounded-full text-center
                         bg-plasma-orange/15 text-plasma-orange border border-plasma-orange/30
                         hover:bg-plasma-orange/25 transition-colors
                         disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Follow
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
