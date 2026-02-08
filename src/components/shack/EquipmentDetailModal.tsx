import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EquipmentDetailField {
  label: string;
  value: string | number | boolean | undefined;
  unit?: string;
}

export interface EquipmentDetailModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  equipmentType?: "radio" | "antenna" | "feedline" | "accessory" | "inline";
  fields: EquipmentDetailField[];
  visualization?: React.ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  onSetActive?: () => void;
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// Color map — matches the accent colors used in EquipmentCard / managers
// ---------------------------------------------------------------------------

const ACCENT_COLORS: Record<
  NonNullable<EquipmentDetailModalProps["equipmentType"]>,
  { border: string; bg: string; text: string }
> = {
  radio: {
    border: "border-plasma-orange",
    bg: "bg-plasma-orange",
    text: "text-plasma-orange",
  },
  antenna: {
    border: "border-signal-green",
    bg: "bg-signal-green",
    text: "text-signal-green",
  },
  feedline: {
    border: "border-teal-500",
    bg: "bg-teal-500",
    text: "text-teal-500",
  },
  accessory: {
    border: "border-caution-amber",
    bg: "bg-caution-amber",
    text: "text-caution-amber",
  },
  inline: {
    border: "border-gray-500",
    bg: "bg-gray-500",
    text: "text-gray-500",
  },
};

const TYPE_ICONS: Record<
  NonNullable<EquipmentDetailModalProps["equipmentType"]>,
  JSX.Element
> = {
  radio: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="w-5 h-5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
      />
    </svg>
  ),
  antenna: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="w-5 h-5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
      />
    </svg>
  ),
  feedline: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="w-5 h-5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
      />
    </svg>
  ),
  accessory: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="w-5 h-5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25"
      />
    </svg>
  ),
  inline: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="w-5 h-5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
      />
    </svg>
  ),
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
  visualization,
  onEdit,
  onDelete,
  onSetActive,
  isActive,
}: EquipmentDetailModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const accent = ACCENT_COLORS[equipmentType];
  const icon = TYPE_ICONS[equipmentType];

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
        {/* ---- Header ---- */}
        <div className="flex items-start gap-3 p-5 pb-0">
          {/* Left accent bar */}
          <div
            className={`w-[3px] self-stretch rounded-full ${accent.bg} shrink-0`}
          />

          {/* Icon + titles */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={accent.text}>{icon}</span>
              <h2
                id={titleId}
                className="text-lg font-bold text-white truncate"
              >
                {title}
              </h2>
            </div>
            {subtitle && (
              <p className="mt-0.5 text-sm text-gray-400 truncate">
                {subtitle}
              </p>
            )}
          </div>

          {/* Close button */}
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 p-1.5 rounded-lg text-gray-500 hover:text-white
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
        </div>

        {/* ---- Divider ---- */}
        <div className="mx-5 mt-4 border-t border-white/5" />

        {/* ---- Visualization slot ---- */}
        {visualization && <div className="px-5 pt-4">{visualization}</div>}

        {/* ---- Fields grid ---- */}
        {fields.length > 0 && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 pt-4 pb-2">
            {fields.map((field) => (
              <div key={field.label} className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
                  {field.label}
                </dt>
                <dd className="mt-0.5 text-sm text-white truncate">
                  {formatFieldValue(field.value, field.unit)}
                </dd>
              </div>
            ))}
          </div>
        )}

        {/* ---- Action buttons ---- */}
        {hasActions && (
          <>
            <div className="mx-5 mt-3 border-t border-white/5" />
            <div className="flex items-center gap-3 p-5 pt-4">
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors
                             bg-blue-500/15 border border-blue-500/30 text-blue-400
                             hover:bg-blue-500/25 focus:outline-none
                             focus-visible:ring-2 focus-visible:ring-blue-500/50"
                >
                  Edit
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors
                             bg-alert-red/15 border border-alert-red/30 text-alert-red
                             hover:bg-alert-red/25 focus:outline-none
                             focus-visible:ring-2 focus-visible:ring-alert-red/50"
                >
                  Delete
                </button>
              )}
              {onSetActive && (
                <button
                  type="button"
                  onClick={onSetActive}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors
                             focus:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/50
                             ${
                               isActive
                                 ? "bg-plasma-orange/25 border border-plasma-orange/50 text-plasma-orange"
                                 : "bg-plasma-orange/15 border border-plasma-orange/30 text-plasma-orange hover:bg-plasma-orange/25"
                             }`}
                >
                  {isActive ? "Active" : "Set Active"}
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
