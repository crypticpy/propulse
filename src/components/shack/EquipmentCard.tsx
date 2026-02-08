/**
 * EquipmentCard — Collectible trading-card style equipment display.
 *
 * Renders ham radio equipment (radios, antennas, feedlines, accessories,
 * inline components) as premium sci-fi cards with type-colored accents,
 * corner targeting brackets, stat grids, and band pills.
 *
 * Design language: MTG/Pokemon card aesthetic — color-coded by equipment
 * type, with electrical schematic symbols and a dark space theme.
 */

import { useState, type ReactNode } from "react";
import { getEquipmentSymbol } from "./EquipmentSymbols";

// ─── Types ───────────────────────────────────────────────────────────────────

export type EquipmentType =
  | "radio"
  | "antenna"
  | "feedline"
  | "accessory"
  | "inline";

export type EquipmentTier = "entry" | "midrange" | "highend" | "flagship";

export type StatIcon =
  | "power"
  | "frequency"
  | "gain"
  | "loss"
  | "score"
  | "length"
  | "impedance"
  | "connector"
  | "bands";

export type BadgeColor = "orange" | "green" | "amber" | "red" | "blue" | "gray";

export interface EquipmentCardBadge {
  label: string;
  color?: BadgeColor;
}

export interface EquipmentCardStat {
  icon: StatIcon;
  label: string;
  value: string;
}

