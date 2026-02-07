import { ConditionsPill } from "@/components/map/ConditionsPill";
import { HealthStatusIndicator } from "@/components/ui/HealthStatusIndicator";
import { SyncStatusIndicator } from "@/components/ui/SyncStatusIndicator";

interface MobileHeaderProps {
  /** Number of active alerts */
  alertCount: number;
  /** Number of critical alerts */
  criticalAlertCount: number;
  /** Callback when alert indicator is clicked */
  onAlertClick: () => void;
  /** Callback when settings gear is clicked */
  onSettingsClick: () => void;
}

/**
 * MobileHeader - Compact 48px fixed header for mobile viewports
 *
 * Left: brand mark, Center: propagation conditions pill, Right: alert bell + settings gear
 */
export function MobileHeader({
  alertCount,
  criticalAlertCount,
  onAlertClick,
  onSettingsClick,
}: MobileHeaderProps) {
  return (
    <header className="h-12 flex items-center justify-between px-3 bg-void-black/90 backdrop-blur-sm border-b border-white/10 pt-safe z-50">
      {/* Brand */}
      <div className="flex items-center gap-1.5">
        <span className="text-base">☀️</span>
        <span className="font-orbitron text-[11px] font-bold tracking-wider text-gradient-orange">
          PROPULSE
        </span>
      </div>

      {/* Center: Propagation conditions */}
      <ConditionsPill />

      {/* Right: alerts + settings */}
      <div className="flex items-center gap-2">
        {alertCount > 0 && (
          <button
            onClick={onAlertClick}
            className={`
              relative p-1.5 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center
              ${
                criticalAlertCount > 0
                  ? "text-alert-red hover:bg-alert-red/10 animate-pulse"
                  : "text-caution-amber hover:bg-caution-amber/10"
              }
            `}
            aria-label={`${alertCount} active alert${alertCount > 1 ? "s" : ""}${criticalAlertCount > 0 ? ` (${criticalAlertCount} critical)` : ""}`}
            title="Solar Weather Alerts"
          >
            {/* Bell icon SVG — matches Header.tsx */}
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            {/* Badge count */}
            <span
              className={`
                absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px]
                flex items-center justify-center
                text-[10px] font-bold rounded-full
                ${
                  criticalAlertCount > 0
                    ? "bg-alert-red text-white"
                    : "bg-caution-amber text-black"
                }
              `}
            >
              {alertCount}
            </span>
          </button>
        )}
        <SyncStatusIndicator />
        <HealthStatusIndicator />
        <button
          onClick={onSettingsClick}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Settings"
        >
          {/* Gear icon SVG — matches Header.tsx */}
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}
