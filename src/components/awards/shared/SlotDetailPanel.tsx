/**
 * SlotDetailPanel — the centered detail modal for one award slot.
 *
 * Previously three near-identical components (`StateDetail` in WasMap,
 * `ZoneDetail` in WazGrid, `EntityDetail` in DxccGrid): same dialog chrome,
 * same status badge, same "Bands"/"Modes" chip lists, different noun and
 * different meta fields. This is the one component all three award grids
 * render, parameterised by title/subtitle and the meta `fields` that are
 * genuinely per-award (WAS/WAZ show QSOs + Status; DXCC shows Continent,
 * CQ Zone, QSOs and Entity ID instead of repeating Status, since the badge
 * already carries it). See issue #1095.
 */

import type { ReactNode } from "react";
import type { SlotStatus } from "@/lib/awards/types";
import { statusBg, statusLabel, statusText } from "./status";
import { SlotChipList } from "./SlotChipList";

export interface SlotDetailField {
  label: string;
  value: ReactNode;
  /** "status" colours the value with the slot's status ink. Default: plain reading text. */
  tone?: "status" | "default";
}

export interface SlotDetailPanelProps {
  title: string;
  subtitle?: string;
  /** Overrides the default subtitle styling (e.g. WAS's mono state abbreviation). */
  subtitleClassName?: string;
  status: SlotStatus;
  fields: SlotDetailField[];
  bands: string[];
  modes: string[];
  ariaLabel: string;
  onClose: () => void;
}

export function SlotDetailPanel({
  title,
  subtitle,
  subtitleClassName = "text-sm text-su-muted",
  status,
  fields,
  bands,
  modes,
  ariaLabel,
  onClose,
}: SlotDetailPanelProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div
        className="bg-void-black border border-su-line/40 rounded-xl p-5 w-full max-w-sm mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-su-text">{title}</h3>
            {subtitle && <span className={subtitleClassName}>{subtitle}</span>}
          </div>
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium ${statusBg(status)} ${statusText(status)} border`}
          >
            {statusLabel(status)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          {fields.map((field) => (
            <div key={field.label}>
              <span className="text-su-muted">{field.label}</span>
              <p
                className={
                  field.tone === "status" ? statusText(status) : "text-su-text"
                }
              >
                {field.value}
              </p>
            </div>
          ))}
        </div>

        <SlotChipList label="Bands" items={bands} />
        <SlotChipList label="Modes" items={modes} />

        <button
          onClick={onClose}
          className="mt-4 w-full py-2 rounded-lg bg-su-panel text-su-muted hover:bg-su-input transition-colors text-sm"
        >
          Close
        </button>
      </div>
    </div>
  );
}
