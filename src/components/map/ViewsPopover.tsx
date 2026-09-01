/**
 * ViewsPopover — Region preset selector popover
 *
 * Replaces the RegionPresetSelector dropdown with a popover that matches
 * the LayersPopover design language. Shows saved views/region presets
 * with keyboard shortcuts, and provides save/manage actions.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useMapStore } from "@/stores/mapStore";
import type { RegionPreset } from "@/types/map";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ViewsPopoverProps {
  /** Opens the full RegionPresetManager modal */
  onOpenManager: () => void;
  /** Use an icon-only trigger when the map column is narrow. */
  compact?: boolean;
}

// ─── Inline save form ─────────────────────────────────────────────────────────

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
      className="flex gap-1.5 mt-1"
      onKeyDown={handleKeyDown}
    >
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="View name..."
        maxLength={32}
        className="flex-1 min-w-0 px-2 py-1 bg-white/5 border border-white/10 rounded-md text-white text-xs placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/30 focus:border-white/20"
        aria-label="New view name"
      />
      <button
        type="submit"
        disabled={!name.trim()}
        className="px-2 py-1 bg-signal-green/20 hover:bg-signal-green/30 disabled:bg-white/5 disabled:text-white/20 text-signal-green text-xs font-medium rounded-md transition-colors"
      >
        Save
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="px-1.5 py-1 text-white/40 hover:text-white text-xs rounded-md hover:bg-white/5 transition-colors"
      >
        Cancel
      </button>
    </form>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ViewsPopover({
  onOpenManager,
  compact = false,
}: ViewsPopoverProps) {
  const [open, setOpen] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Map store selectors ──
  const regionPresets = useMapStore((s) => s.regionPresets);
  const activePresetId = useMapStore((s) => s.activePresetId);
  const setActivePreset = useMapStore((s) => s.setActivePreset);
  const saveCurrentAsPreset = useMapStore((s) => s.saveCurrentAsPreset);

  // Find active preset name for the trigger label
  const activePreset = regionPresets?.find(
    (p: RegionPreset) => p.id === activePresetId,
  );

  // ── Close on click outside ──
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setShowSaveForm(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // ── Close on Escape, number keys for preset shortcuts ──
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") {
        setOpen(false);
        setShowSaveForm(false);
        return;
      }
      // Number keys 1-9 select presets when save form is not open
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
          setOpen(false);
        }
      }
    },
    [open, showSaveForm, regionPresets, setActivePreset],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // ── Handle preset selection ──
  const handleSelectPreset = useCallback(
    (preset: RegionPreset) => {
      setActivePreset(preset.id);
      setOpen(false);
      setShowSaveForm(false);
    },
    [setActivePreset],
  );

  // ── Handle save ──
  const handleSave = useCallback(
    (name: string) => {
      saveCurrentAsPreset(name);
      setShowSaveForm(false);
      setOpen(false);
    },
    [saveCurrentAsPreset],
  );

  // ── Handle manage click ──
  const handleManage = useCallback(() => {
    setOpen(false);
    setShowSaveForm(false);
    onOpenManager();
  }, [onOpenManager]);

  return (
    <div ref={containerRef} className="relative">
      {/* ── Trigger button ── */}
      <button
        type="button"
        onClick={() =>
          setOpen((v) => {
            if (v) setShowSaveForm(false);
            return !v;
          })
        }
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-0 ${
          open
            ? "bg-white/15 text-white"
            : "text-gray-300 hover:text-white hover:bg-white/10"
        }`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={activePreset ? `Saved views: ${activePreset.name}` : "Saved views"}
        title={activePreset ? `Saved views: ${activePreset.name}` : "Saved views"}
      >
        {/* Location/globe icon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="7" cy="7" r="5.5" />
          <path d="M1.5 7h11" />
          <path d="M7 1.5c1.5 1.5 2.5 3.5 2.5 5.5s-1 4-2.5 5.5" />
          <path d="M7 1.5c-1.5 1.5-2.5 3.5-2.5 5.5s1 4 2.5 5.5" />
        </svg>
        {!compact &&
          (activePreset ? (
            <span className="max-w-[100px] truncate">{activePreset.name}</span>
          ) : (
            "Views"
          ))}
        {/* Chevron */}
        {!compact && (
          <svg
            className={`w-2.5 h-2.5 text-white/40 transition-transform duration-150 ${
              open ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        )}
      </button>

      {/* ── Popover panel ── */}
      <div
        className={`absolute top-full right-0 mt-1.5 w-[280px] z-50 bg-void-black/90 backdrop-blur-md border border-white/10 rounded-xl shadow-xl p-3 max-h-[70vh] overflow-y-auto transition-all duration-150 ${
          open
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-1 pointer-events-none"
        }`}
        role="group"
        aria-label="Saved views"
      >
        {/* ── Header ── */}
        <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-1.5 px-0.5">
          Saved Views
        </div>

        {/* ── Preset list ── */}
        <div className="space-y-0.5">
          {regionPresets?.map((preset: RegionPreset, index: number) => {
            const isActive = preset.id === activePresetId;
            const shortcutKey = index < 9 ? index + 1 : null;

            return (
              <div
                key={preset.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
                onClick={() => handleSelectPreset(preset)}
                title={preset.name}
              >
                {/* Preset icon */}
                <span className="text-sm shrink-0" aria-hidden="true">
                  {preset.icon || "\uD83D\uDCCD"}
                </span>

                {/* Name */}
                <span className="flex-1 text-xs truncate">{preset.name}</span>

                {/* Active indicator */}
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-signal-green shrink-0" />
                )}

                {/* Keyboard shortcut hint */}
                {shortcutKey && (
                  <span className="text-[10px] font-mono text-white/30 bg-white/5 w-4 h-4 flex items-center justify-center rounded shrink-0">
                    {shortcutKey}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Actions ── */}
        <div className="border-t border-white/5 my-2" />

        {showSaveForm ? (
          <SavePresetForm
            onSave={handleSave}
            onCancel={() => setShowSaveForm(false)}
          />
        ) : (
          <div
            className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-white/50 hover:text-white hover:bg-white/5 transition-colors"
            onClick={() => setShowSaveForm(true)}
          >
            {/* Plus icon */}
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            <span className="text-xs">Save Current View</span>
          </div>
        )}

        <div
          className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          onClick={handleManage}
        >
          {/* Settings icon */}
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
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
          <span className="text-xs">Manage Views...</span>
        </div>
      </div>
    </div>
  );
}
