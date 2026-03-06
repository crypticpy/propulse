/**
 * FrequencyPlanEditor -- Modal for creating new frequency plans.
 * Lets users name the plan, add/remove frequency entries (label, MHz,
 * mode, tone, purpose), then save to emcommStore via addFrequencyPlan.
 */

import { useState, useCallback } from "react";
import { DetailModal } from "@/components/ui/DetailModal";
import { useEmcommStore } from "@/stores/emcommStore";

interface FrequencyPlanEditorProps {
  isOpen: boolean;
  onClose: () => void;
}

const MODES = ["USB", "LSB", "FM", "AM", "CW", "RTTY", "FT8"] as const;

const inputClasses =
  "w-full bg-void-black/60 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50 transition-colors";

const smallInputClasses =
  "bg-void-black/60 border border-white/10 rounded-md px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50 transition-colors";

interface DraftEntry {
  label: string;
  frequencyMhz: string;
  mode: string;
  tone: string;
  purpose: string;
}

function emptyEntry(): DraftEntry {
  return { label: "", frequencyMhz: "", mode: "FM", tone: "", purpose: "" };
}

export function FrequencyPlanEditor({
  isOpen,
  onClose,
}: FrequencyPlanEditorProps) {
  const addFrequencyPlan = useEmcommStore((s) => s.addFrequencyPlan);

  const [planName, setPlanName] = useState("");
  const [entries, setEntries] = useState<DraftEntry[]>([emptyEntry()]);

  const resetForm = useCallback(() => {
    setPlanName("");
    setEntries([emptyEntry()]);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const addEntry = () => {
    setEntries((prev) => [...prev, emptyEntry()]);
  };

  const removeEntry = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const updateEntry = (
    index: number,
    field: keyof DraftEntry,
    value: string,
  ) => {
    setEntries((prev) =>
      prev.map((entry, i) =>
        i === index ? { ...entry, [field]: value } : entry,
      ),
    );
  };

  const handleSave = () => {
    if (!planName.trim()) return;

    // Filter to entries that have at least a frequency
    const validEntries = entries.filter(
      (e) => e.frequencyMhz.trim() && !isNaN(parseFloat(e.frequencyMhz)),
    );
    if (validEntries.length === 0) return;

    addFrequencyPlan({
      name: planName.trim(),
      entries: validEntries.map((e) => ({
        label: e.label.trim() || `${e.frequencyMhz} MHz`,
        frequencyHz: parseFloat(e.frequencyMhz) * 1_000_000,
        mode: e.mode,
        tone: e.tone.trim() || undefined,
        purpose: e.purpose.trim(),
      })),
    });

    resetForm();
    onClose();
  };

  const hasValidEntries = entries.some(
    (e) => e.frequencyMhz.trim() && !isNaN(parseFloat(e.frequencyMhz)),
  );

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create Frequency Plan"
      subtitle="Define a reusable frequency plan for activations"
      size="lg"
    >
      <div className="space-y-5">
        {/* Plan Name */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Plan Name *
          </label>
          <input
            type="text"
            className={inputClasses}
            placeholder='e.g., "Region 5 ARES Standard"'
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
          />
        </div>

        {/* Entries */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-400">
              Frequency Entries
            </label>
            <button
              type="button"
              onClick={addEntry}
              className="text-[10px] font-mono text-plasma-orange hover:text-plasma-orange/80 transition-colors"
            >
              + Add Entry
            </button>
          </div>

          <div className="space-y-3">
            {entries.map((entry, idx) => (
              <div
                key={idx}
                className="rounded-md border border-white/5 bg-void-black/30 p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono text-gray-500 uppercase">
                    Entry {idx + 1}
                  </span>
                  {entries.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeEntry(idx)}
                      className="text-[10px] text-gray-500 hover:text-alert-red transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {/* Label */}
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-0.5">
                      Label
                    </label>
                    <input
                      type="text"
                      className={smallInputClasses + " w-full"}
                      placeholder="Primary HF"
                      value={entry.label}
                      onChange={(e) =>
                        updateEntry(idx, "label", e.target.value)
                      }
                    />
                  </div>

                  {/* Frequency (MHz) */}
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-0.5">
                      Freq (MHz) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      className={smallInputClasses + " w-full"}
                      placeholder="146.520"
                      value={entry.frequencyMhz}
                      onChange={(e) =>
                        updateEntry(idx, "frequencyMhz", e.target.value)
                      }
                    />
                  </div>

                  {/* Mode */}
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-0.5">
                      Mode
                    </label>
                    <select
                      className={smallInputClasses + " w-full"}
                      value={entry.mode}
                      onChange={(e) => updateEntry(idx, "mode", e.target.value)}
                    >
                      {MODES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Tone */}
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-0.5">
                      Tone (CTCSS)
                    </label>
                    <input
                      type="text"
                      className={smallInputClasses + " w-full"}
                      placeholder="100.0"
                      value={entry.tone}
                      onChange={(e) => updateEntry(idx, "tone", e.target.value)}
                    />
                  </div>
                </div>

                {/* Purpose (full width) */}
                <div className="mt-2">
                  <label className="block text-[10px] text-gray-500 mb-0.5">
                    Purpose
                  </label>
                  <input
                    type="text"
                    className={smallInputClasses + " w-full"}
                    placeholder="Net Primary, Tactical, Backup..."
                    value={entry.purpose}
                    onChange={(e) =>
                      updateEntry(idx, "purpose", e.target.value)
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-md text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!planName.trim() || !hasValidEntries}
            className="px-5 py-2 rounded-md text-sm font-semibold bg-plasma-orange text-void-black hover:bg-plasma-orange/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Save Plan
          </button>
        </div>
      </div>
    </DetailModal>
  );
}
