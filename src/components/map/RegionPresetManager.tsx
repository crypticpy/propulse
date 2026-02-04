/**
 * RegionPresetManager Component
 *
 * Full management panel for region preset CRUD operations.
 * Renders as a centered modal overlay via createPortal with
 * glassmorphism styling. Supports inline editing, reordering,
 * deletion with confirmation, and import/export via JSON.
 *
 * Built-in presets are protected from deletion and reordering.
 * User presets can be fully managed.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useMapStore } from "@/stores/mapStore";
import type { RegionPreset } from "@/types/map";

interface RegionPresetManagerProps {
  /** Whether the manager panel is visible */
  visible: boolean;
  /** Callback to close the panel */
  onClose: () => void;
  /** Additional CSS classes */
  className?: string;
}

// ─── Sub-components ─────────────────────────────────────────────

/**
 * Inline text editor for preset names.
 * Click to edit, Enter to save, Escape to cancel.
 */
function InlineNameEditor({
  value,
  onSave,
  onCancel,
}: {
  value: string;
  onSave: (newName: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const trimmed = draft.trim();
        if (trimmed && trimmed !== value) {
          onSave(trimmed);
        } else {
          onCancel();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    },
    [draft, value, onSave, onCancel],
  );

  const handleBlur = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      onCancel();
    }
  }, [draft, value, onSave, onCancel]);

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      maxLength={32}
      className="
        w-full px-2 py-1
        bg-gray-800/80 border border-cyan-500/40
        rounded
        text-white text-sm
        focus:outline-none focus:ring-1 focus:ring-cyan-500/50
      "
      aria-label="Edit preset name"
    />
  );
}

/**
 * Inline delete confirmation with Yes/No buttons.
 */
function DeleteConfirmation({
  presetName,
  onConfirm,
  onCancel,
}: {
  presetName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-gray-400">Delete &ldquo;{presetName}&rdquo;?</span>
      <button
        onClick={onConfirm}
        className="
          px-2 py-0.5
          bg-red-600/80 hover:bg-red-500
          text-white font-medium
          rounded
          transition-colors duration-150
        "
      >
        Yes
      </button>
      <button
        onClick={onCancel}
        className="
          px-2 py-0.5
          bg-gray-700/60 hover:bg-gray-600
          text-gray-300
          rounded
          transition-colors duration-150
        "
      >
        No
      </button>
    </div>
  );
}

/**
 * Individual preset row in the manager list.
 */