export interface EquipmentCardProps {
  title: string;
  subtitle?: string;
  equipmentType: EquipmentType;
  tier?: EquipmentTier;
  badges?: EquipmentCardBadge[];
  stats?: EquipmentCardStat[];
  bandPills?: string[];
  isActive?: boolean;
  onToggleActive?: () => void;
  visualization?: ReactNode;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Left accent bar & corner bracket colors per equipment type */
const ACCENT_COLORS: Record<EquipmentType, string> = {
  radio: "#F97316",
  antenna: "#22C55E",
  feedline: "#14B8A6",
  accessory: "#F59E0B",
  inline: "#6B7280",
};

/** Tailwind classes for the hover glow shadow per type */
const GLOW_SHADOW: Record<EquipmentType, string> = {
  radio: "shadow-[0_4px_24px_rgba(249,115,22,0.20)]",
  antenna: "shadow-[0_4px_24px_rgba(34,197,94,0.20)]",
  feedline: "shadow-[0_4px_24px_rgba(20,184,166,0.20)]",
  accessory: "shadow-[0_4px_24px_rgba(245,158,11,0.20)]",
  inline: "shadow-[0_4px_24px_rgba(107,114,128,0.20)]",
};

/** Tier badge styling */
const TIER_STYLES: Record<EquipmentTier, string> = {
  entry: "bg-gray-700 text-gray-300",
  midrange: "bg-signal-green/15 text-signal-green",
  highend: "bg-nebula-blue text-blue-400",
  flagship: "bg-plasma-orange/15 text-plasma-orange",
};

const TIER_LABELS: Record<EquipmentTier, string> = {
  entry: "Entry",
  midrange: "Mid",
  highend: "High",
  flagship: "Flag",
};

/** Badge color → Tailwind classes */
const BADGE_STYLES: Record<BadgeColor, string> = {
  orange: "bg-plasma-orange/15 text-plasma-orange",
  green: "bg-signal-green/15 text-signal-green",
  amber: "bg-caution-amber/15 text-caution-amber",
  red: "bg-alert-red/15 text-alert-red",
  blue: "bg-blue-500/15 text-blue-400",
  gray: "bg-gray-700 text-gray-300",
};

/** Band pill colors — HF warm, VHF/UHF cool */
const BAND_PILL_COLORS: Record<string, string> = {
  "160m": "bg-red-900/40 text-red-300 border-red-700/40",
  "80m": "bg-orange-900/40 text-orange-300 border-orange-700/40",
  "60m": "bg-amber-900/40 text-amber-300 border-amber-700/40",
  "40m": "bg-yellow-900/40 text-yellow-300 border-yellow-700/40",
  "30m": "bg-lime-900/40 text-lime-300 border-lime-700/40",
  "20m": "bg-green-900/40 text-green-300 border-green-700/40",
  "17m": "bg-emerald-900/40 text-emerald-300 border-emerald-700/40",
  "15m": "bg-teal-900/40 text-teal-300 border-teal-700/40",
  "12m": "bg-cyan-900/40 text-cyan-300 border-cyan-700/40",
  "10m": "bg-sky-900/40 text-sky-300 border-sky-700/40",
  "6m": "bg-blue-900/40 text-blue-300 border-blue-700/40",
  "2m": "bg-indigo-900/40 text-indigo-300 border-indigo-700/40",
  "70cm": "bg-violet-900/40 text-violet-300 border-violet-700/40",
  "23cm": "bg-purple-900/40 text-purple-300 border-purple-700/40",
};

const DEFAULT_BAND_PILL = "bg-gray-800/50 text-gray-400 border-gray-600/40";

// ─── Stat Icon SVGs (16x16, stroke-based, currentColor) ─────────────────────

function StatIconSvg({ icon }: { icon: StatIcon }) {
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
      // Lightning bolt
      return (
        <svg {...svgProps}>
          <path d="M9 1.5L4 9h4l-1 5.5L12 7H8l1-5.5z" />
        </svg>
      );
    case "frequency":
    case "bands":
      // Sine wave
      return (
        <svg {...svgProps}>
          <path d="M1 8c1.5-4 3-4 4.5 0s3 4 4.5 0 3-4 4.5 0" />
        </svg>
      );
    case "gain":
      // Upward arrow with signal lines
      return (
        <svg {...svgProps}>
          <path d="M8 13V3m0 0l-3 3m3-3l3 3" />
          <path d="M3 7l1-1m8 1l-1-1" strokeWidth={1} opacity={0.5} />
        </svg>
      );
    case "loss":
      // Downward arrow
      return (
        <svg {...svgProps}>
          <path d="M8 3v10m0 0l-3-3m3 3l3-3" />
        </svg>
      );
    case "score":
      // Crosshair / target
      return (
        <svg {...svgProps}>
          <circle cx={8} cy={8} r={5} />
          <circle cx={8} cy={8} r={2} />
          <path d="M8 1v2m0 10v2M1 8h2m10 0h2" />
        </svg>
      );
    case "length":
      // Ruler marks
      return (
        <svg {...svgProps}>
          <path d="M2 12h12" />
          <path d="M2 12V9m4 3v-2m4 3v-2m4 3V9" />
          <path d="M2 4h12" strokeWidth={1} opacity={0.4} />
        </svg>
      );
    case "impedance":
      // Omega symbol as text
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
      // Small plug icon
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

// ─── Corner Bracket SVG ──────────────────────────────────────────────────────

function CornerBracket({
  position,
  color,
}: {
  position: "tl" | "tr" | "bl" | "br";
  color: string;
}) {
  // 8x8 L-shaped bracket at each corner
  const rotation: Record<string, string> = {
    tl: "",
    tr: "scale(-1,1) translate(-8,0)",
    bl: "scale(1,-1) translate(0,-8)",
    br: "scale(-1,-1) translate(-8,-8)",
  };

  const posClass: Record<string, string> = {
    tl: "top-1 left-1",
    tr: "top-1 right-1",
    bl: "bottom-1 left-1",
    br: "bottom-1 right-1",
  };

  return (
    <svg
      width={8}
      height={8}
      viewBox="0 0 8 8"
      className={`absolute ${posClass[position]} pointer-events-none`}
      aria-hidden="true"
    >
      <g transform={rotation[position]}>
        <path
          d="M0 0v8M0 0h8"
          stroke={color}
          strokeWidth={1.5}
          fill="none"
          opacity={0.4}
        />
      </g>
    </svg>
  );
}

// ─── Type Icon (small 20x20 inline symbol for header) ────────────────────────

function TypeIcon({ type }: { type: EquipmentType }) {
  const color = ACCENT_COLORS[type];
  const svgProps = {
    width: 20,
    height: 20,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: color,
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "w-5 h-5 flex-shrink-0",
    "aria-hidden": true as const,
  };

  switch (type) {
    case "radio":
      // Transceiver knob + dial
      return (
        <svg {...svgProps}>
          <rect x={2} y={5} width={16} height={11} rx={2} />
          <circle cx={7} cy={11} r={2.5} />
          <rect x={12} y={8} width={4} height={2} rx={0.5} />
          <path d="M7 5V3" />
        </svg>
      );
    case "antenna":
      // Vertical antenna with radials
      return (
        <svg {...svgProps}>
          <path d="M10 2v14" />
          <path d="M10 6l-5 5m5-5l5 5" />
          <path d="M10 10l-3 3m3-3l3 3" strokeWidth={1} opacity={0.6} />
        </svg>
      );
    case "feedline":
      // Coax cable cross-section
      return (
        <svg {...svgProps}>
          <circle cx={10} cy={10} r={7} />
          <circle cx={10} cy={10} r={3} />
          <circle cx={10} cy={10} r={1} fill={color} stroke="none" />
        </svg>
      );
    case "accessory":
      // Wrench / tool
      return (
        <svg {...svgProps}>
          <path d="M14.5 5.5a4 4 0 01-5 5L5 15l-1.5-1.5 4.5-4.5a4 4 0 015-5z" />
          <circle cx={12} cy={8} r={1} fill={color} stroke="none" />
        </svg>
      );
    case "inline":
      // Inline component (transformer symbol)
      return (
        <svg {...svgProps}>
          <path d="M2 10h4m12 0h-4" />
          <path d="M6 6c2 0 2 2 2 4s0 4 2 4" />
          <path d="M14 6c-2 0-2 2-2 4s0 4-2 4" />
        </svg>
      );
  }
}

// ─── Action Button Icons ─────────────────────────────────────────────────────

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

// ─── Component ───────────────────────────────────────────────────────────────

export function EquipmentCard({
  title,
  subtitle,
  equipmentType,
  tier,
  badges,
  stats,
  bandPills,
  isActive,
  onToggleActive,
  visualization,
  onClick,
  onEdit,
  onDelete,
  onDuplicate,
}: EquipmentCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const accent = ACCENT_COLORS[equipmentType];
  const glowClass = GLOW_SHADOW[equipmentType];
  const hasActions = onEdit || onDelete || onDuplicate;

  // Resolve the large centered symbol
  const SymbolComponent = getEquipmentSymbol(equipmentType);

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
        // Layout
        "relative flex flex-col w-full min-w-0",
        // Background & border
        "bg-[#0f1420] border border-white/[0.06] rounded-lg overflow-hidden",
        // Left accent bar
        "border-l-[3px]",
        // Cursor
        onClick ? "cursor-pointer" : "",
        // Transitions
        "transition-all duration-200",
        // Hover lift + glow
        isHovered ? `-translate-y-0.5 ${glowClass}` : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        borderLeftColor: accent,
        // Subtle gradient overlay
        backgroundImage: `linear-gradient(160deg, rgba(255,255,255,0.02) 0%, transparent 40%, rgba(0,0,0,0.15) 100%)`,
      }}
    >
      {/* Corner brackets */}
      <CornerBracket position="tl" color={accent} />
      <CornerBracket position="tr" color={accent} />
      <CornerBracket position="bl" color={accent} />
      <CornerBracket position="br" color={accent} />

