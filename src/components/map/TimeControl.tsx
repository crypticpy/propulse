/**
 * TimeControl Component
 *
 * Time offset slider for viewing terminator/greyline at different times.
 * Allows ±24 hours from current time.
 */

import { useMapStore } from "@/stores/mapStore";
import { format, addHours } from "date-fns";

interface TimeControlProps {
  className?: string;
}

export function TimeControl({ className = "" }: TimeControlProps) {
  const { timeOffset, setTimeOffset } = useMapStore();
  const now = new Date();
  const displayTime = addHours(now, timeOffset);

  // Format time based on offset
  const formatDisplayTime = () => {
    if (timeOffset === 0) {
      return "Now";
    }
    const sign = timeOffset > 0 ? "+" : "";
    return `${sign}${timeOffset}h`;
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Time display */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400">Display Time</span>
        <div className="text-right">
          <div className="text-white font-mono">
            {format(displayTime, "HH:mm")} UTC
          </div>
          <div className="text-xs text-gray-500">
            {format(displayTime, "MMM d, yyyy")}
          </div>
        </div>
      </div>

      {/* Offset indicator */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">Offset</span>
        <span
          className={`font-mono ${timeOffset === 0 ? "text-signal-green" : "text-caution-amber"}`}
        >
          {formatDisplayTime()}
        </span>
      </div>

      {/* Time slider */}
      <div className="relative">
        <input
          type="range"
          min={-24}
          max={24}
          step={1}
          value={timeOffset}
          onChange={(e) => setTimeOffset(Number(e.target.value))}
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
        <div className="flex justify-between mt-1 text-[10px] text-gray-600">
          <span>-24h</span>
          <span>-12h</span>
          <span>Now</span>
          <span>+12h</span>
          <span>+24h</span>
        </div>
      </div>

      {/* Quick presets */}
      <div className="flex gap-2">
        <button
          onClick={() => setTimeOffset(-6)}
          className="flex-1 px-2 py-1 text-xs bg-white/5 hover:bg-white/10
            rounded border border-white/10 text-gray-400 hover:text-white transition-colors"
        >
          -6h
        </button>
        <button
          onClick={() => setTimeOffset(0)}
          className={`flex-1 px-2 py-1 text-xs rounded border transition-colors
            ${
              timeOffset === 0
                ? "bg-signal-green/20 border-signal-green/50 text-signal-green"
                : "bg-white/5 hover:bg-white/10 border-white/10 text-gray-400 hover:text-white"
            }`}
        >
          Now
        </button>
        <button
          onClick={() => setTimeOffset(6)}
          className="flex-1 px-2 py-1 text-xs bg-white/5 hover:bg-white/10
            rounded border border-white/10 text-gray-400 hover:text-white transition-colors"
        >
          +6h
        </button>
      </div>
    </div>
  );
}