function PresetRow({
  preset,
  isActive,
  index,
  totalUserPresets,
  userIndex,
  onActivate,
  onUpdateName,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  preset: RegionPreset;
  isActive: boolean;
  index: number;
  totalUserPresets: number;
  /** Index within the user presets section (-1 for built-in) */
  userIndex: number;
  onActivate: (id: string) => void;
  onUpdateName: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSaveName = useCallback(
    (newName: string) => {
      onUpdateName(preset.id, newName);
      setIsEditing(false);
    },
    [preset.id, onUpdateName],
  );

  const handleConfirmDelete = useCallback(() => {
    onDelete(preset.id);
    setIsDeleting(false);
  }, [preset.id, onDelete]);

  const canMoveUp = !preset.isBuiltIn && userIndex > 0;
  const canMoveDown = !preset.isBuiltIn && userIndex < totalUserPresets - 1;

  return (
    <div
      className={`
        flex items-center gap-2 px-3 py-2
        rounded-lg
        transition-colors duration-100
        ${isActive ? "bg-cyan-500/10 border border-cyan-500/20" : "bg-white/[0.02] border border-transparent hover:bg-white/[0.04]"}
      `}
    >
      {/* Icon */}
      <span
        className="w-6 text-center text-sm flex-shrink-0"
        aria-hidden="true"
      >
        {preset.icon || "\u{1F4CD}"}
      </span>

      {/* Name area */}
      <div className="flex-1 min-w-0">
        {isDeleting ? (
          <DeleteConfirmation
            presetName={preset.name}
            onConfirm={handleConfirmDelete}
            onCancel={() => setIsDeleting(false)}
          />
        ) : isEditing ? (
          <InlineNameEditor
            value={preset.name}
            onSave={handleSaveName}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          <div className="flex items-center gap-2">
            <span
              className={`
                text-sm truncate
                ${isActive ? "text-cyan-300 font-medium" : "text-gray-200"}
                ${!preset.isBuiltIn ? "cursor-pointer hover:text-white" : ""}
              `}
              onDoubleClick={
                !preset.isBuiltIn ? () => setIsEditing(true) : undefined
              }
              title={
                preset.isBuiltIn ? preset.name : "Double-click to edit name"
              }
            >
              {preset.name}
            </span>
            {preset.isBuiltIn && (
              <span
                className="
                  text-[10px] font-medium uppercase tracking-wider
                  px-1.5 py-0.5 rounded
                  bg-gray-700/60 text-gray-500
                  flex-shrink-0
                "
              >
                Built-in
              </span>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Reorder: up */}
        {!preset.isBuiltIn && (
          <button
            onClick={() => onMoveUp(index)}
            disabled={!canMoveUp}
            className="
              p-1
              text-gray-500 hover:text-gray-300
              disabled:text-gray-700 disabled:cursor-not-allowed
              hover:bg-white/10
              rounded
              transition-colors duration-150
            "
            title="Move up"
            aria-label="Move preset up"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 15l7-7 7 7"
              />
            </svg>
          </button>
        )}

        {/* Reorder: down */}
        {!preset.isBuiltIn && (
          <button
            onClick={() => onMoveDown(index)}
            disabled={!canMoveDown}
            className="
              p-1
              text-gray-500 hover:text-gray-300
              disabled:text-gray-700 disabled:cursor-not-allowed
              hover:bg-white/10
              rounded
              transition-colors duration-150
            "
            title="Move down"
            aria-label="Move preset down"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        )}

        {/* Edit name button (user presets only) */}
        {!preset.isBuiltIn && !isEditing && !isDeleting && (
          <button
            onClick={() => setIsEditing(true)}
            className="
              p-1
              text-gray-500 hover:text-gray-300
              hover:bg-white/10
              rounded
              transition-colors duration-150
            "
            title="Edit name"
            aria-label="Edit preset name"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
        )}

        {/* Go / Activate button */}
        <button
          onClick={() => onActivate(preset.id)}
          className={`
            px-2.5 py-1
            text-xs font-medium
            rounded-md
            transition-colors duration-150
            ${
              isActive
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
            }
          `}
          title={isActive ? "Active" : "Navigate to this preset"}
        >
          {isActive ? "Active" : "Go"}
        </button>

        {/* Delete button (user presets only) */}
        {!preset.isBuiltIn && !isDeleting && (
          <button
            onClick={() => setIsDeleting(true)}
            className="
              p-1
              text-gray-600 hover:text-red-400
              hover:bg-red-500/10
              rounded
              transition-colors duration-150
            "
            title="Delete preset"
            aria-label="Delete preset"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Import Panel ───────────────────────────────────────────────

function ImportPanel({
  onImport,
  onCancel,
}: {
  onImport: (json: string) => void;
  onCancel: () => void;
}) {
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = jsonText.trim();
    if (!trimmed) {
      setError("Paste JSON data to import");
      return;
    }

    // Basic validation: try to parse
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) {
        setError("Expected a JSON array of presets");
        return;
      }
      onImport(trimmed);
    } catch {
      setError("Invalid JSON format");
    }
  }, [jsonText, onImport]);

  return (
    <div className="space-y-3">
      <label className="block text-xs text-gray-400 font-medium">
        Paste preset JSON:
      </label>
      <textarea
        ref={textareaRef}
        value={jsonText}
        onChange={(e) => {
          setJsonText(e.target.value);
          setError(null);
        }}
        placeholder='[{"id": "...", "name": "...", ...}]'
        rows={5}
        className="
          w-full px-3 py-2
          bg-gray-800/60 border border-gray-600/50
          rounded-md
          text-white text-xs font-mono
          placeholder:text-gray-600
          focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50
          resize-none
        "
        aria-label="Import JSON data"
      />
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          className="
            flex-1 px-3 py-2
            bg-cyan-600 hover:bg-cyan-500
            text-white text-sm font-medium
            rounded-md
            transition-colors duration-150
          "
        >
          Import
        </button>
        <button
          onClick={onCancel}
          className="
            px-3 py-2
            bg-gray-700/50 hover:bg-gray-700
            text-gray-300 text-sm
            rounded-md
            transition-colors duration-150
          "
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

/**
 * RegionPresetManager
 *
 * Full management panel for region presets with CRUD,
 * reorder, import/export support. Renders as a modal overlay.
 */
export function RegionPresetManager({
  visible,
  onClose,
  className = "",
}: RegionPresetManagerProps) {
  const regionPresets = useMapStore((s) => s.regionPresets);
  const activePresetId = useMapStore((s) => s.activePresetId);
  const setActivePreset = useMapStore((s) => s.setActivePreset);
  const updateRegionPreset = useMapStore((s) => s.updateRegionPreset);
  const deleteRegionPreset = useMapStore((s) => s.deleteRegionPreset);
  const reorderRegionPresets = useMapStore((s) => s.reorderRegionPresets);
  const exportRegionPresets = useMapStore((s) => s.exportRegionPresets);
  const importRegionPresets = useMapStore((s) => s.importRegionPresets);

  const [showImport, setShowImport] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  // Separate built-in and user presets
  const { builtInPresets, userPresets } = useMemo(() => {
    const builtIn: RegionPreset[] = [];
    const user: RegionPreset[] = [];
    for (const p of regionPresets || []) {
      if (p.isBuiltIn) {
        builtIn.push(p);
      } else {
        user.push(p);
      }
    }
    return { builtInPresets: builtIn, userPresets: user };
  }, [regionPresets]);

  // Escape key closes the panel
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  // Activate a preset
  const handleActivate = useCallback(
    (id: string) => {
      setActivePreset(id);
    },
    [setActivePreset],
  );

  // Update a preset name
  const handleUpdateName = useCallback(
    (id: string, name: string) => {
      updateRegionPreset(id, { name });
    },
    [updateRegionPreset],
  );

  // Delete a preset
  const handleDelete = useCallback(
    (id: string) => {
      deleteRegionPreset(id);
    },
    [deleteRegionPreset],
  );

  // Reorder: move up within the full list
  const handleMoveUp = useCallback(
    (globalIndex: number) => {
      if (!regionPresets || globalIndex <= 0) return;
      const newOrder = [...regionPresets];
      [newOrder[globalIndex - 1], newOrder[globalIndex]] = [
        newOrder[globalIndex],
        newOrder[globalIndex - 1],
      ];
      reorderRegionPresets(newOrder.map((p) => p.id));
    },
    [regionPresets, reorderRegionPresets],
  );

  // Reorder: move down within the full list
  const handleMoveDown = useCallback(
    (globalIndex: number) => {
      if (!regionPresets || globalIndex >= regionPresets.length - 1) return;
      const newOrder = [...regionPresets];
      [newOrder[globalIndex], newOrder[globalIndex + 1]] = [
        newOrder[globalIndex + 1],
        newOrder[globalIndex],
      ];
      reorderRegionPresets(newOrder.map((p) => p.id));
    },
    [regionPresets, reorderRegionPresets],
  );

  // Export to clipboard
  const [exportSuccess, setExportSuccess] = useState(true);
  const handleExport = useCallback(async () => {
    try {
      const json = exportRegionPresets();
      await navigator.clipboard.writeText(json);
      setExportSuccess(true);
      setExportFeedback("Copied to clipboard!");
      setTimeout(() => setExportFeedback(null), 2500);
    } catch {
      setExportSuccess(false);
      setExportFeedback("Export failed - check clipboard permissions");
      setTimeout(() => setExportFeedback(null), 3000);
    }
  }, [exportRegionPresets]);

  // Import from JSON
  const [importError, setImportError] = useState<string | null>(null);
  const handleImport = useCallback(
    (json: string) => {
      const success = importRegionPresets(json);
      if (success) {
        setShowImport(false);
        setImportError(null);
      } else {
        setImportError(
          "Import failed — invalid preset data. Each preset needs name, center (lat/lon), and zoom.",
        );
      }
    },
    [importRegionPresets],
  );

  if (!visible) {
    return null;
  }

  const panelContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Region Preset Manager"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className={`
          relative
          w-full max-w-lg
          max-h-[85vh]
          bg-gray-900/95 backdrop-blur-md
          border border-white/10
          rounded-xl
          shadow-2xl shadow-black/60
          flex flex-col
          animate-scale-in
          mx-4
          ${className}
        `}
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-lg" aria-hidden="true">
              {"\u{1F30D}"}
            </span>
            <h2 className="text-lg font-semibold text-white">Region Presets</h2>
          </div>
          <button
            onClick={onClose}
            className="
              p-1.5
              text-gray-400 hover:text-white
              hover:bg-white/10
              rounded-lg
              transition-colors duration-150
            "
            aria-label="Close preset manager"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 scrollbar-hide">
          {/* Built-in presets section */}
          {builtInPresets.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2.5">
                Built-in Regions
              </h3>
              <div className="space-y-1">
                {builtInPresets.map((preset, idx) => (
                  <PresetRow
                    key={preset.id}
                    preset={preset}
                    isActive={preset.id === activePresetId}
                    index={idx}
                    totalUserPresets={0}
                    userIndex={-1}
                    onActivate={handleActivate}
                    onUpdateName={handleUpdateName}
                    onDelete={handleDelete}
                    onMoveUp={handleMoveUp}
                    onMoveDown={handleMoveDown}
                  />
                ))}
              </div>
            </div>
          )}

          {/* User presets section */}
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2.5">
              Custom Presets
              {userPresets.length > 0 && (
                <span className="ml-2 text-gray-600">
                  ({userPresets.length})
                </span>
              )}
            </h3>
            {userPresets.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-white/10 rounded-lg">
                <p className="text-gray-500 text-sm">No custom presets yet</p>
                <p className="text-gray-600 text-xs mt-1">
                  Save your current view from the preset dropdown
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {userPresets.map((preset, idx) => {
                  // Find global index for reordering
                  const globalIndex = (regionPresets || []).findIndex(
                    (p) => p.id === preset.id,
                  );
                  return (
                    <PresetRow
                      key={preset.id}
                      preset={preset}
                      isActive={preset.id === activePresetId}
                      index={globalIndex}
                      totalUserPresets={userPresets.length}
                      userIndex={idx}
                      onActivate={handleActivate}
                      onUpdateName={handleUpdateName}
                      onDelete={handleDelete}
                      onMoveUp={handleMoveUp}
                      onMoveDown={handleMoveDown}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Import panel */}
          {showImport && (
            <div className="border-t border-white/10 pt-4">
              <ImportPanel
                onImport={handleImport}
                onCancel={() => {
                  setShowImport(false);
                  setImportError(null);
                }}
              />
              {importError && (
                <p className="text-red-400 text-xs mt-2 px-1">{importError}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2">
            {/* Export button */}
            <button
              onClick={handleExport}
              className="
                flex items-center gap-1.5
                px-3 py-1.5
                text-xs text-gray-400 hover:text-white
                bg-white/5 hover:bg-white/10
                border border-white/10
                rounded-md
                transition-colors duration-150
              "
              title="Export custom presets to clipboard"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Export Custom
            </button>

            {/* Import button */}
            <button
              onClick={() => setShowImport(!showImport)}
              className={`
                flex items-center gap-1.5
                px-3 py-1.5
                text-xs
                border border-white/10
                rounded-md
                transition-colors duration-150
                ${
                  showImport
                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                    : "text-gray-400 hover:text-white bg-white/5 hover:bg-white/10"
                }
              `}
              title="Import presets from JSON"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              Import
            </button>

            {/* Export feedback toast */}
            {exportFeedback && (
              <span
                className={`text-xs animate-pulse ml-2 ${exportSuccess ? "text-emerald-400" : "text-red-400"}`}
              >
                {exportFeedback}
              </span>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="
              px-4 py-1.5
              text-sm text-gray-300 hover:text-white
              bg-white/5 hover:bg-white/10
              border border-white/10
              rounded-md
              transition-colors duration-150
            "
          >
            Close
          </button>
        </div>
      </div>

      {/* Inline animation keyframes */}
      <style>{`
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-scale-in {
          animation: scale-in 0.15s ease-out;
        }
      `}</style>
    </div>
  );

  return createPortal(panelContent, document.body);
}

RegionPresetManager.displayName = "RegionPresetManager";

export default RegionPresetManager;
