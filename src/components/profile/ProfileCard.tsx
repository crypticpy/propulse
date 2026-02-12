/**
 * ProfileCard -- Sidebar / mobile header card showing the operator's identity.
 *
 * Desktop: Full sidebar card with callsign, name, grid, coords, completeness ring,
 *          edit/QR actions, and inline edit form.
 * Mobile: Compact horizontal card with callsign, grid, name, and completeness ring.
 */

import { useMemo } from "react";
import { useProfileStore } from "@/stores/profileStore";
import { useImageUrl } from "@/hooks/useImageUrl";
import { useOperatorRank } from "@/hooks/useOperatorRank";
import { useRankAssets } from "@/hooks/useRankAssets";
import { useLogbookStats } from "@/hooks/useLogbookStats";
import { useLogbook } from "@/hooks/useLogbook";
import { RankBadge } from "@/components/rank/RankBadge";
import {
  getProfileFrameStyle,
  getProfileGlowStyle,
  getRankCardClasses,
} from "@/components/rank/RankBorderStyles";
import { isRankAtLeast } from "@/lib/data/rankConstants";
import { LivingSymbols } from "@/components/rank/EtherealEffects";
import { INTEREST_CATEGORIES } from "@/lib/data/interestTags";
import {
  computeArchetypeScores,
  getTopArchetypes,
} from "@/lib/profile/archetypeScoring";
import { OnAirBadge } from "./OnAirBadge";
import { OperatingHoursMini } from "./OperatingHoursMini";
import { ProfileCompletenessRing } from "./ProfileCompletenessRing";
import { StationIdentityForm } from "./StationIdentityForm";
import type { StationIdentityFormProps } from "./StationIdentityForm";

interface ProfileCardDesktopProps {
  displayCallsign: string;
  displayName?: string;
  displayGrid: string;
  activeLocation: { lat: number; lon: number } | null;
  completeness: { score: number; tier: string; tierColor: string };
  isEditing: boolean;
  setIsEditing: (v: boolean) => void;
  showQR: () => void;
  onCancelEdit: () => void;
  formProps: StationIdentityFormProps;
}

