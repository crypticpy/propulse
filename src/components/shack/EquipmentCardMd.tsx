/**
 * EquipmentCardMd — Medium-size equipment card (~180px tall).
 *
 * Condensed vertical layout for mobile grids, compact displays, and dashboard
 * widgets. Shares the collectible card DNA of the L-size EquipmentCard but
 * trades vertical space for density: smaller art zone (60px), 2-stat max,
 * 3-pill cap with "+N" overflow, and hover-only action buttons.
 */

import { useState } from "react";
import { getEquipmentSymbol } from "./EquipmentSymbols";
import { StatIconSvg, ArtZonePattern } from "./EquipmentCard";
import { useImageUrl } from "@/hooks/useImageUrl";
import { useOperatorRank } from "@/hooks/useOperatorRank";
import { RankBadge } from "@/components/rank/RankBadge";
import {
  getRankBorderStyle,
  getRankCardClasses,
} from "@/components/rank/RankBorderStyles";

import {
  type EquipmentCardData,
  ACCENT_HEX,
  ACCENT_BG,
  ACCENT_TEXT,
  TIER_LABELS,
  GLOW_SHADOW,
  BADGE_STYLES,
  getCapabilityPillStyle,
} from "./equipmentCardTypes";

// ─── Props ──────────────────────────────────────────────────────────────────

export interface EquipmentCardMdProps extends EquipmentCardData {
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  className?: string;
}

// ─── Compact Action Icons (12x12) ──────────────────────────────────────────

function EditIconSm() {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
    </svg>
  );
}

function TrashIconSm() {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 4h12M5.5 4V2.5h5V4M6 7v5m4-5v5" />
      <path d="M3.5 4l.5 9.5a1 1 0 001 .5h6a1 1 0 001-.5l.5-9.5" />
    </svg>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function EquipmentCardMd({
  title,
  // subtitle not displayed at this size
  subtitle: _subtitle,
  equipmentType,
  typeLabel,
  tier,
  badges,
  stats,
  capabilities,
  visualization,
  imageId,
  isActive,
  onClick,
  onEdit,
  onDelete,
  className,
}: EquipmentCardMdProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { url: imageUrl } = useImageUrl(imageId);
  const { rank } = useOperatorRank();
  const accentHex = ACCENT_HEX[equipmentType];
  const rankBorderStyle = getRankBorderStyle(rank, accentHex);
  const glowClass = GLOW_SHADOW[equipmentType];
  const hasActions = onEdit || onDelete;

  const SymbolComponent = getEquipmentSymbol(equipmentType);
  const resolvedTypeLabel = typeLabel || equipmentType.toUpperCase();

  // Truncate stats to 2, capabilities to 3
  const displayStats = stats?.slice(0, 2);
  const displayCaps = capabilities?.slice(0, 3);
  const overflowCount =
    capabilities && capabilities.length > 3 ? capabilities.length - 3 : 0;

  return (
    <div
      role="article"
      aria-label={title}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={[
        "group relative flex flex-col w-full min-w-0",
        "bg-[#0f1420] rounded-lg overflow-hidden",
        "border",
        onClick ? "cursor-pointer" : "",
        "transition-all duration-200",
        isHovered ? `-translate-y-px ${glowClass}` : "",
        "active:scale-[0.98]",
        isActive
          ? "ring-1 ring-signal-green/20 shadow-[0_0_20px_rgba(34,197,94,0.15)]"
          : "",
        getRankCardClasses(rank),
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ ...rankBorderStyle }}
    >
      {/* ── 4px Top Accent Bar ── */}
      <div className={`h-1 w-full ${ACCENT_BG[equipmentType]}`} />

      {/* ── Header: Type + Tier + Actions ── */}
      <div className="relative px-3 pt-2 pb-1 min-w-0">
        <div className="flex items-center gap-1 pr-12">
          <span
            className={`text-[9px] uppercase tracking-widest font-semibold ${ACCENT_TEXT[equipmentType]} truncate`}
          >
            {resolvedTypeLabel}
          </span>
          {tier && (
            <span
              className={`text-[9px] uppercase tracking-widest font-semibold ${ACCENT_TEXT[equipmentType]} opacity-50 flex-shrink-0`}
            >
              &middot; {TIER_LABELS[tier]}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-sm font-bold text-white leading-tight truncate mt-0.5">
          {title}
        </h3>

        {/* Action buttons — hover only */}
        {hasActions && (
          <div className="absolute top-1.5 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="p-1 rounded bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors min-h-[22px] min-w-[22px] flex items-center justify-center"
                aria-label={`Edit ${title}`}
                title="Edit"
              >
                <EditIconSm />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-1 rounded bg-white/5 hover:bg-white/10 text-gray-400 hover:text-alert-red transition-colors min-h-[22px] min-w-[22px] flex items-center justify-center"
                aria-label={`Delete ${title}`}
                title="Delete"
              >
                <TrashIconSm />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Reduced Art Zone (~60px) ── */}
      <div className="h-[60px] flex items-center justify-center relative overflow-hidden mx-2.5">
        {visualization ? (
          visualization
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <>
            {/* Type-specific background pattern */}
            <div
              className={`absolute inset-0 pointer-events-none opacity-[0.04] ${ACCENT_TEXT[equipmentType]}`}
            >
              <ArtZonePattern type={equipmentType} />
            </div>

            {/* Radial glow behind symbol */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(circle, ${accentHex}14 0%, transparent 60%)`,
              }}
            />

            {/* Symbol (32x32) */}
            <div className={ACCENT_TEXT[equipmentType]}>
              <SymbolComponent className="w-8 h-8" />
            </div>
          </>
        )}
      </div>

      {/* ── Stats Row (horizontal, max 2) ── */}
      {displayStats && displayStats.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-1.5">
          {displayStats.map((stat) => (
            <div
              key={`${stat.icon}-${stat.label}`}
              className="flex items-center gap-1 min-w-0"
            >
              <span className="text-gray-500 flex-shrink-0">
                <StatIconSvg icon={stat.icon} />
              </span>
              <span className="text-xs font-mono font-bold text-gray-100 truncate">
                {stat.value}
              </span>
              <span className="text-[9px] text-gray-500 flex-shrink-0 hidden sm:inline">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Capability Pills (3 max + overflow) ── */}
      {displayCaps && displayCaps.length > 0 && (
        <div className="px-3 pb-1.5 flex flex-wrap gap-0.5">
          {displayCaps.map((cap) => (
            <span
              key={`${cap.category}-${cap.label}`}
              className={`px-1 py-px text-[9px] font-mono font-medium rounded border ${getCapabilityPillStyle(cap)}`}
            >
              {cap.label}
            </span>
          ))}
          {overflowCount > 0 && (
            <span className="px-1 py-px text-[9px] font-mono font-medium rounded bg-gray-800/60 text-gray-400 border border-gray-700/40">
              +{overflowCount}
            </span>
          )}
        </div>
      )}

      {/* ── Badges Row ── */}
      {badges && badges.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {badges.map((badge) => (
            <span
              key={badge.label}
              className={`px-1.5 py-px text-[9px] font-medium rounded ${BADGE_STYLES[badge.color ?? "gray"]}`}
            >
              {badge.label}
            </span>
          ))}
        </div>
      )}

      {/* ── Rank Badge ── */}
      <div className="px-3 pb-2">
        <RankBadge rank={rank} size="sm" />
      </div>
    </div>
  );
}

export default EquipmentCardMd;
