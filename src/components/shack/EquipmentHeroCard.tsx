/**
 * EquipmentHeroCard — XL-size immersive collectible-card modal.
 *
 * Portal-based centered modal that renders equipment as a breathtaking
 * full-art collectible card. Think MTG mythic rare / Pokemon full-art —
 * premium double-border frame, animated art zone with pulsing radial glow,
 * giant schematic symbol, grouped spec sections, and capability pills.
 *
 * Replaces EquipmentDetailModal with a far more immersive experience.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { getEquipmentSymbol } from "./EquipmentSymbols";
import { StatIconSvg, ArtZonePattern } from "./EquipmentCard";
import { useImageUrl } from "@/hooks/useImageUrl";
import { ImageUploadButton } from "@/components/ui/ImageUploadButton";
import { useOperatorRank } from "@/hooks/useOperatorRank";
import { getRankBorderStyle } from "@/components/rank/RankBorderStyles";
import { ParticleAurora } from "@/components/rank/ParticleAurora";
import { StatCountUp } from "@/components/rank/StatCountUp";
import { RankBadge } from "@/components/rank/RankBadge";
import {
  EnergyBorderOverlay,
  FiligreeCorners,
  CardSignature,
} from "@/components/rank/LegendaryEffects";
import {
  ChromaticBorderOverlay,
  RuneCorners,
  DimensionalRift,
} from "@/components/rank/EtherealEffects";

import {
  type EquipmentType,
  type EquipmentCardStat,
  type EquipmentCardCapability,
  type EquipmentDetailField,
  type EquipmentDetailGroup,
  type EquipmentHexBadge,
  type CapabilityCategory,
  ACCENT_HEX,
  ACCENT_TEXT,
  TIER_LABELS,
  BAND_PILL_COLORS,
  DEFAULT_BAND_PILL,
  CAPABILITY_STYLES,
  formatFieldValue,
  isNumericValue,
} from "./equipmentCardTypes";

// ─── Props ──────────────────────────────────────────────────────────────────

export interface EquipmentHeroCardProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  equipmentType?: EquipmentType;
  typeLabel?: string;
  tier?: "entry" | "midrange" | "highend" | "flagship";
  // Data
  stats?: EquipmentCardStat[];
  capabilities?: EquipmentCardCapability[];
  groups?: EquipmentDetailGroup[];
  fields?: EquipmentDetailField[];
  badges?: EquipmentHexBadge[];
  visualization?: ReactNode;
  /** UUID referencing a stored image in IndexedDB */
  imageId?: string;
  /** Called when user uploads/removes a photo via the hero card */
  onImageChange?: (imageId: string | undefined) => void;
  /** Gallery image IDs (additional photos beyond the hero image) */
  galleryImageIds?: string[];
  /** Called when user adds a gallery photo */
  onGalleryAdd?: (imageId: string) => void;
  /** Called when user removes a gallery photo */
  onGalleryRemove?: (imageId: string) => void;
  /** Maximum number of gallery images (default 5) */
  maxGalleryImages?: number;
  // Actions
  onEdit?: () => void;
  onDelete?: () => void;
  onSetActive?: () => void;
  isActive?: boolean;
}

// ─── CSS Keyframes (injected once) ──────────────────────────────────────────

const HERO_STYLE_ID = "equipment-hero-card-styles";

const HERO_KEYFRAMES = `
@keyframes heroEntrance {
  from { opacity: 0; transform: scale(0.92); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes heroDrift {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(15px); }
}
@keyframes heroPulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.15); }
}
@keyframes heroBackdropIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes heroShimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .hero-drift, .hero-pulse { animation: none !important; }
  .hero-entrance { animation-duration: 0.01ms !important; }
  .hero-backdrop-in { animation-duration: 0.01ms !important; }
  .hero-shimmer { animation: none !important; }
}
`;

