import { useVisualEffects } from "@/hooks/useVisualEffects";
/**
 * EquipmentCard — Collectible playing-card style equipment display.
 *
 * Renders ham radio equipment (radios, antennas, feedlines, accessories,
 * inline components) as premium collectible cards with type-colored frames,
 * large centered symbols, stat blocks, capability pills, and active toggles.
 *
 * Design language: MTG/Pokemon card aesthetic — color-coded by equipment
 * type, with electrical schematic symbols and a dark space theme.
 */

import { useState, useEffect, type ReactNode } from "react";
import { getEquipmentSymbol } from "./EquipmentSymbols";
import { useImageUrl } from "@/hooks/useImageUrl";
import { useOperatorRank } from "@/hooks/useOperatorRank";
import { useRankAssets } from "@/hooks/useRankAssets";
import {
  getRankBorderStyle,
  getSheenOpacity,
  getSheenGradient,
  getRankCardClasses,
} from "@/components/rank/RankBorderStyles";
import { MouseTilt } from "@/components/rank/MouseTilt";
import { ParticleAurora } from "@/components/rank/ParticleAurora";
import { StatCountUp } from "@/components/rank/StatCountUp";
import { CardSignature } from "@/components/rank/LegendaryEffects";
import { EnergyBorderOverlay } from "@/components/rank/LegendaryEffects";
import { ChromaticBorderOverlay } from "@/components/rank/EtherealEffects";
import { useEquipmentHistory } from "@/stores/shackStore";
import { useStationQsoIndex } from "@/hooks/useStationQsoIndex";
import { useVerdictStore } from "@/stores/verdictStore";

// Inject card-level keyframe once
const CARD_STYLE_ID = "equipment-card-styles";
function ensureCardStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(CARD_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = CARD_STYLE_ID;
  style.textContent = `
@keyframes cardSheen {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes cardFlip {
  from { transform: rotateY(0deg); }
  to { transform: rotateY(180deg); }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes cardSheen {
    0%, 100% { background-position: 0% 0; }
  }
}
`;
  document.head.appendChild(style);
}

// Re-export all shared types for backward compatibility
export type {
  EquipmentType,
  EquipmentTier,
  EquipmentCardSize,
  StatIcon,
  BadgeColor,
  CapabilityCategory,
  EquipmentCardBadge,
  EquipmentCardStat,
  EquipmentCardCapability,
  EquipmentDetailField,
  EquipmentDetailGroup,
  EquipmentCardData,
} from "./equipmentCardTypes";

import {
  type EquipmentType,
  type EquipmentTier,
  type StatIcon,
  type EquipmentCardBadge,
  type EquipmentCardStat,
  type EquipmentCardCapability,
  ACCENT_HEX,
  ACCENT_BG,
  ACCENT_TEXT,
  TIER_LABELS,
  GLOW_SHADOW,
  BADGE_STYLES,
  BAND_PILL_COLORS,
  DEFAULT_BAND_PILL,
  CAPABILITY_STYLES,
} from "./equipmentCardTypes";

export interface EquipmentCardProps {
  title: string;
  subtitle?: string;
  equipmentType: EquipmentType;
  /** Override label shown above title: "TRANSCEIVER", "YAGI", "COAX", etc. */
  typeLabel?: string;
  tier?: EquipmentTier;
  badges?: EquipmentCardBadge[];
  stats?: EquipmentCardStat[];
  capabilities?: EquipmentCardCapability[];
  /** @deprecated Use capabilities with category "band" instead */
  bandPills?: string[];
  isActive?: boolean;
  onToggleActive?: () => void;
  visualization?: ReactNode;
  /** UUID referencing a stored image in IndexedDB */
  imageId?: string;
  /** Direct photo URL for visitor/public cards (Supabase Storage). */
  photoUrl?: string;
  /** Gallery image IDs for photo count badge display */
  galleryImageIds?: string[];
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  duplicateLabel?: string;
  /** Inventory id used for QSO wear and history on the reverse face. */
  instanceId?: string;
}

// ─── StatIconSvg (16x16, stroke-based, currentColor) ────────────────────────

