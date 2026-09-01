/**
 * ProfilePopover — Operating profile selector popover
 *
 * Replaces the inline profile buttons on the PropSphere toolbar with a
 * single "Profile" button that opens a compact popover showing all built-in
 * and custom operating profiles. Matches the LayersPopover design language.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useMapStore, type PresetName } from "@/stores/mapStore";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  BUILTIN_PROFILES,
  BUILTIN_PROFILE_ORDER,
  getProfileConfig,
} from "@/constants/operatingProfiles";
import type { BuiltinProfileId } from "@/types/operatingProfile";

// ─── Profile color accent classes ─────────────────────────────────────────────

const PROFILE_ACCENT: Record<string, string> = {
  "plasma-orange": "text-plasma-orange",
  "caution-amber": "text-caution-amber",
  "cosmic-cyan": "text-cosmic-cyan",
  "alert-red": "text-alert-red",
  "signal-green": "text-signal-green",
};

const PROFILE_RING_COLOR: Record<string, string> = {
  "plasma-orange": "border-plasma-orange/40",
  "caution-amber": "border-caution-amber/40",
  "cosmic-cyan": "border-cosmic-cyan/40",
  "alert-red": "border-alert-red/40",
  "signal-green": "border-signal-green/40",
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface ProfilePopoverProps {
  /** Current locally-tracked active profile (includes "listener" which isn't in LAYER_PRESETS) */
  activeProfile: BuiltinProfileId | null;
  /** Callback when a profile is selected */
  onSelectProfile: (profileId: BuiltinProfileId | null) => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProfilePopover({
  activeProfile,
  onSelectProfile,
}: ProfilePopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const applyPreset = useMapStore((s) => s.applyPreset);

  // ── Close on click outside ──
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // ── Close on Escape ──
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) setOpen(false);
    },
    [open],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // ── Handle profile click ──
  const handleProfileClick = useCallback(
    (profileId: BuiltinProfileId) => {
      const profile = BUILTIN_PROFILES[profileId];

      if (profileId === "listener") {
        // 'listener' isn't in LAYER_PRESETS — apply layers directly.
        // Merge onto current layers so preset-agnostic layers (e.g.
        // timeStations) keep their existing state instead of being forced
        // off by a profile that doesn't enumerate them.
        useMapStore.setState((state) => ({
          layers: { ...state.layers, ...profile.layers },
          activePreset: null,
        }));
        // Apply spotColorMode and visualStyle
        useSettingsStore.getState().updateUIInteraction({
          spotColorMode: profile.spotColorMode,
          visualStyle: profile.visualStyle,
        });
      } else {
        applyPreset(profileId as PresetName);
      }

      onSelectProfile(profileId);
      setOpen(false);
    },
    [applyPreset, onSelectProfile],
  );

  // ── Handle "None" click ──
  const handleClearProfile = useCallback(() => {
    onSelectProfile(null);
    setOpen(false);
  }, [onSelectProfile]);

  // ── Get the active profile's icon for the trigger button ──
  const activeConfig = activeProfile ? getProfileConfig(activeProfile) : null;

  return (
    <div ref={containerRef} className="relative">
      {/* ── Trigger button ── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-0 ${
          open
            ? "bg-white/15 text-white"
            : activeProfile
              ? "text-gray-300 hover:text-white hover:bg-white/10"
              : "text-gray-300 hover:text-white hover:bg-white/10"
        }`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {/* Profile icon (active profile's SVG or generic user icon) */}
        {activeConfig ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={PROFILE_ACCENT[activeConfig.activeColor] ?? ""}
          >
            <path d={activeConfig.iconPath} />
          </svg>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
        )}
        Profile
        {activeProfile && (
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              activeConfig
                ? `bg-${activeConfig.activeColor.replace("caution-amber", "caution-amber")}`
                : "bg-signal-green"
            }`}
            style={{
              backgroundColor: activeConfig
                ? getAccentHex(activeConfig.activeColor)
                : undefined,
            }}
          />
        )}
      </button>

      {/* ── Popover panel ── */}
      <div
        className={`absolute top-full left-0 mt-1.5 w-[min(300px,calc(100vw-2rem))] z-50 bg-void-black/90 backdrop-blur-md border border-white/10 rounded-xl shadow-xl p-3 max-h-[70vh] overflow-y-auto transition-all duration-150 ${
          open
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-1 pointer-events-none"
        }`}
        role="radiogroup"
        aria-label="Operating profiles"
      >
        {/* ── "None" option ── */}
        <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-1.5 px-0.5">
          Operating Profile
        </div>

        <div
          className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-white/5 transition-colors"
          role="radio"
          aria-checked={activeProfile === null}
          onClick={handleClearProfile}
        >
          {/* Radio dot */}
          <span
            className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
              activeProfile === null ? "border-signal-green" : "border-white/30"
            }`}
          >
            {activeProfile === null && (
              <span className="w-1.5 h-1.5 rounded-full bg-signal-green" />
            )}
          </span>

          <span
            className={`text-xs transition-colors ${
              activeProfile === null ? "text-white" : "text-white/60"
            }`}
          >
            None
          </span>
          <span className="text-[10px] text-white/30 ml-1">
            Custom layer configuration
          </span>
        </div>

        {/* ── Separator ── */}
        <div className="border-t border-white/5 my-2" />

        {/* ── Built-in Profiles ── */}
        <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-1.5 px-0.5">
          Built-in Profiles
        </div>

        {BUILTIN_PROFILE_ORDER.map((profileId) => {
          const cfg = getProfileConfig(profileId);
          const isActive = activeProfile === profileId;
          const accentClass = PROFILE_ACCENT[cfg.activeColor] ?? "";
          const ringClass =
            PROFILE_RING_COLOR[cfg.activeColor] ?? "border-white/30";

          return (
            <div
              key={profileId}
              className={`flex items-start gap-2 px-2 py-2 rounded-md cursor-pointer hover:bg-white/5 transition-colors ${
                isActive ? "bg-white/5" : ""
              }`}
              role="radio"
              aria-checked={isActive}
              onClick={() => handleProfileClick(profileId)}
            >
              {/* Radio dot */}
              <span
                className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors mt-0.5 ${
                  isActive ? ringClass : "border-white/30"
                }`}
              >
                {isActive && (
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: getAccentHex(cfg.activeColor) }}
                  />
                )}
              </span>

              {/* Profile icon */}
              <svg
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  isActive ? accentClass : "text-white/40"
                }`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={cfg.iconPath} />
              </svg>

              {/* Name + description */}
              <div className="flex-1 min-w-0">
                <span
                  className={`text-xs font-medium block transition-colors ${
                    isActive ? "text-white" : "text-white/70"
                  }`}
                >
                  {cfg.label}
                </span>
                <span className="text-[10px] text-white/30 block leading-snug mt-0.5">
                  {cfg.description}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function getAccentHex(color: string): string {
  const map: Record<string, string> = {
    "plasma-orange": "#f97316",
    "caution-amber": "#f59e0b",
    "cosmic-cyan": "#06b6d4",
    "alert-red": "#ef4444",
    "signal-green": "#22c55e",
  };
  return map[color] ?? "#ffffff";
}