      {/* ── Header ── */}
      <div className="relative px-3 pt-3 pb-2 flex items-start gap-2 min-w-0">
        <TypeIcon type={equipmentType} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="text-sm font-semibold text-white truncate leading-tight">
              {title}
            </h3>
            {tier && (
              <span
                className={`flex-shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded ${TIER_STYLES[tier]}`}
              >
                {TIER_LABELS[tier]}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-[11px] text-gray-500 truncate leading-tight mt-0.5">
              {subtitle}
            </p>
          )}
        </div>

        {/* Action buttons — visible on hover */}
        {hasActions && (
          <div
            className={[
              "absolute top-2 right-2 flex items-center gap-0.5",
              "transition-opacity duration-150",
              isHovered ? "opacity-100" : "opacity-0 pointer-events-none",
            ].join(" ")}
          >
            {onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="w-7 h-7 min-h-[44px] min-w-[44px] -m-2 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
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
                className="w-7 h-7 min-h-[44px] min-w-[44px] -m-2 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label={`Duplicate ${title}`}
                title="Duplicate"
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
                className="w-7 h-7 min-h-[44px] min-w-[44px] -m-2 flex items-center justify-center rounded text-gray-400 hover:text-alert-red hover:bg-alert-red/10 transition-colors"
                aria-label={`Delete ${title}`}
                title="Delete"
              >
                <TrashIcon />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Divider ── */}
      <div className="mx-3 h-px bg-white/[0.06]" />

      {/* ── Symbol / Visualization zone ── */}
      <div className="flex items-center justify-center py-5 px-3 min-h-[80px]">
        {visualization ? (
          visualization
        ) : (
          <div style={{ opacity: 0.6 }}>
            <SymbolComponent className="w-12 h-12" />
          </div>
        )}
      </div>

      {/* ── Divider ── */}
      {stats && stats.length > 0 && (
        <div className="mx-3 h-px bg-white/[0.06]" />
      )}

      {/* ── Stats grid ── */}
      {stats && stats.length > 0 && (
        <div className="px-3 py-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
          {stats.map((stat) => (
            <div
              key={`${stat.icon}-${stat.label}`}
              className="flex items-center gap-1.5 min-w-0"
            >
              <span className="text-gray-500">
                <StatIconSvg icon={stat.icon} />
              </span>
              <span className="text-[11px] text-gray-500 flex-shrink-0">
                {stat.label}:
              </span>
              <span className="text-[11px] text-gray-200 font-medium truncate">
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Badges ── */}
      {badges && badges.length > 0 && (
        <>
          <div className="mx-3 h-px bg-white/[0.06]" />
          <div className="px-3 py-2 flex flex-wrap gap-1">
            {badges.map((badge) => (
              <span
                key={badge.label}
                className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${BADGE_STYLES[badge.color ?? "gray"]}`}
              >
                {badge.label}
              </span>
            ))}
          </div>
        </>
      )}

      {/* ── Band pills + Active toggle footer ── */}
      {((bandPills && bandPills.length > 0) || equipmentType === "radio") && (
        <>
          <div className="mx-3 h-px bg-white/[0.06]" />
          <div className="px-3 py-2.5 flex items-center gap-2 min-w-0">
            {/* Band pills */}
            {bandPills && bandPills.length > 0 && (
              <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                {bandPills.map((band) => (
                  <span
                    key={band}
                    className={`px-1.5 py-0.5 text-[10px] font-mono font-medium rounded border ${BAND_PILL_COLORS[band] ?? DEFAULT_BAND_PILL}`}
                  >
                    {band}
                  </span>
                ))}
              </div>
            )}

            {/* Active toggle (radios only) */}
            {equipmentType === "radio" && onToggleActive && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleActive();
                }}
                className={[
                  "flex-shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-full",
                  "text-[10px] font-semibold uppercase tracking-wider",
                  "min-h-[44px] min-w-[44px] -my-2",
                  "transition-colors duration-150",
                  isActive
                    ? "bg-signal-green/15 text-signal-green"
                    : "bg-gray-800 text-gray-500 hover:text-gray-400",
                ].join(" ")}
                aria-label={isActive ? "Deactivate radio" : "Activate radio"}
                aria-pressed={isActive}
              >
                <span
                  className={[
                    "w-2 h-2 rounded-full transition-colors",
                    isActive
                      ? "bg-signal-green shadow-[0_0_6px_rgba(34,197,94,0.5)]"
                      : "border border-gray-600 bg-transparent",
                  ].join(" ")}
                />
                {isActive ? "Active" : "Inactive"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default EquipmentCard;
