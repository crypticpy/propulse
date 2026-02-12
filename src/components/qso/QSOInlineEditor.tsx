/**
 * QSOInlineEditor — In-place cell editor for QSO table rows
 *
 * Renders an input or select that replaces the cell content.
 * Escape cancels, Enter or blur saves via qsoStore.editQSO.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useQSOStore } from "@/stores/qsoStore";
import { BAND_OPTIONS, MODE_OPTIONS } from "@/lib/adif/types";

// ── Field Configuration ─────────────────────────────────────────────────────

type FieldType = "text" | "select";

interface FieldConfig {
  type: FieldType;
  options?: readonly string[];
}

const FIELD_CONFIGS: Record<string, FieldConfig> = {
  callsign: { type: "text" },
  band: { type: "select", options: BAND_OPTIONS },
  mode: { type: "select", options: MODE_OPTIONS },
  rstSent: { type: "text" },
  rstRcvd: { type: "text" },
  grid: { type: "text" },
  name: { type: "text" },
};

// ── Props ───────────────────────────────────────────────────────────────────

interface QSOInlineEditorProps {
  entryId: string;
  field: string;
  currentValue: string;
  onCancel: () => void;
}

// ── Main Component ──────────────────────────────────────────────────────────

export function QSOInlineEditor({
  entryId,
  field,
  currentValue,
  onCancel,
}: QSOInlineEditorProps) {
  const editQSO = useQSOStore((s) => s.editQSO);
  const [value, setValue] = useState(currentValue);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const saveInProgress = useRef(false);

  // Focus on mount
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      if (el instanceof HTMLInputElement) {
        el.select();
      }
    }
  }, []);

  const save = useCallback(async () => {
    if (saveInProgress.current) return;
    const trimmed = value.trim();
    if (trimmed === currentValue || saving) {
      onCancel();
      return;
    }

    saveInProgress.current = true;
    setSaving(true);
    try {
      // Normalize the value for specific fields
      let normalized: string | number = trimmed;
      if (field === "callsign") {
        normalized = trimmed.toUpperCase();
      } else if (field === "grid") {
        normalized = trimmed.toUpperCase();
      }

      await editQSO(entryId, { [field]: normalized });
      onCancel();
    } catch (err) {
      console.error("[QSOInlineEditor] save failed:", err);
      onCancel();
    } finally {
      saveInProgress.current = false;
      setSaving(false);
    }
  }, [value, currentValue, saving, editQSO, entryId, field, onCancel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        save();
      }
    },
    [onCancel, save],
  );

  const config = FIELD_CONFIGS[field] ?? { type: "text" };

  const baseClass =
    "w-full bg-white/10 border border-plasma-orange/50 rounded text-sm text-white px-2 py-1 focus:outline-none focus:border-plasma-orange";

  if (config.type === "select" && config.options) {
    return (
      <select
        ref={inputRef as React.RefObject<HTMLSelectElement>}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        className={`${baseClass} appearance-none cursor-pointer`}
        disabled={saving}
      >
        <option value="" className="bg-deep-space text-white">
          --
        </option>
        {config.options.map((opt) => (
          <option key={opt} value={opt} className="bg-deep-space text-white">
            {opt}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={handleKeyDown}
      className={baseClass}
      disabled={saving}
    />
  );
}