export function ProfileCardDesktop({
  displayCallsign,
  displayName,
  displayGrid,
  activeLocation,
  completeness,
  isEditing,
  setIsEditing,
  showQR,
  onCancelEdit,
  formProps,
}: ProfileCardDesktopProps) {
  const profileImageUrl = useProfileStore((s) => s.profileImageUrl);
  const profileImageId = useProfileStore((s) => s.profileImageId);
  const { url: uploadedImageUrl } = useImageUrl(profileImageId);
  const avatarSrc = uploadedImageUrl || profileImageUrl || null;

  const { rank, color: rankColor } = useOperatorRank();
  const assets = useRankAssets(rank);
  const frameStyle = getProfileFrameStyle(rank);
  const glowStyle = getProfileGlowStyle(rank);

  const stats = useLogbookStats();
  const { totalQSOs, uniqueCountries } = stats;
  const { entries } = useLogbook();

  // Dynamic interest tags from profile store
  const interests = useProfileStore((s) => s.interests);
  // On-air status from profile store
  const onAirStatus = useProfileStore((s) => s.onAirStatus);

  // Archetype scores for top-3 badges
  const archetypeScores = useMemo(
    () => computeArchetypeScores(stats, entries),
    [stats, entries],
  );
  const topArchetypes = getTopArchetypes(archetypeScores, 3);

  // Operating hours from logbook entries
  const operatingHours = useMemo(() => {
    const hourly = new Array<number>(24).fill(0);
    for (const entry of entries) {
      if (entry.timeOn) {
        const h = parseInt(entry.timeOn.split(":")[0], 10);
        if (Number.isFinite(h) && h >= 0 && h <= 23) {
          hourly[h]++;
        }
      }
    }
    return hourly;
  }, [entries]);

  return (
    <div className="w-[320px] flex-shrink-0 sticky top-6 self-start max-h-[calc(100vh-3rem)] overflow-y-auto">
      <div
        className={[
          "relative bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6",
          getRankCardClasses(rank),
        ]
          .filter(Boolean)
          .join(" ")}
        style={glowStyle}
      >
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
        {/* Callsign */}
        <div className="text-center mb-4">
          {avatarSrc && (
            <LivingSymbols enabled={rank === "ethereal"} accentHex={rankColor}>
              <div className="relative inline-block">
                <img
                  src={avatarSrc}
                  alt=""
                  className={[
                    "w-16 h-16 rounded-full object-cover mx-auto mb-3",
                    rank === "ethereal"
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
          <div className="flex items-center justify-center gap-2">
            <OnAirBadge status={onAirStatus} size="sm" />
            <span className="font-mono text-2xl font-bold text-plasma-orange">
              {displayCallsign}
            </span>
          </div>
          <div className="mt-1">
            <RankBadge rank={rank} size="sm" />
          </div>
          {/* Top Archetype Badges */}
          {topArchetypes.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1 mt-1">
              {topArchetypes.map((a) => (
                <span
                  key={a.key}
                  className="px-1.5 py-0.5 text-[9px] rounded-full bg-white/[0.06] text-gray-400"
                >
                  {a.icon} {a.shortLabel}
                </span>
              ))}
            </div>
          )}
          {/* Quick Stats Row */}
          <div className="flex items-center justify-center gap-4 mt-2 text-center">
            <div>
              <div className="font-mono text-sm font-bold text-white">
                {totalQSOs.toLocaleString()}
              </div>
              <div className="text-[9px] text-gray-500 uppercase">QSOs</div>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <div>
              <div className="font-mono text-sm font-bold text-white">
                {uniqueCountries}
              </div>
              <div className="text-[9px] text-gray-500 uppercase">DXCC</div>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <div>
              <div className="font-mono text-sm font-bold text-white">
                {displayGrid || "\u2014"}
              </div>
              <div className="text-[9px] text-gray-500 uppercase">Grid</div>
            </div>
          </div>
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
                {activeLocation.lat.toFixed(2)}, {activeLocation.lon.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* Interest Tag Pills */}
        {interests.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {interests.map((t) => {
              const color = INTEREST_CATEGORIES[t.category]?.color || "#888";
              return (
                <span
                  key={`${t.category}-${t.tag}`}
                  className="px-2 py-0.5 text-[10px] font-medium rounded-full border"
                  style={{
                    backgroundColor: `${color}15`,
                    borderColor: `${color}40`,
                    color: color,
                  }}
                >
                  {t.tag}
                </span>
              );
            })}
          </div>
        )}

        {/* Operating Hours Mini Strip */}
        {operatingHours.some((h) => h > 0) && (
          <div className="py-2 border-t border-white/5">
            <OperatingHoursMini hours={operatingHours} />
          </div>
        )}

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
              aria-label="Edit profile"
              onClick={() => setIsEditing(true)}
              className="flex-1 px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10
                         text-gray-300 hover:text-white hover:border-white/20 transition-colors"
            >
              Edit Profile
            </button>
            {displayCallsign !== "NO CALL" && (
              <button
                type="button"
                aria-label="Show QR code"
                onClick={showQR}
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
            <StationIdentityForm
              {...formProps}
              compact
              hideSaveButton
              idPrefix="sidebar"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancelEdit}
                className="flex-1 px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10
                           text-gray-300 hover:text-white hover:border-white/20 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={formProps.handleSave}
                disabled={!formProps.isDirty}
                className={`flex-1 px-3 py-2 text-xs rounded-lg font-medium transition-colors ${
                  formProps.isDirty
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
  );
}

interface ProfileCardMobileProps {
  displayCallsign: string;
  displayName?: string;
  displayGrid: string;
  completeness: { score: number; tier: string; tierColor: string };
  onShowQR?: () => void;
  onEdit?: () => void;
}

export function ProfileCardMobile({
  displayCallsign,
  displayName,
  displayGrid,
  completeness,
  onShowQR,
  onEdit,
}: ProfileCardMobileProps) {
  const profileImageUrl = useProfileStore((s) => s.profileImageUrl);
  const profileImageId = useProfileStore((s) => s.profileImageId);
  const { url: uploadedImageUrl } = useImageUrl(profileImageId);
  const avatarSrc = uploadedImageUrl || profileImageUrl || null;

  const { rank, color: rankColor } = useOperatorRank();
  const assets = useRankAssets(rank);
  const frameStyle = getProfileFrameStyle(rank);
  const glowStyle = getProfileGlowStyle(rank);

  return (
    <div
      className={[
        "relative bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl px-4 py-3 mb-4",
        getRankCardClasses(rank),
      ]
        .filter(Boolean)
        .join(" ")}
      style={glowStyle}
    >
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {avatarSrc && (
            <LivingSymbols enabled={rank === "ethereal"} accentHex={rankColor}>
              <div className="relative inline-block">
                <img
                  src={avatarSrc}
                  alt=""
                  className={[
                    "w-12 h-12 rounded-full object-cover",
                    rank === "ethereal"
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
                    className="absolute inset-0 w-12 h-12 pointer-events-none"
                    aria-hidden="true"
                  />
                )}
              </div>
            </LivingSymbols>
          )}
          <div>
            <h2 className="font-mono text-lg font-bold text-plasma-orange">
              {displayCallsign}
            </h2>
            <RankBadge rank={rank} size="sm" />
            <p className="text-xs text-gray-400 font-mono">{displayGrid}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {displayName && (
            <span className="text-sm text-gray-400">{displayName}</span>
          )}

          {/* QR + Edit icon buttons */}
          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                onClick={onEdit}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors"
                aria-label="Edit profile"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M11.33 2.67a1.88 1.88 0 012.67 2.66L5.67 13.67l-3.67 1 1-3.67L11.33 2.67z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
            {onShowQR && (
              <button
                onClick={onShowQR}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors"
                aria-label="Show QR code"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect
                    x="1"
                    y="1"
                    width="6"
                    height="6"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                  <rect
                    x="9"
                    y="1"
                    width="6"
                    height="6"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                  <rect
                    x="1"
                    y="9"
                    width="6"
                    height="6"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                  <rect
                    x="10"
                    y="10"
                    width="4"
                    height="4"
                    rx="0.5"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                </svg>
              </button>
            )}
          </div>

          <ProfileCompletenessRing
            score={completeness.score}
            tier={completeness.tier}
            tierColor={completeness.tierColor}
            size={56}
          />
        </div>
      </div>
    </div>
  );
}