function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(HERO_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = HERO_STYLE_ID;
  style.textContent = HERO_KEYFRAMES;
  document.head.appendChild(style);
}

// ─── Sub-components ─────────────────────────────────────────────────────────

/** Single spec field cell — label on top, value below */
function HeroFieldCell({
  field,
  accentHex,
}: {
  field: EquipmentDetailField;
  accentHex: string;
}) {
  const numeric = isNumericValue(field.value);
  const formatted = formatFieldValue(field.value, field.unit);

  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
        {field.label}
      </dt>
      <dd
        className={`mt-0.5 text-sm truncate ${
          numeric ? "font-mono font-bold text-white" : "font-mono text-gray-200"
        }`}
        style={numeric ? { color: `${accentHex}dd` } : undefined}
      >
        {formatted}
      </dd>
    </div>
  );
}

/** Grouped section with accent left border heading */
function HeroGroupSection({
  group,
  accentHex,
}: {
  group: EquipmentDetailGroup;
  accentHex: string;
}) {
  // Responsive: 2-col on mobile, 3-col on sm+ for large groups
  const cols =
    group.fields.length >= 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2";

  return (
    <div className="px-4 sm:px-5 py-3">
      <h3
        className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 pb-2 mb-2.5 flex items-center gap-2"
        style={{ color: `${accentHex}cc` }}
      >
        <span
          className="w-[3px] h-3.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: accentHex }}
        />
        {group.heading}
      </h3>
      <dl className={`grid ${cols} gap-x-4 sm:gap-x-6 gap-y-2.5`}>
        {group.fields.map((field) => (
          <HeroFieldCell
            key={field.label}
            field={field}
            accentHex={accentHex}
          />
        ))}
      </dl>
    </div>
  );
}

/** Close (X) icon */
function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="w-5 h-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

/** Small X icon for gallery thumbnails */
function SmallXIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="w-3 h-3"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2 10L10 2M2 2l8 8"
      />
    </svg>
  );
}

/** Single gallery thumbnail with active indicator and remove button */
function GalleryThumbnail({
  imageId,
  isActive,
  onClick,
  onRemove,
}: {
  imageId: string;
  isActive: boolean;
  onClick: () => void;
  onRemove?: () => void;
}) {
  const { url } = useImageUrl(imageId);
  if (!url) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group/thumb relative h-16 w-20 flex-shrink-0 rounded-lg overflow-hidden",
        "transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
        isActive
          ? "ring-2 ring-white/60 shadow-lg"
          : "ring-1 ring-white/10 hover:ring-white/25",
      ].join(" ")}
    >
      <img src={url} alt="" className="w-full h-full object-cover" />
      {isActive && (
        <div className="absolute inset-0 bg-white/5 pointer-events-none" />
      )}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/70 text-white/70
                     hover:text-white hover:bg-red-500/80 transition-colors
                     opacity-0 group-hover/thumb:opacity-100 focus:opacity-100
                     focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
          aria-label="Remove photo"
        >
          <SmallXIcon />
        </button>
      )}
    </button>
  );
}

/** Category label for capability groups */
const CATEGORY_LABELS: Record<CapabilityCategory, string> = {
  band: "Bands",
  mode: "Modes",
  feature: "Features",
};

// ─── Main Component ─────────────────────────────────────────────────────────

