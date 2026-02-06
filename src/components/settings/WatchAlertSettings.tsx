/**
 * WatchAlertSettings Component
 *
 * Settings panel for configuring Watch System audio alerts.
 * Allows users to:
 * - Enable/disable audio alerts
 * - Control volume (0-100%)
 * - Toggle mute
 * - Configure cooldown period
 * - Enable/disable alerts per watch type
 * - Test alert sounds
 */

import { useState, useCallback } from "react";
import { useUserStore } from "@/stores/userStore";
import {
  DEFAULT_WATCH_ALERT_PREFERENCES,
  type WatchAlertPreferences,
  type WatchAlertType,
} from "@/types/user";
import {
  playAlertSound,
  playTestSound,
  initAudioContext,
  isAudioAvailable,
} from "@/lib/services/watchAudioService";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";

interface WatchAlertSettingsProps {
  className?: string;
}

/**
 * Volume Slider Component
 */
function VolumeSlider({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`space-y-2 ${disabled ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-400">Volume:</label>
        <span className="text-sm font-mono font-medium text-white">
          {value}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className={`
          w-full h-2 rounded-full appearance-none cursor-pointer
          bg-white/10
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-4
          [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-plasma-orange
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:transition-transform
          [&::-webkit-slider-thumb]:hover:scale-110
          [&::-moz-range-thumb]:w-4
          [&::-moz-range-thumb]:h-4
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-plasma-orange
          [&::-moz-range-thumb]:border-0
          [&::-moz-range-thumb]:cursor-pointer
          ${disabled ? "cursor-not-allowed [&::-webkit-slider-thumb]:cursor-not-allowed [&::-moz-range-thumb]:cursor-not-allowed" : ""}
        `}
      />
      <div className="flex justify-between text-[10px] text-gray-500">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

/**
 * Cooldown Selector Component
 */
function CooldownSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const options = [
    { label: "1 min", value: 60 },
    { label: "2 min", value: 120 },
    { label: "5 min", value: 300 },
    { label: "10 min", value: 600 },
    { label: "15 min", value: 900 },
  ];

  return (
    <div className={`space-y-2 ${disabled ? "opacity-50" : ""}`}>
      <label className="text-xs text-gray-400">Alert cooldown:</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => !disabled && onChange(opt.value)}
            disabled={disabled}
            className={`
              px-2 py-1 rounded text-xs font-medium transition-all
              ${
                value === opt.value
                  ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                  : "bg-white/5 text-gray-400 border border-white/10 hover:border-white/20"
              }
              ${disabled ? "cursor-not-allowed" : "cursor-pointer"}
            `}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-gray-500">
        Minimum time between alerts for the same watch
      </p>
    </div>
  );
}

/**
 * Test Sound Button Component
 */
function TestSoundButton({
  label,
  type,
  disabled = false,
}: {
  label: string;
  type?: WatchAlertType;
  disabled?: boolean;
}) {
  const [isPlaying, setIsPlaying] = useState(false);

  const handleClick = useCallback(async () => {
    if (isPlaying || disabled) {
      return;
    }

    // Initialize audio context on user interaction
    initAudioContext();

    setIsPlaying(true);
    try {
      if (type) {
        await playAlertSound(type);
      } else {
        await playTestSound();
      }
    } finally {
      // Small delay before allowing another play
      setTimeout(() => setIsPlaying(false), 500);
    }
  }, [isPlaying, disabled, type]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isPlaying}
      className={`
        px-3 py-1.5 rounded-lg text-xs font-medium transition-all
        flex items-center gap-1.5
        ${
          disabled
            ? "bg-white/5 text-gray-500 cursor-not-allowed"
            : isPlaying
              ? "bg-plasma-orange/30 text-plasma-orange cursor-wait"
              : "bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white border border-white/10"
        }
      `}
    >
      {/* Speaker icon */}
      <svg
        className={`w-3.5 h-3.5 ${isPlaying ? "animate-pulse" : ""}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
        />
      </svg>
      {label}
    </button>
  );
}

/**
 * WatchAlertSettings - Configure watch audio alert preferences
 */
export function WatchAlertSettings({
  className = "",
}: WatchAlertSettingsProps) {
  const { preferences, updatePreferences } = useUserStore();
  const watchAlerts: WatchAlertPreferences =
    preferences.watchAlerts ?? DEFAULT_WATCH_ALERT_PREFERENCES;

  const audioSupported = isAudioAvailable();

  const handleUpdate = useCallback(
    (updates: Partial<WatchAlertPreferences>) => {
      updatePreferences({
        watchAlerts: {
          ...watchAlerts,
          ...updates,
        },
      });
    },
    [watchAlerts, updatePreferences],
  );

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Watch Alerts
      </h3>

      {/* Audio not supported warning */}
      {!audioSupported && (
        <div className="flex items-start gap-2 p-3 bg-caution-yellow/10 rounded-lg border border-caution-yellow/30">
          <svg
            className="w-4 h-4 text-caution-yellow flex-shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <p className="text-xs text-caution-yellow">
            Audio alerts are not supported in this browser.
          </p>
        </div>
      )}

      {/* Main enable toggle */}
      <div className="p-3 bg-nebula-blue rounded-lg border border-white/10">
        <ToggleSwitch
          checked={watchAlerts.enabled}
          onChange={(checked) => handleUpdate({ enabled: checked })}
          disabled={!audioSupported}
          label="Enable audio alerts"
          description="Play sounds when watched items are spotted"
        />
      </div>

      {/* Mute and Volume controls */}
      <div className="p-3 bg-nebula-blue rounded-lg border border-white/10 space-y-4">
        <ToggleSwitch
          checked={!watchAlerts.muted}
          onChange={(checked) => handleUpdate({ muted: !checked })}
          disabled={!audioSupported || !watchAlerts.enabled}
          label="Sound on"
          description="Quick mute without disabling alerts"
        />

        <div className="pl-[52px]">
          <VolumeSlider
            value={watchAlerts.volume}
            onChange={(value) => handleUpdate({ volume: value })}
            disabled={
              !audioSupported || !watchAlerts.enabled || watchAlerts.muted
            }
          />
        </div>
      </div>

      {/* Alert type toggles */}
      <div className="p-3 bg-nebula-blue rounded-lg border border-white/10 space-y-3">
        <div className="text-xs text-gray-400 mb-2 font-medium">
          Alert by watch type:
        </div>

        <ToggleSwitch
          checked={watchAlerts.callsignAlerts}
          onChange={(checked) => handleUpdate({ callsignAlerts: checked })}
          disabled={!audioSupported || !watchAlerts.enabled}
          label="Callsign watches"
          description="Alert when a watched callsign is spotted"
        />

        <ToggleSwitch
          checked={watchAlerts.gridAlerts}
          onChange={(checked) => handleUpdate({ gridAlerts: checked })}
          disabled={!audioSupported || !watchAlerts.enabled}
          label="Grid watches"
          description="Alert when activity in a watched grid"
        />

        <ToggleSwitch
          checked={watchAlerts.entityAlerts}
          onChange={(checked) => handleUpdate({ entityAlerts: checked })}
          disabled={!audioSupported || !watchAlerts.enabled}
          label="Entity/DXCC watches"
          description="Alert when a watched DXCC entity is spotted"
        />
      </div>

      {/* Cooldown setting */}
      <div className="p-3 bg-nebula-blue rounded-lg border border-white/10">
        <CooldownSelector
          value={watchAlerts.cooldownSeconds}
          onChange={(value) => handleUpdate({ cooldownSeconds: value })}
          disabled={!audioSupported || !watchAlerts.enabled}
        />
      </div>

      {/* Divider */}
      <div className="border-t border-white/10" />

      {/* Test sounds */}
      <div className="p-3 bg-nebula-blue rounded-lg border border-white/10 space-y-3">
        <div className="text-xs text-gray-400 font-medium">
          Test alert sounds:
        </div>
        <div className="flex flex-wrap gap-2">
          <TestSoundButton
            label="Callsign"
            type="callsign"
            disabled={
              !audioSupported || !watchAlerts.enabled || watchAlerts.muted
            }
          />
          <TestSoundButton
            label="Grid"
            type="grid"
            disabled={
              !audioSupported || !watchAlerts.enabled || watchAlerts.muted
            }
          />
          <TestSoundButton
            label="Entity"
            type="entity"
            disabled={
              !audioSupported || !watchAlerts.enabled || watchAlerts.muted
            }
          />
          <TestSoundButton
            label="All sounds"
            disabled={
              !audioSupported || !watchAlerts.enabled || watchAlerts.muted
            }
          />
        </div>
        <p className="text-[10px] text-gray-500">
          Each watch type has a distinct sound to help identify alert sources
        </p>
      </div>

      {/* Info notice */}
      <div className="flex items-start gap-2 p-3 bg-white/5 rounded-lg border border-white/5">
        <svg
          className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-xs text-gray-500">
          Audio alerts require user interaction (click/tap) before sounds can
          play. The Watch Indicator badge will pulse when alerts trigger.
        </p>
      </div>
    </div>
  );
}
