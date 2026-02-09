/**
 * NotificationSettings Component
 *
 * Allows users to configure notification/alert preferences including:
 * - Greyline alerts (sunrise/sunset)
 * - Geomagnetic storm warnings with Kp threshold
 * - Solar flare alerts
 * - Band opening notifications with band selector
 * - Sound enabled toggle
 */

import { useSettingsStore } from "@/stores/settingsStore";
import {
  ALL_BANDS,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type BandId,
  type NotificationPreferences,
} from "@/types/user";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { WatchAlertSettings } from "./WatchAlertSettings";

interface NotificationSettingsProps {
  className?: string;
}

/**
 * Band Chip for band selector
 */
function BandChip({
  band,
  selected,
  onClick,
  disabled = false,
}: {
  band: BandId;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        px-2 py-1 rounded text-xs font-medium transition-all
        ${
          selected
            ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
            : "bg-white/5 text-gray-400 border border-white/10 hover:border-white/20"
        }
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      {band}
    </button>
  );
}

/**
 * Kp Threshold Slider
 */
function KpSlider({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const kpColors: Record<number, string> = {
    1: "text-signal-green",
    2: "text-signal-green",
    3: "text-signal-green",
    4: "text-caution-yellow",
    5: "text-caution-yellow",
    6: "text-plasma-orange",
    7: "text-plasma-orange",
    8: "text-alert-red",
    9: "text-alert-red",
  };

  return (
    <div className={`space-y-2 ${disabled ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-400">Kp threshold:</label>
        <span
          className={`text-sm font-mono font-medium ${kpColors[value] || "text-white"}`}
        >
          {value}
        </span>
      </div>
      <input
        type="range"
        min={1}
        max={9}
        step={1}
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
        <span>1 (Quiet)</span>
        <span>5 (Storm)</span>
        <span>9 (Severe)</span>
      </div>
    </div>
  );
}

/**
 * NotificationSettings - Configure alert preferences
 */
export function NotificationSettings({
  className = "",
}: NotificationSettingsProps) {
  const notifications: NotificationPreferences =
    useSettingsStore((s) => s.notifications) ??
    DEFAULT_NOTIFICATION_PREFERENCES;
  const updateNotifications = useSettingsStore((s) => s.updateNotifications);

  const handleToggle = (key: keyof NotificationPreferences, value: boolean) => {
    updateNotifications({ [key]: value });
  };

  const handleKpChange = (value: number) => {
    updateNotifications({ stormAlertKpThreshold: value });
  };

  const handleBandToggle = (band: BandId) => {
    const currentBands = notifications.bandOpeningBands || [];
    const newBands = currentBands.includes(band)
      ? currentBands.filter((b) => b !== band)
      : [...currentBands, band];
    updateNotifications({ bandOpeningBands: newBands });
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Notifications
      </h3>

      {/* Notification toggles */}
      <div className="space-y-5">
        {/* Greyline alerts */}
        <div className="p-3 bg-nebula-blue rounded-lg border border-white/10">
          <ToggleSwitch
            checked={notifications.greylineAlerts}
            onChange={(checked) => handleToggle("greylineAlerts", checked)}
            label="Greyline alerts"
            description="Notify when greyline approaches your QTH for optimal low-band propagation"
          />
        </div>

        {/* Storm alerts with Kp threshold */}
        <div className="p-3 bg-nebula-blue rounded-lg border border-white/10 space-y-3">
          <ToggleSwitch
            checked={notifications.stormAlerts}
            onChange={(checked) => handleToggle("stormAlerts", checked)}
            label="Geomagnetic storm warnings"
            description="Alert when Kp index exceeds threshold"
          />
          <div className="pl-[52px]">
            <KpSlider
              value={notifications.stormAlertKpThreshold}
              onChange={handleKpChange}
              disabled={!notifications.stormAlerts}
            />
          </div>
        </div>

        {/* Solar flare alerts */}
        <div className="p-3 bg-nebula-blue rounded-lg border border-white/10">
          <ToggleSwitch
            checked={notifications.flareAlerts}
            onChange={(checked) => handleToggle("flareAlerts", checked)}
            label="Solar flare alerts"
            description="Notify about significant solar flare activity"
          />
        </div>

        {/* Band opening alerts with band selector */}
        <div className="p-3 bg-nebula-blue rounded-lg border border-white/10 space-y-3">
          <ToggleSwitch
            checked={notifications.bandOpeningAlerts}
            onChange={(checked) => handleToggle("bandOpeningAlerts", checked)}
            label="Band opening notifications"
            description="Alert when selected bands show activity between continents"
          />
          <div className="pl-[52px]">
            <div className="text-xs text-gray-400 mb-2">Monitor bands:</div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_BANDS.map((band) => (
                <BandChip
                  key={band}
                  band={band}
                  selected={
                    notifications.bandOpeningBands?.includes(band) || false
                  }
                  onClick={() => handleBandToggle(band)}
                  disabled={!notifications.bandOpeningAlerts}
                />
              ))}
            </div>
            {notifications.bandOpeningAlerts &&
              notifications.bandOpeningBands?.length === 0 && (
                <p className="text-xs text-caution-yellow mt-2">
                  Select at least one band to monitor
                </p>
              )}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/10" />

        {/* Sound toggle */}
        <div className="p-3 bg-nebula-blue rounded-lg border border-white/10">
          <ToggleSwitch
            checked={notifications.soundEnabled}
            onChange={(checked) => handleToggle("soundEnabled", checked)}
            label="Sound enabled"
            description="Play audio for notifications"
          />
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
            Push notifications coming soon. Currently, alerts display within the
            app when conditions change.
          </p>
        </div>

        {/* Divider before Watch Alerts */}
        <div className="border-t border-white/10 my-6" />

        {/* Watch Alert Settings */}
        <WatchAlertSettings />
      </div>
    </div>
  );
}
