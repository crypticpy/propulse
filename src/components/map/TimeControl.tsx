/**
 * TimeControl Component
 *
 * Time offset slider for viewing terminator/greyline at different times.
 * Allows ±24 hours from current time. Useful for:
 * - Planning future contacts at optimal propagation windows
 * - Reviewing past greyline conditions
 * - Understanding how propagation changes throughout the day
 */

import { useState, useEffect } from "react";
import { useMapStore } from "@/stores/mapStore";
import { addHours } from "date-fns";
import { HelpButton, HelpModal } from "@/components/ui/HelpModal";

interface TimeControlProps {
  className?: string;
}

// Quick preset buttons for common offsets
const PRESETS = [
  { label: "-6h", value: -6 },
  { label: "Now", value: 0 },
  { label: "+6h", value: 6 },
  { label: "+12h", value: 12 },
];

export function TimeControl({ className = "" }: TimeControlProps) {
  const { timeOffset, setTimeOffset } = useMapStore();
  const [showHelp, setShowHelp] = useState(false);
  const [now, setNow] = useState(new Date());

  // Update time every second to stay in sync
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const displayTime = addHours(now, timeOffset);
  const isLive = timeOffset === 0;

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-gray-300 uppercase tracking-wide">
          Time Machine
        </h3>
        <HelpButton onClick={() => setShowHelp(true)} />
      </div>

      {/* Main time display - large and prominent */}
      <div className="flex items-center justify-center gap-3 mb-3">
        {/* Live indicator */}
        {isLive && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-signal-green/20 border border-signal-green/30">
            <span className="w-2 h-2 rounded-full bg-signal-green animate-pulse" />
            <span className="text-xs font-medium text-signal-green">LIVE</span>
          </div>
        )}

        {/* Time display - using UTC */}
        <div className="text-center">
          <div className="text-2xl font-mono font-bold text-white tracking-wide">
            {String(displayTime.getUTCHours()).padStart(2, "0")}:
            {String(displayTime.getUTCMinutes()).padStart(2, "0")}
            <span className="text-sm text-gray-400 ml-1">UTC</span>
          </div>
          <div className="text-xs text-gray-500">
            {displayTime.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })}
          </div>
        </div>

        {/* Offset badge when not live */}
        {!isLive && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-caution-amber/20 border border-caution-amber/30">
            <span className="text-xs font-mono font-medium text-caution-amber">
              {timeOffset > 0 ? "+" : ""}
              {timeOffset}h
            </span>
          </div>
        )}
      </div>

      {/* Quick presets */}
      <div className="flex gap-1 mb-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            onClick={() => setTimeOffset(preset.value)}
            className={`
              flex-1 px-2 py-1.5 text-xs font-medium rounded transition-all
              ${
                timeOffset === preset.value
                  ? preset.value === 0
                    ? "bg-signal-green text-black"
                    : "bg-plasma-orange text-white"
                  : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
              }
            `}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Time slider */}
      <div className="relative mt-auto">
        <input
          type="range"
          min={-24}
          max={24}
          step={1}
          value={timeOffset}
          onChange={(e) => setTimeOffset(Number(e.target.value))}
          aria-label="Time offset in hours"
          className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-4
            [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:bg-plasma-orange
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:shadow-glow-orange
            [&::-webkit-slider-thumb]:cursor-grab
            [&::-webkit-slider-thumb]:active:cursor-grabbing
            [&::-moz-range-thumb]:w-4
            [&::-moz-range-thumb]:h-4
            [&::-moz-range-thumb]:bg-plasma-orange
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:border-0
            [&::-moz-range-thumb]:cursor-grab"
        />

        {/* Tick marks */}
        <div className="flex justify-between mt-1 text-[10px] text-gray-500">
          <span>-24h</span>
          <span>-12h</span>
          <span className={isLive ? "text-signal-green font-medium" : ""}>
            0
          </span>
          <span>+12h</span>
          <span>+24h</span>
        </div>
      </div>

      {/* Help Modal */}
      <HelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        title="Time Machine"
        sections={[
          {
            title: "What is this?",
            content:
              "The Time Machine lets you simulate propagation conditions at different times. Move the slider to see how the greyline, terminator, and band conditions change throughout the day.",
          },
          {
            title: "Planning Contacts",
            content:
              "Use future times (+1h to +24h) to find the best window for working a specific path. The map and band conditions will update to show predicted propagation.",
          },
          {
            title: "Reviewing Conditions",
            content:
              "Use past times (-1h to -24h) to review recent propagation. Useful for understanding why a contact did or didn't work.",
          },
          {
            title: "Live Mode",
            content:
              "When set to 'Now', you're seeing real-time conditions. The LIVE indicator confirms you're viewing current propagation.",
          },
        ]}
      />
    </div>
  );
}
