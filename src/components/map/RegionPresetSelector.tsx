/**
 * RegionPresetSelector Component
 *
 * Compact dropdown selector for region presets in the map toolbar.
 * Allows quick navigation to saved geographic views for DX hunting
 * and propagation analysis. Supports keyboard shortcuts (1-9) for
 * fast preset activation.
 *
 * Renders dropdown via createPortal to avoid overflow clipping
 * from parent map containers.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useMapStore } from "@/stores/mapStore";
import type { RegionPreset } from "@/types/map";

interface RegionPresetSelectorProps {
  /** Opens the full management panel */
  onOpenManager?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Inline save form displayed at the bottom of the dropdown
 * when the user wants to save their current view as a new preset.
 */
function SavePresetForm({
  onSave,
  onCancel,
}: {
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus the input when the form appears
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = name.trim();
      if (trimmed) {
        onSave(trimmed);
      }
    },
    [name, onSave],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    },
    [onCancel],
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="flex gap-1.5"
      onKeyDown={handleKeyDown}
    >
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Preset name..."
        maxLength={32}
        className="
          flex-1 min-w-0
          px-2.5 py-1.5
          bg-gray-800/60 border border-gray-600/50
          rounded-md
          text-white text-xs
          placeholder:text-gray-500
          focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50
        "
        aria-label="New preset name"
      />
      <button
        type="submit"
        disabled={!name.trim()}
        className="
          px-2.5 py-1.5
          bg-cyan-600 hover:bg-cyan-500
          disabled:bg-gray-700 disabled:text-gray-500
          text-white text-xs font-medium
          rounded-md
          transition-colors duration-150
        "
      >
        Save
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="
          px-2 py-1.5
          text-gray-400 hover:text-white
          hover:bg-white/10
          text-xs
          rounded-md
          transition-colors duration-150
        "
      >
        Cancel
      </button>
    </form>
  );
}

/**
 * RegionPresetSelector
 *
 * A compact toolbar dropdown for selecting region presets.
 * Shows the active preset name and opens a scrollable list
 * with keyboard shortcut hints and save/manage actions.
 */
