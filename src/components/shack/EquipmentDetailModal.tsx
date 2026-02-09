/** @deprecated Use EquipmentHeroCard instead — this modal is superseded by the XL hero card. */

import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { getEquipmentSymbol } from "./EquipmentSymbols";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EquipmentDetailField {
  label: string;
  value: string | number | boolean | undefined;
  unit?: string;
}

export interface EquipmentDetailGroup {
  heading: string;
  fields: EquipmentDetailField[];
}

export interface EquipmentDetailModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  equipmentType?: "radio" | "antenna" | "feedline" | "accessory" | "inline";
  fields: EquipmentDetailField[];
  groups?: EquipmentDetailGroup[];
  badges?: Array<{ label: string; color?: string }>;
  visualization?: React.ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  onSetActive?: () => void;
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// Accent hex map — matches EquipmentCard (defined locally to avoid circular)
// ---------------------------------------------------------------------------

const ACCENT_HEX: Record<string, string> = {
  radio: "#F97316",
  antenna: "#22C55E",
  feedline: "#14B8A6",
  accessory: "#F59E0B",
  inline: "#6B7280",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFieldValue(
  value: string | number | boolean | undefined,
  unit?: string,
): string {
  if (value === undefined || value === null) return "\u2014";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const str = typeof value === "number" ? String(value) : value;
  return unit ? `${str} ${unit}` : str;
}

function isNumericValue(value: string | number | boolean | undefined): boolean {
  if (typeof value === "number") return true;
  if (typeof value === "string") return /^-?\d+(\.\d+)?$/.test(value.trim());
  return false;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FieldCell({ field }: { field: EquipmentDetailField }) {
  const numeric = isNumericValue(field.value);
  const formatted = formatFieldValue(field.value, field.unit);

  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
        {field.label}
      </dt>
      <dd
        className={`mt-0.5 text-sm truncate ${
          numeric ? "font-mono font-bold text-white" : "font-mono text-white"
        }`}
      >
        {formatted}
      </dd>
    </div>
  );
}

function GroupSection({ group }: { group: EquipmentDetailGroup }) {
  // Use 3-column grid for groups with 3+ fields, 2-column otherwise
  const cols = group.fields.length >= 3 ? "grid-cols-3" : "grid-cols-2";

  return (
    <div className="px-5 py-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 pb-2 mb-2.5 border-b border-white/5">
        {group.heading}
      </h3>
      <dl className={`grid ${cols} gap-x-6 gap-y-2.5`}>
        {group.fields.map((field) => (
          <FieldCell key={field.label} field={field} />
        ))}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EquipmentDetailModal({
  open,
  onClose,
  title,
  subtitle,
  equipmentType = "radio",
  fields,
  groups,
  badges,
  visualization,
  onEdit,
  onDelete,
  onSetActive,
  isActive,
}: EquipmentDetailModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const accentHex = ACCENT_HEX[equipmentType] ?? ACCENT_HEX.radio;

  // Resolve the equipment symbol component
  const SymbolComponent = getEquipmentSymbol(equipmentType);

  // --- Escape key ---
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

  // --- Body scroll lock ---
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // --- Auto-focus close button ---
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const titleId = "equipment-detail-title";
  const hasActions = onEdit || onDelete || onSetActive;
  const hasGroups = groups && groups.length > 0;

  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in"
        onClick={onClose}
      />

      {/* Modal panel */}
      <div
        className="relative z-10 bg-[#0f1420] border border-white/10 rounded-2xl shadow-2xl
                   max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto
                   animate-in zoom-in-95 fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {/* ---- Hero Zone ---- */}
        <div
          className="relative py-6 px-5"
          style={{
            background: `linear-gradient(180deg, ${accentHex}10 0%, transparent 100%)`,
          }}
        >
          {/* Close button — absolute top-right */}
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-500 hover:text-white
                       hover:bg-white/5 transition-colors focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-white/30"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          {/* Large equipment symbol */}
          <div className="flex justify-center">
            <SymbolComponent className="w-24 h-24" />
          </div>

          {/* Visualization slot (between symbol and title) */}
          {visualization && <div className="mt-3">{visualization}</div>}

          {/* Title */}
          <h2
            id={titleId}
            className="text-xl font-bold text-white text-center mt-3"
            style={{ color: accentHex }}
          >
            {title}
          </h2>

          {/* Subtitle */}
          {subtitle && (
            <p className="text-sm text-gray-400 text-center mt-0.5">
              {subtitle}
            </p>
          )}

          {/* Badges */}
          {badges && badges.length > 0 && (
            <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
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

        {/* ---- Divider after hero ---- */}
        <div className="border-t border-white/5" />

        {/* ---- Grouped Fields (new layout) ---- */}
        {hasGroups && (
          <div>
            {groups.map((group, idx) => (
              <div key={group.heading}>
                {idx > 0 && <div className="border-t border-white/5 mx-5" />}
                <GroupSection group={group} />
              </div>
            ))}
          </div>
        )}

        {/* ---- Flat Fields Fallback (backward compatibility) ---- */}
        {!hasGroups && fields.length > 0 && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 pt-4 pb-2">
            {fields.map((field) => (
              <FieldCell key={field.label} field={field} />
            ))}
          </div>
        )}

        {/* ---- Action buttons ---- */}
        {hasActions && (
          <>
            <div className="border-t border-white/5 mx-5 mt-1" />
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
                             transition-colors min-h-[44px]
                             focus:outline-none focus-visible:ring-2 focus-visible:ring-signal-green/50
                             ${
                               isActive
                                 ? "bg-signal-green/20 border border-signal-green/40 text-signal-green"
                                 : "bg-signal-green/10 border border-signal-green/20 text-signal-green hover:bg-signal-green/20"
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

        {/* Bottom padding when no actions */}
        {!hasActions && <div className="pb-5" />}
      </div>
    </div>,
    document.body,
  );
}

export default EquipmentDetailModal;