export function StatIconSvg({ icon }: { icon: StatIcon }) {
  const base = "w-4 h-4 flex-shrink-0";
  const svgProps = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: base,
    "aria-hidden": true as const,
  };

  switch (icon) {
    case "power":
      return (
        <svg {...svgProps}>
          <path d="M9 1.5L4 9h4l-1 5.5L12 7H8l1-5.5z" />
        </svg>
      );
    case "frequency":
    case "bands":
      return (
        <svg {...svgProps}>
          <path d="M1 8c1.5-4 3-4 4.5 0s3 4 4.5 0 3-4 4.5 0" />
        </svg>
      );
    case "gain":
      return (
        <svg {...svgProps}>
          <path d="M8 13V3m0 0l-3 3m3-3l3 3" />
          <path d="M3 7l1-1m8 1l-1-1" strokeWidth={1} opacity={0.5} />
        </svg>
      );
    case "loss":
      return (
        <svg {...svgProps}>
          <path d="M8 3v10m0 0l-3-3m3 3l3-3" />
        </svg>
      );
    case "score":
      return (
        <svg {...svgProps}>
          <circle cx={8} cy={8} r={5} />
          <circle cx={8} cy={8} r={2} />
          <path d="M8 1v2m0 10v2M1 8h2m10 0h2" />
        </svg>
      );
    case "length":
      return (
        <svg {...svgProps}>
          <path d="M2 12h12" />
          <path d="M2 12V9m4 3v-2m4 3v-2m4 3V9" />
          <path d="M2 4h12" strokeWidth={1} opacity={0.4} />
        </svg>
      );
    case "impedance":
      return (
        <svg {...svgProps}>
          <text
            x={8}
            y={12.5}
            textAnchor="middle"
            fontSize={12}
            fontWeight={600}
            fill="currentColor"
            stroke="none"
          >
            {"\u03A9"}
          </text>
        </svg>
      );
    case "connector":
      return (
        <svg {...svgProps}>
          <rect x={5} y={2} width={6} height={4} rx={1} />
          <path d="M7 6v3m2-3v3" />
          <rect x={4} y={9} width={8} height={4} rx={1.5} />
          <path d="M8 13v1.5" />
        </svg>
      );
    default:
      return null;
  }
}

// ─── ArtZonePattern (type-specific background SVG patterns) ─────────────────

export function ArtZonePattern({ type }: { type: EquipmentType }) {
  const svgProps = {
    width: "100%",
    height: "100%",
    viewBox: "0 0 200 120",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    preserveAspectRatio: "xMidYMid slice" as const,
    "aria-hidden": true as const,
  };

  switch (type) {
    case "radio":
      // Concentric arc quarter-circles emanating from center-right (RF waves)
      return (
        <svg {...svgProps}>
          <path d="M140 60 Q140 30 170 30" strokeWidth={2} />
          <path d="M140 60 Q140 20 180 20" strokeWidth={1.8} />
          <path d="M140 60 Q140 10 190 10" strokeWidth={1.5} />
          <path d="M140 60 Q140 90 170 90" strokeWidth={2} />
          <path d="M140 60 Q140 100 180 100" strokeWidth={1.8} />
          <path d="M140 60 Q140 110 190 110" strokeWidth={1.5} />
        </svg>
      );
    case "antenna":
      // Horizontal dashed lines at varying heights (radiation pattern)
      return (
        <svg {...svgProps}>
          <line x1="20" y1="20" x2="180" y2="20" strokeDasharray="8 6" />
          <line x1="30" y1="40" x2="170" y2="40" strokeDasharray="6 8" />
          <line x1="10" y1="60" x2="190" y2="60" strokeDasharray="10 5" />
          <line x1="30" y1="80" x2="170" y2="80" strokeDasharray="6 8" />
          <line x1="20" y1="100" x2="180" y2="100" strokeDasharray="8 6" />
        </svg>
      );
    case "feedline":
      // Diagonal parallel lines at 45 deg (transmission line pattern)
      return (
        <svg {...svgProps}>
          <line x1="0" y1="30" x2="30" y2="0" />
          <line x1="0" y1="60" x2="60" y2="0" />
          <line x1="0" y1="90" x2="90" y2="0" />
          <line x1="0" y1="120" x2="120" y2="0" />
          <line x1="30" y1="120" x2="150" y2="0" />
          <line x1="60" y1="120" x2="180" y2="0" />
          <line x1="90" y1="120" x2="200" y2="10" />
          <line x1="120" y1="120" x2="200" y2="40" />
          <line x1="150" y1="120" x2="200" y2="70" />
          <line x1="180" y1="120" x2="200" y2="100" />
        </svg>
      );
    case "accessory":
      // Hexagonal grid pattern (PCB motif)
      return (
        <svg {...svgProps}>
          {[0, 40, 80, 120, 160].map((x) =>
            [0, 35, 70, 105].map((y) => (
              <polygon
                key={`${x}-${y}`}
                points={`${x + 20},${y} ${x + 35},${y + 8} ${x + 35},${y + 24} ${x + 20},${y + 32} ${x + 5},${y + 24} ${x + 5},${y + 8}`}
                strokeWidth={1}
              />
            )),
          )}
        </svg>
      );
    case "inline":
      // Sine wave ripples stacked vertically
      return (
        <svg {...svgProps}>
          <path
            d="M0 30 Q25 10 50 30 T100 30 T150 30 T200 30"
            strokeWidth={1.5}
          />
          <path
            d="M0 60 Q25 40 50 60 T100 60 T150 60 T200 60"
            strokeWidth={1.5}
          />
          <path
            d="M0 90 Q25 70 50 90 T100 90 T150 90 T200 90"
            strokeWidth={1.5}
          />
        </svg>
      );
  }
}