export function RegionPresetSelector({
  onOpenManager,
  className = "",
}: RegionPresetSelectorProps) {
  const regionPresets = useMapStore((s) => s.regionPresets);
  const activePresetId = useMapStore((s) => s.activePresetId);
  const setActivePreset = useMapStore((s) => s.setActivePreset);
  const saveCurrentAsPreset = useMapStore((s) => s.saveCurrentAsPreset);

  const [isOpen, setIsOpen] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Find the currently active preset
  const activePreset = useMemo(() => {
    if (!activePresetId || !regionPresets) return null;
    return (
      regionPresets.find((p: RegionPreset) => p.id === activePresetId) ?? null
    );
  }, [regionPresets, activePresetId]);

  // Compute dropdown position from the trigger button
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 260),
    });
  }, []);

  // Recalculate position when dropdown opens
  useEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
      setShowSaveForm(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Keyboard handler for the dropdown
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Escape closes dropdown
      if (e.key === "Escape") {
        setIsOpen(false);
        setShowSaveForm(false);
        buttonRef.current?.focus();
        return;
      }

      // Number keys 1-9 select presets (prevent global shortcut conflicts)
      if (!showSaveForm) {
        const num = parseInt(e.key, 10);
        if (
          num >= 1 &&
          num <= 9 &&
          regionPresets &&
          num <= regionPresets.length
        ) {
          e.preventDefault();
          e.stopPropagation();
          const preset = regionPresets[num - 1];
          setActivePreset(preset.id);
          setIsOpen(false);
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, showSaveForm, regionPresets, setActivePreset]);

  // Handle preset selection
  const handleSelectPreset = useCallback(
    (preset: RegionPreset) => {
      setActivePreset(preset.id);
      setIsOpen(false);
      setShowSaveForm(false);
    },
    [setActivePreset],
  );

  // Handle save current view
  const handleSave = useCallback(
    (name: string) => {
      saveCurrentAsPreset(name);
      setShowSaveForm(false);
      setIsOpen(false);
    },
    [saveCurrentAsPreset],
  );

  // Handle manage click
  const handleManage = useCallback(() => {
    setIsOpen(false);
    setShowSaveForm(false);
    onOpenManager?.();
  }, [onOpenManager]);

  // Toggle dropdown
  const toggleDropdown = useCallback(() => {
    setIsOpen((prev) => {
      if (prev) {
        setShowSaveForm(false);
      }
      return !prev;
    });
  }, []);

  // Dropdown portal content
  const dropdown = isOpen
    ? createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999]"
          style={{
            top: `${dropdownPos.top}px`,
            left: `${dropdownPos.left}px`,
            minWidth: `${dropdownPos.width}px`,
          }}
        >
          <div
            className="
              bg-gray-900/95 backdrop-blur-md
              border border-white/10
              rounded-lg
              shadow-2xl shadow-black/50
              overflow-hidden
              animate-fade-in
            "
          >
            {/* Preset list */}
            <div className="max-h-72 overflow-y-auto scrollbar-hide py-1">
              {regionPresets?.map((preset: RegionPreset, index: number) => {
                const isActive = preset.id === activePresetId;
                const shortcutKey = index < 9 ? index + 1 : null;

                return (
                  <button
                    key={preset.id}
                    onClick={() => handleSelectPreset(preset)}
                    className={`
                      w-full flex items-center gap-2.5 px-3 py-2
                      text-left text-sm
                      transition-colors duration-100
                      ${
                        isActive
                          ? "bg-cyan-500/15 text-cyan-300"
                          : "text-gray-200 hover:bg-white/[0.07]"
                      }
                    `}
                    title={preset.name}
                  >
                    {/* Icon */}
                    <span
                      className="w-5 text-center text-sm flex-shrink-0"
                      aria-hidden="true"
                    >
                      {preset.icon || "\u{1F4CD}"}
                    </span>

                    {/* Name */}
                    <span className="flex-1 truncate">{preset.name}</span>

                    {/* Active indicator */}
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />
                    )}

                    {/* Keyboard hint */}
                    {shortcutKey && (
                      <span
                        className="
                          flex-shrink-0
                          text-[10px] font-mono
                          text-gray-500
                          bg-white/5
                          w-5 h-5
                          flex items-center justify-center
                          rounded
                        "
                      >
                        {shortcutKey}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Divider */}
            <div className="border-t border-white/10" />

            {/* Save / Manage actions */}
            <div className="p-2 space-y-1.5">
              {showSaveForm ? (
                <SavePresetForm
                  onSave={handleSave}
                  onCancel={() => setShowSaveForm(false)}
                />
              ) : (
                <button
                  onClick={() => setShowSaveForm(true)}
                  className="
                    w-full flex items-center gap-2 px-3 py-1.5
                    text-sm text-gray-300 hover:text-white
                    hover:bg-white/[0.07]
                    rounded-md
                    transition-colors duration-150
                  "
                >
                  {/* Plus icon */}
                  <svg
                    className="w-4 h-4 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  <span>Save Current View</span>
                </button>
              )}

              {onOpenManager && (
                <button
                  onClick={handleManage}
                  className="
                    w-full flex items-center gap-2 px-3 py-1.5
                    text-sm text-gray-400 hover:text-white
                    hover:bg-white/[0.07]
                    rounded-md
                    transition-colors duration-150
                  "
                >
                  {/* Settings/gear icon */}
                  <svg
                    className="w-4 h-4 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <span>Manage Presets...</span>
                </button>
              )}
            </div>
          </div>

          {/* Inline animation keyframes */}
          <style>{`
            @keyframes fade-in {
              from { opacity: 0; transform: translateY(-4px); }
              to   { opacity: 1; transform: translateY(0); }
            }
            .animate-fade-in {
              animation: fade-in 0.12s ease-out;
            }
          `}</style>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      {/* Trigger button */}
      <button
        ref={buttonRef}
        onClick={toggleDropdown}
        className={`
          inline-flex items-center gap-2
          px-3 py-1.5
          bg-white/[0.05] hover:bg-white/[0.08]
          border border-white/10 hover:border-white/20
          rounded-lg
          text-sm text-gray-200
          transition-all duration-150
          ${isOpen ? "bg-white/[0.08] border-white/20" : ""}
          ${className}
        `}
        title="Region presets"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {/* Preset icon or globe */}
        <span className="text-sm" aria-hidden="true">
          {activePreset?.icon || "\u{1F30D}"}
        </span>

        {/* Label */}
        <span className="max-w-[120px] truncate">
          {activePreset?.name || "Custom View"}
        </span>

        {/* Chevron */}
        <svg
          className={`
            w-3.5 h-3.5 text-gray-500
            transition-transform duration-150
            ${isOpen ? "rotate-180" : ""}
          `}
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

      {dropdown}
    </>
  );
}

RegionPresetSelector.displayName = "RegionPresetSelector";

export default RegionPresetSelector;
