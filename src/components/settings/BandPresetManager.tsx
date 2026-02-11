/**
 * BandPresetManager
 *
 * Compact component for managing band presets (max 5).
 * Shows existing presets as a list with edit/delete, and an inline form
 * for adding new presets with a band chip grid.
 */

import { useState, useCallback } from "react";
import { useSettingsStore, useBandPresets } from "@/stores/settingsStore";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ALL_BANDS, type BandId } from "@/types/user";

const MAX_PRESETS = 5;

export function BandPresetManager() {
  const presets = useBandPresets();
  const addBandPreset = useSettingsStore((s) => s.addBandPreset);
  const removeBandPreset = useSettingsStore((s) => s.removeBandPreset);
  const updateBandPreset = useSettingsStore((s) => s.updateBandPreset);

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [selectedBands, setSelectedBands] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Delete confirmation state
  const [deletePresetId, setDeletePresetId] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setName("");
    setSelectedBands([]);
    setError(null);
    setIsAdding(false);
    setEditingId(null);
  }, []);

  const toggleBand = (band: BandId) => {
    setSelectedBands((prev) =>
      prev.includes(band) ? prev.filter((b) => b !== band) : [...prev, band],
    );
  };

  const handleSave = () => {
    if (editingId) {
      const result = updateBandPreset(editingId, {
        name,
        bands: selectedBands,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
    } else {
      const result = addBandPreset(name, selectedBands);
      if (!result.ok) {
        setError(result.error);
        return;
      }
    }
    resetForm();
  };

  const handleEdit = (preset: {
    id: string;
    name: string;
    bands: string[];
  }) => {
    setEditingId(preset.id);
    setName(preset.name);
    setSelectedBands([...preset.bands]);
    setError(null);
    setIsAdding(true);
  };

  const atLimit = presets.length >= MAX_PRESETS;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Band Presets
        </h4>
        {!isAdding && (
          <button
            type="button"
            disabled={atLimit}
            onClick={() => {
              setIsAdding(true);
              setEditingId(null);
              setError(null);
            }}
            className={`text-xs px-2 py-1 rounded border transition-colors ${
              atLimit
                ? "text-gray-600 border-white/5 cursor-not-allowed"
                : "text-plasma-orange border-plasma-orange/30 hover:bg-plasma-orange/10"
            }`}
          >
            + Add Preset
          </button>
        )}
      </div>

      {atLimit && !isAdding && (
        <p className="text-xs text-gray-500">
          Maximum of {MAX_PRESETS} presets reached.
        </p>
      )}

      {/* Existing presets */}
      {presets.length > 0 && !isAdding && (
        <div className="space-y-1.5">
          {presets.map((preset) => (
            <div
              key={preset.id}
              className="flex items-center justify-between gap-2 px-3 py-2 bg-void-black rounded-lg border border-white/10"
            >
              <div className="min-w-0 flex-1">
                <span className="text-sm text-gray-200">{preset.name}</span>
                <span className="ml-2 text-xs text-gray-500">
                  {preset.bands.length} band
                  {preset.bands.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleEdit(preset)}
                  className="text-xs text-gray-400 hover:text-plasma-orange transition-colors"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeletePresetId(preset.id)}
                  className="text-xs text-gray-400 hover:text-alert-red transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inline add/edit form */}
      {isAdding && (
        <div className="p-3 bg-void-black rounded-lg border border-white/10 space-y-3">
          <input
            type="text"
            placeholder="Preset name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            className="w-full bg-deep-space text-sm text-gray-200 px-3 py-1.5 rounded border border-white/10 focus:border-plasma-orange/50 focus:outline-none"
            maxLength={30}
          />
          <div className="grid grid-cols-5 gap-1.5">
            {ALL_BANDS.map((band) => (
              <button
                key={band}
                type="button"
                onClick={() => toggleBand(band)}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-colors border ${
                  selectedBands.includes(band)
                    ? "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/50"
                    : "bg-nebula-blue text-gray-400 border-white/10 hover:text-gray-200"
                }`}
              >
                {band}
              </button>
            ))}
          </div>
          {error && <p className="text-xs text-alert-red">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-gray-400 hover:text-gray-200 px-3 py-1.5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="text-xs text-white bg-plasma-orange hover:bg-plasma-orange/80 px-3 py-1.5 rounded transition-colors"
            >
              {editingId ? "Update" : "Save"}
            </button>
          </div>
        </div>
      )}
      {/* Delete preset confirmation dialog */}
      <ConfirmDialog
        open={deletePresetId !== null}
        title="Delete Band Preset"
        message="Delete this band preset? This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deletePresetId) removeBandPreset(deletePresetId);
          setDeletePresetId(null);
        }}
        onCancel={() => setDeletePresetId(null)}
      />
    </div>
  );
}