// ─── Action Button Icons ────────────────────────────────────────────────────

function EditIcon() {
  return (
    <svg
      width={14}
      height={14}
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

function TrashIcon() {
  return (
    <svg
      width={14}
      height={14}
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

function DuplicateIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x={5} y={5} width={9} height={9} rx={1.5} />
      <path d="M3 11V3a1.5 1.5 0 011.5-1.5H11" />
    </svg>
  );
}

function ExpandHintIcon() {
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
      <path d="M6 2h8v8" />
      <path d="M14 2L7 9" />
    </svg>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function EquipmentCard({
  title,
  subtitle,
  equipmentType,
  typeLabel,
  tier,
  badges,
  stats,
  capabilities,
  bandPills,
  isActive,
  onToggleActive,
  visualization,
  imageId,
  photoUrl,
  galleryImageIds,
  onClick,
  onEdit,
  onDelete,
  onDuplicate,
  duplicateLabel = "Duplicate",
  instanceId,
}: EquipmentCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => {
    ensureCardStyles();
  }, []);
  useEffect(() => {
    setPhotoFailed(false);
  }, [photoUrl, imageId]);
  const { url: storedImageUrl } = useImageUrl(imageId);
  const imageUrl = photoFailed ? null : photoUrl || storedImageUrl;
  const accentHex = ACCENT_HEX[equipmentType];
  const glowClass = GLOW_SHADOW[equipmentType];
  const hasActions = onEdit || onDelete || onDuplicate;

  // Operator rank integration
  const rankState = useOperatorRank();
  const history = useEquipmentHistory();
  const { qsoCountById } = useStationQsoIndex();
  const verdictResults = useVerdictStore((state) => state.results);
  const qsoCount = instanceId ? (qsoCountById[instanceId] ?? 0) : 0;
  const historyLines = instanceId
    ? history
        .filter((entry) => entry.equipmentId === instanceId)
        .slice(-5)
        .reverse()
        .map((entry) => `${entry.action} · ${entry.equipmentName}`)
    : [];
  const wearTier =
    qsoCount > 1000 ? "veteran" : qsoCount > 100 ? "seasoned" : "new";
  const assets = useRankAssets(rankState.rank);
  const effects = useVisualEffects();
  const rankBorderStyle = getRankBorderStyle(rankState.rank, accentHex, effects);
  const sheenOpacity = getSheenOpacity(rankState.rank);
  const sheenGradient = getSheenGradient(rankState.rank, accentHex);
  const rankClasses = getRankCardClasses(rankState.rank, effects);

  // Resolve the large centered symbol
  const SymbolComponent = getEquipmentSymbol(equipmentType);

  // Backward compat: convert bandPills to capabilities if capabilities not provided
  const effectiveCapabilities =
    capabilities ??
    bandPills?.map((b) => ({ label: b, category: "band" as const }));

  // Truncate stats to 3
  const displayStats = stats?.slice(0, 3);

  // Resolved type label
  const resolvedTypeLabel = typeLabel || equipmentType.toUpperCase();

  return (
    <MouseTilt
      enabled={rankState.hasMouseTilt && rankState.preferences.enableMouseTilt}
    >
      <div
        role="article"
        aria-label={title}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.target !== e.currentTarget) return;
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
          // Layout
          "equipment-card group relative flex flex-col w-full min-w-0",
          // 3D flip
          "bg-[#0f1420] rounded-xl overflow-hidden",
          // Border (dynamic color set via style)
          "border-2",
          // Cursor
          onClick ? "cursor-pointer" : "",
          // Transitions
          "transition-all duration-200",
          // Hover lift + glow
          isHovered ? `${effects.motion ? "-translate-y-0.5" : ""} ${effects.glow ? glowClass : ""}` : "",
          // Press feedback
          effects.motion ? "active:scale-95" : "",
          // Active card ring + glow
          isActive
            ? "ring-1 ring-signal-green/20 shadow-[0_0_20px_rgba(34,197,94,0.15)]"
            : "",
          // Operator rank classes
          rankClasses,
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          ...rankBorderStyle,
          backgroundImage: `linear-gradient(160deg, rgba(255,255,255,0.02) 0%, transparent 40%, rgba(0,0,0,0.15) 100%)`,
        }}
      >
        {/* ── Top Accent Bar ── */}
        <div
          className={`relative z-[2] h-1 w-full ${ACCENT_BG[equipmentType]}`}
        />

        {/* ── Energy / Chromatic Border Overlays ── */}
        {rankState.hasEnergyBorders && !rankState.hasChromaticEffects && (
          <EnergyBorderOverlay enabled={true} accentHex={accentHex} />
        )}
        {rankState.hasChromaticEffects && (
          <ChromaticBorderOverlay enabled={true} />
        )}

        {/* ── Wear / patina from on-air use (QSO count, not rank) ── */}
        {wearTier !== "new" && (
          <div
            className="absolute top-0 right-0 w-16 h-16 pointer-events-none z-[1]"
            style={{
              background:
                wearTier === "veteran"
                  ? "radial-gradient(circle at 100% 0%, rgba(212,175,55,0.35), transparent 70%)"
                  : "radial-gradient(circle at 100% 0%, rgba(160,140,100,0.28), transparent 70%)",
              maskImage:
                "repeating-linear-gradient(135deg, black 0 2px, transparent 2px 5px)",
            }}
            aria-hidden
          />
        )}
        <div
          className="absolute inset-0 pointer-events-none z-[1] transition-opacity duration-500"
          style={{
            backgroundImage: sheenGradient,
            backgroundSize: "200% 100%",
            animation:
              isHovered &&
              effects.motion
                ? "cardSheen 1.5s ease-in-out"
                : "none",
            opacity: isHovered && effects.motion && effects.glow ? sheenOpacity : 0,
          }}
        />

        {/* ── Header Zone ── */}
        <div className="equipment-card-heading relative z-[2] px-4 pt-3 pb-2 min-w-0">
          {/* Type label + tier */}
          <div className="flex items-center gap-1">
            <span
              className={`equipment-card-type text-[10px] uppercase tracking-widest font-semibold ${ACCENT_TEXT[equipmentType]}`}
            >
              {resolvedTypeLabel}
            </span>
            {tier && (
              <span
                className={`equipment-card-type text-[10px] uppercase tracking-widest font-semibold ${ACCENT_TEXT[equipmentType]} opacity-60`}
              >
                {" "}
                &middot; {TIER_LABELS[tier]}
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className="text-base font-bold text-white leading-tight truncate mt-0.5">
            {title}
          </h3>

          {/* Subtitle */}
          {subtitle && (
            <p className="text-xs text-gray-400 truncate leading-tight mt-0.5">
              {subtitle}
            </p>
          )}

          {/* Action buttons — hover only */}
          <div
            className={[
              "equipment-card-actions absolute top-2 right-2 flex items-center gap-1",
              hasActions
                ? "opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                : "",
            ].join(" ")}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFlipped((value) => !value);
              }}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center opacity-100"
              aria-label={flipped ? `Show front of ${title}` : `Flip ${title}`}
              title="Flip card"
            >
              <svg
                viewBox="0 0 16 16"
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden
              >
                <path d="M2 8h12M10 4l4 4-4 4" />
              </svg>
            </button>
            {onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center"
                aria-label={`Edit ${title}`}
                title="Edit"
              >
                <EditIcon />
              </button>
            )}
            {onDuplicate && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicate();
                }}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center"
                aria-label={`${duplicateLabel} ${title}`}
                title={duplicateLabel}
              >
                <DuplicateIcon />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-alert-red transition-colors min-h-[28px] min-w-[28px] flex items-center justify-center"
                aria-label={`Delete ${title}`}
                title="Delete"
              >
                <TrashIcon />
              </button>
            )}
          </div>
        </div>

        {/* ── Symbol Art Zone (CSS 3D flip) ── */}
        <div
          className="relative z-[2] min-h-[100px] sm:min-h-[120px] py-3 sm:py-4 flex items-center justify-center overflow-hidden mx-3"
          style={{ perspective: 1000 }}
        >
          <div
            className="w-full h-full flex items-center justify-center"
            style={{
              transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
              transformStyle: "preserve-3d",
              transition: window.matchMedia("(prefers-reduced-motion: reduce)")
                .matches
                ? "none"
                : "transform 500ms ease",
            }}
          >
            <div
              className="w-full"
              style={{
                transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
                backfaceVisibility: "hidden",
              }}
            >
              {flipped ? (
                <div className="px-2 py-1 w-full space-y-1.5">
                  {displayStats?.map((stat) => (
                    <div
                      key={stat.label}
                      className="flex items-center justify-between text-[11px] text-gray-300"
                    >
                      <span className="text-gray-500">{stat.label}</span>
                      <span className="font-mono">{stat.value}</span>
                    </div>
                  ))}
                  {qsoCount > 0 && (
                    <p className="text-[11px] font-mono text-plasma-orange">
                      {qsoCount} QSO{qsoCount === 1 ? "" : "s"} on this piece
                    </p>
                  )}
                  {historyLines.length > 0 && (
                    <ul className="space-y-0.5">
                      {historyLines.map((line) => (
                        <li
                          key={line}
                          className="text-[10px] text-gray-500 truncate"
                        >
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}
                  {(!displayStats || displayStats.length === 0) &&
                    historyLines.length === 0 &&
                    qsoCount === 0 && (
                      <p className="text-[11px] text-gray-500">
                        No logged history yet
                      </p>
                    )}
                </div>
              ) : visualization ? (
                visualization
              ) : imageUrl ? (
                <>
                  <img
                    src={imageUrl}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={() => setPhotoFailed(true)}
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/30 pointer-events-none" />
                </>
              ) : (
                <>
                  {/* Rank tier background asset */}
                  {!visualization && !imageUrl && assets.equipmentCardBg && (
                    <img
                      src={assets.equipmentCardBg}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none"
                      aria-hidden="true"
                    />
                  )}

                  {/* Type-specific background pattern */}
                  <div
                    className={`absolute inset-0 pointer-events-none opacity-[0.05] ${ACCENT_TEXT[equipmentType]}`}
                  >
                    <ArtZonePattern type={equipmentType} />
                  </div>

                  {/* Radial glow behind symbol */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: effects.glow ? `radial-gradient(circle, ${accentHex}18 0%, transparent 65%)` : "none",
                    }}
                  />

                  {/* Symbol — responsive */}
                  <div
                    className={ACCENT_TEXT[equipmentType]}
                    style={{ filter: effects.glow ? `drop-shadow(0 0 10px ${accentHex}25)` : "none" }}
                  >
                    <SymbolComponent className="w-16 h-16 sm:w-20 sm:h-20" />
                  </div>
                </>
              )}
              {/* Photo count badge */}
              {galleryImageIds && galleryImageIds.length > 0 && (
                <div className="absolute bottom-1.5 right-1.5 z-[3] bg-black/60 backdrop-blur-sm rounded-full px-1.5 py-0.5 flex items-center gap-1">
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    className="w-2.5 h-2.5 text-white/70"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5.5 2L4 4H2.5A1 1 0 001.5 5v7a1 1 0 001 1h11a1 1 0 001-1V5a1 1 0 00-1-1H12l-1.5-2h-5z"
                    />
                    <circle cx={8} cy={8.5} r={2.5} />
                  </svg>
                  <span className="text-[10px] font-mono text-white/70">
                    {1 + galleryImageIds.length}
                  </span>
                </div>
              )}
            </div>
          </div>
          <ParticleAurora
            enabled={
              rankState.hasParticles && rankState.preferences.enableParticles
            }
            rank={rankState.rank}
            accentHex={accentHex}
          />
        </div>

        {/* ── Divider ── */}
        {displayStats && displayStats.length > 0 && (
          <div
            className="mx-4 h-px"
            style={{ backgroundColor: `${accentHex}33` }}
          />
        )}

        {/* ── Stats Zone ── */}
        {displayStats && displayStats.length > 0 && (
          <div className="relative z-[2] flex items-center justify-around px-3 sm:px-4 py-2.5 sm:py-3">
            {displayStats.map((stat, i) => (
              <div
                key={`${stat.icon}-${stat.label}-${i}`}
                className="flex flex-col items-center gap-0.5 min-w-0 px-0.5"
              >
                <span className="text-gray-500">
                  <StatIconSvg icon={stat.icon} />
                </span>
                <span className="text-xs sm:text-sm font-mono font-bold text-gray-100">
                  <StatCountUp
                    value={stat.value}
                    enabled={rankState.hasStatCountUp}
                  />
                </span>
                <span className="text-[9px] sm:text-[10px] text-gray-500 truncate max-w-[60px] text-center">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Capabilities Row ── */}
        {effectiveCapabilities && effectiveCapabilities.length > 0 && (
          <div className="relative z-[2] px-4 pb-2 flex flex-wrap gap-1">
            {effectiveCapabilities.map((cap, i) => {
              let pillStyle: string;
              if (cap.category === "band") {
                pillStyle = BAND_PILL_COLORS[cap.label] ?? DEFAULT_BAND_PILL;
              } else {
                pillStyle = CAPABILITY_STYLES[cap.category];
              }
              const liveDot =
                (equipmentType === "radio" || equipmentType === "antenna") &&
                cap.category === "band"
                  ? Object.values(verdictResults).find(
                      (result) => result.band === cap.label,
                    )?.evaluation.state
                  : undefined;
              const dotClass =
                liveDot === "hot" || liveDot === "verified"
                  ? "bg-signal-green"
                  : liveDot === "stirring" || liveDot === "forecast"
                    ? "bg-caution-amber"
                    : liveDot === "closed"
                      ? "bg-alert-red"
                      : null;
              return (
                <span
                  key={`${cap.category}-${cap.label}-${i}`}
                  className={`equipment-card-capability inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono font-medium rounded border ${pillStyle}`}
                >
                  {dotClass && (
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${dotClass}`}
                      aria-hidden
                    />
                  )}
                  {cap.label}
                </span>
              );
            })}
          </div>
        )}

        {/* ── Footer Zone ── */}
        <div className="relative z-[2] px-4 pb-3 flex items-end justify-between min-h-[28px]">
          {/* Left: badges */}
          <div className="flex flex-wrap gap-1 min-w-0 flex-1">
            {badges?.map((badge, i) => (
              <span
                key={`${badge.label}-${i}`}
                className={`equipment-card-badge px-1.5 py-0.5 text-[10px] font-medium rounded ${BADGE_STYLES[badge.color ?? "gray"]}`}
              >
                {badge.label}
              </span>
            ))}
          </div>

          {/* Right: toggle + expand hint */}
          <div className="flex items-end gap-2 flex-shrink-0">
            {/* Active Toggle (radios only) */}
            {equipmentType === "radio" && onToggleActive && (
              <div className="flex flex-col items-center gap-0.5">
                <button
                  type="button"
                  role="switch"
                  aria-checked={isActive}
                  aria-label="Toggle active radio"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleActive();
                  }}
                  className={[
                    "relative w-9 h-5 rounded-full transition-colors",
                    isActive ? "bg-signal-green" : "bg-gray-700",
                    isActive ? "shadow-[0_0_10px_rgba(34,197,94,0.4)]" : "",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                      isActive ? "translate-x-4" : "translate-x-0",
                    ].join(" ")}
                  />
                </button>
                <span
                  className={[
                    "text-[10px] font-semibold uppercase tracking-wider",
                    isActive ? "text-signal-green" : "text-gray-500",
                  ].join(" ")}
                >
                  {isActive ? "Active" : "Standby"}
                </span>
              </div>
            )}

            {/* Expand hint */}
            {onClick && (
              <span className="text-gray-500 opacity-0 group-hover:opacity-30 transition-opacity mb-1">
                <ExpandHintIcon />
              </span>
            )}
          </div>
        </div>

        {/* ── Card Signature ── */}
        <CardSignature
          signature={rankState.cardSignature}
          enabled={rankState.hasCardSignature}
        />
      </div>
    </MouseTilt>
  );
}

export default EquipmentCard;