export function EquipmentHeroCard({
  open,
  onClose,
  title,
  subtitle,
  equipmentType = "radio",
  typeLabel,
  tier,
  stats,
  capabilities,
  groups,
  fields,
  badges,
  visualization,
  imageId,
  onImageChange,
  galleryImageIds,
  onGalleryAdd,
  onGalleryRemove,
  maxGalleryImages = 5,
  onEdit,
  onDelete,
  onSetActive,
  isActive,
}: EquipmentHeroCardProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [activeImageId, setActiveImageId] = useState<string | undefined>(
    undefined,
  );
  const displayImageId = activeImageId ?? imageId;
  const { url: imageUrl } = useImageUrl(displayImageId);
  const accentHex = ACCENT_HEX[equipmentType] ?? ACCENT_HEX.radio;
  const rankState = useOperatorRank();
  const rankBorderStyle = getRankBorderStyle(rankState.rank, accentHex);

  // Reset active gallery image when modal closes
  useEffect(() => {
    if (!open) {
      setActiveImageId(undefined);
    }
  }, [open]);

  const hasGallery =
    onGalleryAdd != null &&
    ((galleryImageIds && galleryImageIds.length > 0) || imageId);
  const galleryCount = galleryImageIds?.length ?? 0;
  const canAddMore = galleryCount < maxGalleryImages;

  // Resolve the equipment symbol
  const SymbolComponent = getEquipmentSymbol(equipmentType);

  // Resolved type label
  const resolvedTypeLabel = typeLabel || equipmentType.toUpperCase();

  // Group capabilities by category for the hero display
  const groupedCapabilities = useMemo(() => {
    if (!capabilities || capabilities.length === 0) return null;
    const grouped: Record<CapabilityCategory, EquipmentCardCapability[]> = {
      band: [],
      mode: [],
      feature: [],
    };
    for (const cap of capabilities) {
      grouped[cap.category].push(cap);
    }
    // Filter out empty categories
    return (
      Object.entries(grouped) as [
        CapabilityCategory,
        EquipmentCardCapability[],
      ][]
    ).filter(([, caps]) => caps.length > 0);
  }, [capabilities]);

  // ── Escape key ──
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  // ── Body scroll lock ──
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ── Auto-focus close button ──
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  // ── Inject keyframe styles ──
  useEffect(() => {
    ensureStyles();
  }, []);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const titleId = "equipment-hero-title";
  const hasActions = onEdit || onDelete || onSetActive;
  const hasGroups = groups && groups.length > 0;
  const hasFields = fields && fields.length > 0;

  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
      {/* ── Backdrop ── */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md hero-backdrop-in"
        style={{ animation: "heroBackdropIn 200ms ease-out both" }}
        onClick={onClose}
      />

      {/* ── Hero Card ── */}
      <div
        className="hero-entrance relative z-10 w-full max-w-xl max-h-[85vh] flex flex-col"
        style={{
          animation:
            "heroEntrance 300ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {/* ══ Top Accent Bar (6px) ══ */}
        <div
          className="h-1.5 w-full rounded-t-2xl flex-shrink-0 hero-shimmer"
          style={{
            backgroundColor: accentHex,
            backgroundImage: rankState.hasChromaticEffects
              ? `linear-gradient(90deg, #38BDF8, #A78BFA, #F472B6, #34D399, #38BDF8)`
              : `linear-gradient(90deg, transparent 0%, ${accentHex}80 25%, white 50%, ${accentHex}80 75%, transparent 100%)`,
            backgroundSize: "200% 100%",
            animation: "heroShimmer 3s ease-in-out infinite",
          }}
        />

        {/* ══ Card Body (scrollable) ══ */}
        <div
          className="overflow-y-auto flex-1 min-h-0 rounded-b-2xl"
          style={{
            backgroundColor: "#0a0e18",
            ...(rankBorderStyle.border
              ? {
                  ...rankBorderStyle,
                  border: undefined,
                  borderLeft: rankBorderStyle.border,
                  borderRight: rankBorderStyle.border,
                  borderBottom: rankBorderStyle.border,
                }
              : rankBorderStyle),
            backgroundImage: `linear-gradient(160deg, rgba(255,255,255,0.03) 0%, transparent 30%, rgba(0,0,0,0.2) 100%)`,
          }}
        >
          {/* ── Hero Art Zone ── */}
          <div
            className="relative overflow-hidden"
            style={{
              minHeight: 160,
              background: `linear-gradient(180deg, ${accentHex}0D 0%, transparent 60%, ${accentHex}05 100%)`,
            }}
          >
            {/* Close button — top-right */}
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute top-3 right-3 z-20 p-1.5 rounded-lg text-gray-500 hover:text-white
                         hover:bg-white/10 transition-colors focus:outline-none
                         focus-visible:ring-2 focus-visible:ring-white/30"
            >
              <CloseIcon />
            </button>

            {/* Corner decorations */}
            {rankState.hasChromaticEffects ? (
              <RuneCorners enabled={true} />
            ) : rankState.hasFiligreeCorners ? (
              <FiligreeCorners enabled={true} accentHex={accentHex} />
            ) : (
              <>
                <svg
                  className="absolute top-2 left-2 w-5 h-5 pointer-events-none"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke={`${accentHex}40`}
                  strokeWidth={1.5}
                  aria-hidden="true"
                >
                  <path d="M1 8V2a1 1 0 011-1h6" />
                </svg>
                <svg
                  className="absolute top-2 right-10 w-5 h-5 pointer-events-none"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke={`${accentHex}40`}
                  strokeWidth={1.5}
                  aria-hidden="true"
                >
                  <path d="M19 8V2a1 1 0 00-1-1h-6" />
                </svg>
              </>
            )}

            {visualization ? (
              <div className="flex items-center justify-center py-6 sm:py-8 px-6 min-h-[160px] sm:min-h-[200px]">
                {visualization}
              </div>
            ) : imageUrl ? (
              <>
                <img
                  src={imageUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/40 pointer-events-none" />
                {/* Spacer to maintain art zone height */}
                <div className="py-6 sm:py-8 min-h-[160px] sm:min-h-[200px]" />
              </>
            ) : (
              <>
                {/* Animated background pattern */}
                <div
                  className={`absolute inset-0 pointer-events-none opacity-[0.04] ${ACCENT_TEXT[equipmentType]} hero-drift`}
                  style={{ animation: "heroDrift 20s ease-in-out infinite" }}
                >
                  <ArtZonePattern type={equipmentType} />
                </div>

                {/* Secondary pattern layer (offset, slower) */}
                <div
                  className={`absolute inset-0 pointer-events-none opacity-[0.02] ${ACCENT_TEXT[equipmentType]} hero-drift`}
                  style={{
                    animation: "heroDrift 28s ease-in-out infinite reverse",
                    transform: "scale(1.15) rotate(5deg)",
                  }}
                >
                  <ArtZonePattern type={equipmentType} />
                </div>

                {/* Pulsing radial glow */}
                <div
                  className="absolute inset-0 pointer-events-none hero-pulse"
                  style={{
                    background: `radial-gradient(circle at 50% 55%, ${accentHex}25 0%, ${accentHex}08 40%, transparent 70%)`,
                    animation: "heroPulse 4s ease-in-out infinite",
                  }}
                />

                {/* Outer glow ring */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `radial-gradient(circle at 50% 55%, transparent 30%, ${accentHex}06 60%, transparent 80%)`,
                  }}
                />

                {/* Giant equipment symbol — responsive sizing */}
                <div className="relative flex items-center justify-center py-6 sm:py-8 z-10">
                  <div
                    className={ACCENT_TEXT[equipmentType]}
                    style={{
                      filter: `drop-shadow(0 0 20px ${accentHex}40)`,
                    }}
                  >
                    <SymbolComponent className="w-24 h-24 sm:w-[140px] sm:h-[140px]" />
                  </div>
                </div>
              </>
            )}

            {/* Image upload button overlay */}
            {onImageChange && (
              <div className="absolute bottom-3 right-3 z-10">
                <ImageUploadButton
                  imageId={imageId}
                  onImageChange={onImageChange}
                  aspect={4 / 3}
                  cropShape="rect"
                  maxOutputWidth={1200}
                  maxOutputHeight={900}
                  quality={0.8}
                  compact
                />
              </div>
            )}

            {/* Rank particle effects */}
            <ParticleAurora
              enabled={
                rankState.hasParticles && rankState.preferences.enableParticles
              }
              rank={rankState.rank}
              accentHex={accentHex}
            />
            {rankState.hasChromaticEffects && (
              <DimensionalRift enabled={true} accentHex={accentHex} />
            )}

            {/* Rank border overlays */}
            {rankState.hasEnergyBorders && !rankState.hasChromaticEffects && (
              <EnergyBorderOverlay enabled={true} accentHex={accentHex} />
            )}
            {rankState.hasChromaticEffects && (
              <ChromaticBorderOverlay enabled={true} />
            )}
          </div>

          {/* ── Gallery Strip ── */}
          {hasGallery && galleryCount > 0 && (
            <div className="px-4 py-2 flex items-center gap-2 overflow-x-auto bg-white/[0.02]">
              {/* Hero image as first thumbnail */}
              {imageId && (
                <GalleryThumbnail
                  imageId={imageId}
                  isActive={activeImageId === undefined}
                  onClick={() => setActiveImageId(undefined)}
                />
              )}
              {/* Gallery thumbnails */}
              {galleryImageIds?.map((gid) => (
                <GalleryThumbnail
                  key={gid}
                  imageId={gid}
                  isActive={activeImageId === gid}
                  onClick={() => setActiveImageId(gid)}
                  onRemove={
                    onGalleryRemove
                      ? () => {
                          // If removing the active image, reset to hero
                          if (activeImageId === gid) {
                            setActiveImageId(undefined);
                          }
                          onGalleryRemove(gid);
                        }
                      : undefined
                  }
                />
              ))}
              {/* Add button */}
              {canAddMore && onGalleryAdd && (
                <div className="flex-shrink-0">
                  <ImageUploadButton
                    onImageChange={(newId) => {
                      if (newId) onGalleryAdd(newId);
                    }}
                    aspect={4 / 3}
                    cropShape="rect"
                    maxOutputWidth={1200}
                    maxOutputHeight={900}
                    quality={0.8}
                    compact
                    label="Add"
                    className="h-16 w-16 rounded-lg border border-dashed border-white/15
                               bg-white/[0.03] hover:bg-white/[0.06] transition-colors
                               flex items-center justify-center text-gray-500 hover:text-gray-300"
                  />
                </div>
              )}
            </div>
          )}
          {/* Gallery strip — show add button when no gallery images yet but gallery is supported */}
          {hasGallery && galleryCount === 0 && canAddMore && onGalleryAdd && (
            <div className="px-4 py-2 flex items-center gap-2 bg-white/[0.02]">
              <div className="flex-shrink-0">
                <ImageUploadButton
                  onImageChange={(newId) => {
                    if (newId) onGalleryAdd(newId);
                  }}
                  aspect={4 / 3}
                  cropShape="rect"
                  maxOutputWidth={1200}
                  maxOutputHeight={900}
                  quality={0.8}
                  compact
                  label="Add"
                  className="h-12 px-3 rounded-lg border border-dashed border-white/15
                             bg-white/[0.03] hover:bg-white/[0.06] transition-colors
                             flex items-center gap-2 text-gray-500 hover:text-gray-300 text-xs"
                />
              </div>
              <span className="text-[11px] text-gray-500">
                Add more photos ({maxGalleryImages} max)
              </span>
            </div>
          )}

          {/* ── Decorative gradient divider ── */}
          <div
            className="h-px mx-5"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${accentHex}60 30%, ${accentHex} 50%, ${accentHex}60 70%, transparent 100%)`,
            }}
          />

          {/* ── Title Area ── */}
          <div className="px-5 pt-4 pb-3">
            {/* Type label + tier */}
            <div className="flex items-center gap-1.5">
              <span
                className="text-[11px] uppercase tracking-[0.15em] font-semibold"
                style={{ color: accentHex }}
              >
                {resolvedTypeLabel}
              </span>
              {tier && (
                <>
                  <span
                    className="text-[11px] uppercase tracking-wider font-semibold opacity-50"
                    style={{ color: accentHex }}
                  >
                    &middot;
                  </span>
                  <span
                    className="text-[11px] uppercase tracking-[0.15em] font-semibold opacity-60"
                    style={{ color: accentHex }}
                  >
                    {TIER_LABELS[tier]}
                  </span>
                </>
              )}
            </div>

            {/* Title — display font, responsive */}
            <h2
              id={titleId}
              className="text-xl sm:text-2xl font-display font-bold text-white leading-tight mt-1"
            >
              {title}
            </h2>

            {/* Subtitle */}
            {subtitle && (
              <p className="text-sm text-gray-400 leading-snug mt-1">
                {subtitle}
              </p>
            )}

            {/* Rank badge */}
            <div className="mt-2">
              <RankBadge rank={rankState.rank} size="md" />
            </div>

            {/* Badges */}
            {badges && badges.length > 0 && (
              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                {badges.map((badge) => (
                  <span
                    key={badge.label}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px]
                               font-semibold uppercase tracking-wider"
                    style={{
                      backgroundColor: `${badge.color ?? accentHex}18`,
                      color: badge.color ?? accentHex,
                      border: `1px solid ${badge.color ?? accentHex}30`,
                    }}
                  >
                    {badge.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ── Hero Stats Bar ── */}
          {stats && stats.length > 0 && (
            <div
              className="mx-5 mb-4 rounded-xl px-4 py-3.5"
              style={{
                backgroundColor: "rgba(255,255,255,0.03)",
                border: `1px solid ${accentHex}15`,
              }}
            >
              <div className="flex flex-wrap items-start justify-around gap-y-3">
                {stats.map((stat) => (
                  <div
                    key={`${stat.icon}-${stat.label}`}
                    className="flex flex-col items-center gap-1 min-w-0 px-2 sm:px-1"
                  >
                    {/* Enlarged icon via wrapper override */}
                    <span
                      className="[&_svg]:w-4 [&_svg]:h-4 sm:[&_svg]:w-5 sm:[&_svg]:h-5"
                      style={{ color: `${accentHex}aa` }}
                    >
                      <StatIconSvg icon={stat.icon} />
                    </span>
                    <span
                      className="text-base sm:text-lg font-mono font-bold text-white leading-none"
                      style={{
                        textShadow: `0 0 12px ${accentHex}30`,
                      }}
                    >
                      <StatCountUp
                        value={stat.value}
                        enabled={rankState.hasStatCountUp}
                        duration={600}
                      />
                    </span>
                    <span className="text-[9px] sm:text-[10px] text-gray-500 uppercase tracking-wider">
                      {stat.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Grouped Spec Sections ── */}
          {hasGroups && (
            <div>
              {groups!.map((group, idx) => (
                <div key={group.heading}>
                  {idx > 0 && (
                    <div
                      className="mx-5 h-px"
                      style={{ backgroundColor: `${accentHex}10` }}
                    />
                  )}
                  <HeroGroupSection group={group} accentHex={accentHex} />
                </div>
              ))}
            </div>
          )}

          {/* ── Flat Fields Fallback ── */}
          {!hasGroups && hasFields && (
            <div className="px-5 py-3">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                {fields!.map((field) => (
                  <HeroFieldCell
                    key={field.label}
                    field={field}
                    accentHex={accentHex}
                  />
                ))}
              </dl>
            </div>
          )}

          {/* ── Capabilities (grouped by category) ── */}
          {groupedCapabilities && groupedCapabilities.length > 0 && (
            <div className="px-5 pb-3 pt-1">
              {/* Divider before capabilities */}
              <div
                className="h-px mb-3"
                style={{ backgroundColor: `${accentHex}10` }}
              />

              {groupedCapabilities.map(([category, caps]) => (
                <div key={category} className="mb-3 last:mb-0">
                  {/* Category label */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="w-[3px] h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: `${accentHex}80` }}
                    />
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: `${accentHex}99` }}
                    >
                      {CATEGORY_LABELS[category]}
                    </span>
                  </div>

                  {/* Pills */}
                  <div className="flex flex-wrap gap-1.5 pl-3">
                    {caps.map((cap) => {
                      let pillStyle: string;
                      if (cap.category === "band") {
                        pillStyle =
                          BAND_PILL_COLORS[cap.label] ?? DEFAULT_BAND_PILL;
                      } else {
                        pillStyle = CAPABILITY_STYLES[cap.category];
                      }
                      return (
                        <span
                          key={`${cap.category}-${cap.label}`}
                          className={`px-2 py-0.5 text-[11px] font-mono font-medium rounded border ${pillStyle}`}
                        >
                          {cap.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Card Signature ── */}
          <CardSignature
            signature={rankState.cardSignature}
            enabled={rankState.hasCardSignature}
            className="px-5 pb-2"
          />

          {/* ── Action Buttons ── */}
          {hasActions && (
            <>
              <div
                className="mx-5 h-px mt-1"
                style={{ backgroundColor: `${accentHex}15` }}
              />
              <div className="flex gap-3 px-5 pb-5 pt-3">
                {onEdit && (
                  <button
                    type="button"
                    onClick={onEdit}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium text-center
                               transition-colors min-h-[44px]
                               bg-blue-500/10 text-blue-400 border border-blue-500/20
                               hover:bg-blue-500/20 focus:outline-none
                               focus-visible:ring-2 focus-visible:ring-blue-500/50"
                  >
                    Edit
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={onDelete}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium text-center
                               transition-colors min-h-[44px]
                               bg-red-500/10 text-red-400 border border-red-500/20
                               hover:bg-red-500/20 focus:outline-none
                               focus-visible:ring-2 focus-visible:ring-red-500/50"
                  >
                    Delete
                  </button>
                )}
                {onSetActive && (
                  <button
                    type="button"
                    onClick={onSetActive}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium text-center
                               transition-all duration-200 min-h-[44px]
                               focus:outline-none focus-visible:ring-2
                               ${
                                 isActive
                                   ? "bg-signal-green/20 border border-signal-green/40 text-signal-green focus-visible:ring-signal-green/50 shadow-[0_0_12px_rgba(34,197,94,0.15)]"
                                   : "bg-white/[0.04] border border-white/10 text-gray-400 hover:bg-white/[0.07] hover:text-gray-300 hover:border-white/15 focus-visible:ring-white/30"
                               }`}
                  >
                    {isActive ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-signal-green animate-pulse" />
                        Active
                      </span>
                    ) : (
                      "Set Active"
                    )}
                  </button>
                )}
              </div>
            </>
          )}

          {/* Bottom spacing when no actions */}
          {!hasActions && <div className="pb-5" />}
        </div>

        {/* ══ Bottom Accent Bar (6px) ══ */}
        <div
          className="h-1.5 w-full rounded-b-2xl flex-shrink-0 hero-shimmer"
          style={{
            backgroundColor: accentHex,
            backgroundImage: rankState.hasChromaticEffects
              ? `linear-gradient(90deg, #38BDF8, #A78BFA, #F472B6, #34D399, #38BDF8)`
              : `linear-gradient(90deg, transparent 0%, ${accentHex}80 25%, white 50%, ${accentHex}80 75%, transparent 100%)`,
            backgroundSize: "200% 100%",
            animation: "heroShimmer 3s ease-in-out infinite 1.5s",
          }}
        />
      </div>
    </div>,
    document.body,
  );
}

export default EquipmentHeroCard;
