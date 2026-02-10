/**
 * TimeControl Component - Enhanced Time Machine
 *
 * Full-featured time control with:
 * - Date/time picker for any past/future date
 * - Quick presets (sunrise, sunset, greyline, contest start)
 * - Scenario storage for saving/recalling favorite times
 * - Visual timeline scrubber with play/animate capability
 */

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useLayoutEffect,
} from "react";
import { createPortal } from "react-dom";
import {
  useMapStore,
  getDisplayTime,
  type TargetLocation,
} from "@/stores/mapStore";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { addHours, format, differenceInHours, nextSaturday } from "date-fns";
import { HelpButton, HelpModal } from "@/components/ui/HelpModal";
import { DateTimePicker } from "./DateTimePicker";
import { useTimeFormat } from "@/hooks/useTimeFormat";
import SunCalc from "suncalc";

interface TimeControlProps {
  className?: string;
}

// Time preset definition
interface TimePreset {
  id: string;
  label: string;
  icon: string;
  getTime: (
    station: { lat: number; lon: number } | null,
    target: TargetLocation | null,
  ) => Date | null;
  description: string;
}

// Quick preset buttons for hour offsets
const OFFSET_PRESETS = [
  { label: "-6h", value: -6 },
  { label: "Now", value: 0 },
  { label: "+6h", value: 6 },
  { label: "+12h", value: 12 },
];

// Smart presets that calculate specific times
const SMART_PRESETS: TimePreset[] = [
  {
    id: "sunrise-qth",
    label: "Sunrise @ QTH",
    icon: "sunrise",
    description: "Next sunrise at your location",
    getTime: (station) => {
      if (!station) {
        return null;
      }
      const now = new Date();
      const times = SunCalc.getTimes(now, station.lat, station.lon);
      if (times.sunrise && times.sunrise > now) {
        return times.sunrise;
      }
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowTimes = SunCalc.getTimes(
        tomorrow,
        station.lat,
        station.lon,
      );
      return tomorrowTimes.sunrise || null;
    },
  },
  {
    id: "sunset-qth",
    label: "Sunset @ QTH",
    icon: "sunset",
    description: "Next sunset at your location",
    getTime: (station) => {
      if (!station) {
        return null;
      }
      const now = new Date();
      const times = SunCalc.getTimes(now, station.lat, station.lon);
      if (times.sunset && times.sunset > now) {
        return times.sunset;
      }
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowTimes = SunCalc.getTimes(
        tomorrow,
        station.lat,
        station.lon,
      );
      return tomorrowTimes.sunset || null;
    },
  },
  {
    id: "sunrise-target",
    label: "Sunrise @ Target",
    icon: "target-sunrise",
    description: "Next sunrise at target location",
    getTime: (_, target) => {
      if (!target) {
        return null;
      }
      const now = new Date();
      const times = SunCalc.getTimes(now, target.lat, target.lon);
      if (times.sunrise && times.sunrise > now) {
        return times.sunrise;
      }
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowTimes = SunCalc.getTimes(tomorrow, target.lat, target.lon);
      return tomorrowTimes.sunrise || null;
    },
  },
  {
    id: "sunset-target",
    label: "Sunset @ Target",
    icon: "target-sunset",
    description: "Next sunset at target location",
    getTime: (_, target) => {
      if (!target) {
        return null;
      }
      const now = new Date();
      const times = SunCalc.getTimes(now, target.lat, target.lon);
      if (times.sunset && times.sunset > now) {
        return times.sunset;
      }
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowTimes = SunCalc.getTimes(tomorrow, target.lat, target.lon);
      return tomorrowTimes.sunset || null;
    },
  },
  {
    id: "contest-start",
    label: "Contest Start",
    icon: "contest",
    description: "Next Saturday 00:00 UTC (common contest start)",
    getTime: () => {
      const now = new Date();
      const saturday = nextSaturday(now);
      return new Date(
        Date.UTC(
          saturday.getFullYear(),
          saturday.getMonth(),
          saturday.getDate(),
          0,
          0,
          0,
          0,
        ),
      );
    },
  },
  {
    id: "peak-greyline",
    label: "Peak Greyline",
    icon: "greyline",
    description: "Optimal greyline time for path (both stations in twilight)",
    getTime: (station, target) => {
      if (!station || !target) {
        return null;
      }
      const now = new Date();
      const stationTimes = SunCalc.getTimes(now, station.lat, station.lon);
      const targetTimes = SunCalc.getTimes(now, target.lat, target.lon);

      if (stationTimes.sunset && targetTimes.sunrise) {
        const avgTime = new Date(
          (stationTimes.sunset.getTime() + targetTimes.sunrise.getTime()) / 2,
        );
        if (avgTime > now) {
          return avgTime;
        }
      }
      if (stationTimes.sunrise && targetTimes.sunset) {
        const avgTime = new Date(
          (stationTimes.sunrise.getTime() + targetTimes.sunset.getTime()) / 2,
        );
        if (avgTime > now) {
          return avgTime;
        }
      }
      return null;
    },
  },
];

// Preset icon component
function PresetIcon({
  type,
  className = "",
}: {
  type: string;
  className?: string;
}) {
  const iconClass = `w-3.5 h-3.5 ${className}`;

  switch (type) {
    case "sunrise":
      return (
        <svg
          className={iconClass}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      );
    case "sunset":
      return (
        <svg
          className={iconClass}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M12 10v8M4.93 10.93l2.83 2.83M16.24 13.76l2.83-2.83M2 18h4M18 18h4" />
          <path d="M7 18a5 5 0 0110 0" />
        </svg>
      );
    case "target-sunrise":
    case "target-sunset":
      return (
        <svg
          className={iconClass}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="12" cy="12" r="3" />
          <circle cx="12" cy="12" r="8" strokeDasharray="4 2" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
        </svg>
      );
    case "contest":
      return (
        <svg
          className={iconClass}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0012 0V2z" />
        </svg>
      );
    case "greyline":
      return (
        <svg
          className={iconClass}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="12" cy="12" r="10" />
          <path
            d="M12 2a10 10 0 000 20"
            fill="currentColor"
            fillOpacity={0.3}
          />
          <path d="M2 12h20" strokeDasharray="2 2" />
        </svg>
      );
    default:
      return (
        <svg
          className={iconClass}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      );
  }
}

export function TimeControl({ className = "" }: TimeControlProps) {
  const { use24h } = useTimeFormat();
  const {
    timeOffset,
    setTimeOffset,
    absoluteTime,
    setAbsoluteTime,
    target,
    timeScenarios,
    addTimeScenario,
    removeTimeScenario,
    applyTimeScenario,
  } = useMapStore();

  const activeLocation = useActiveLocation();
  const station = activeLocation
    ? { lat: activeLocation.lat, lon: activeLocation.lon }
    : null;

  const [showHelp, setShowHelp] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showScenarios, setShowScenarios] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const [newScenarioName, setNewScenarioName] = useState("");
  const [now, setNow] = useState(new Date());

  // Ref for positioning portal-based popovers
  const headerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverRect, setPopoverRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const popoverOpen = showPresets || showScenarios;

  // Measure header position whenever a popover opens / window resizes
  useLayoutEffect(() => {
    if (!popoverOpen) {
      setPopoverRect(null);
      return;
    }

    const measure = () => {
      if (!headerRef.current) return;
      const r = headerRef.current.getBoundingClientRect();
      setPopoverRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [popoverOpen]);

  // Close popovers on click outside or Escape
  useEffect(() => {
    if (!popoverOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (headerRef.current?.contains(t) || popoverRef.current?.contains(t))
        return;
      setShowPresets(false);
      setShowScenarios(false);
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowPresets(false);
        setShowScenarios(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [popoverOpen]);

  // Update time every second
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Play/animate time
  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const interval = setInterval(() => {
      const current = getDisplayTime();
      const newTime = addHours(current, playSpeed / 60);
      setAbsoluteTime(newTime.toISOString());
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, playSpeed, setAbsoluteTime]);

  const displayTime = useMemo(() => {
    if (absoluteTime) {
      return new Date(absoluteTime);
    }
    return addHours(now, timeOffset);
  }, [absoluteTime, now, timeOffset]);

  const isLive = timeOffset === 0 && !absoluteTime;
  const offsetFromNow = absoluteTime
    ? differenceInHours(new Date(absoluteTime), now)
    : timeOffset;

  const handlePresetSelect = useCallback(
    (preset: TimePreset) => {
      const time = preset.getTime(station, target);
      if (time) {
        setAbsoluteTime(time.toISOString());
        setShowPresets(false);
      }
    },
    [station, target, setAbsoluteTime],
  );

  const handleReturnToLive = useCallback(() => {
    setTimeOffset(0);
    setAbsoluteTime(null);
    setIsPlaying(false);
  }, [setTimeOffset, setAbsoluteTime]);

  const handleDateTimeChange = useCallback(
    (date: Date) => {
      setAbsoluteTime(date.toISOString());
    },
    [setAbsoluteTime],
  );

  const handleSaveScenario = useCallback(() => {
    if (!newScenarioName.trim()) {
      return;
    }
    addTimeScenario(newScenarioName.trim(), displayTime, target);
    setNewScenarioName("");
    setShowScenarios(false);
  }, [newScenarioName, displayTime, target, addTimeScenario]);

  const availablePresets = useMemo(() => {
    return SMART_PRESETS.filter((preset) => {
      const time = preset.getTime(station, target);
      return time !== null;
    });
  }, [station, target]);

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div
        ref={headerRef}
        className="relative flex items-center justify-between mb-2"
      >
        <h3 className="text-xs font-medium text-gray-300 uppercase tracking-wide">
          Time Machine
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setShowPresets(!showPresets);
              if (!showPresets) setShowScenarios(false);
            }}
            className={`p-1 rounded transition-colors ${
              showPresets
                ? "bg-plasma-orange/20 text-plasma-orange"
                : "text-gray-400 hover:text-white hover:bg-white/10"
            }`}
            title="Smart presets"
            aria-label="Toggle smart presets"
          >
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
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </button>
          <button
            onClick={() => {
              setShowScenarios(!showScenarios);
              if (!showScenarios) setShowPresets(false);
            }}
            className={`p-1 rounded transition-colors ${
              showScenarios
                ? "bg-plasma-orange/20 text-plasma-orange"
                : "text-gray-400 hover:text-white hover:bg-white/10"
            }`}
            title="Saved scenarios"
            aria-label="Toggle saved scenarios"
          >
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
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
              />
            </svg>
          </button>
          <HelpButton onClick={() => setShowHelp(true)} />
        </div>
      </div>

      {/* Portal-rendered popovers — escape Card's backdrop-blur stacking context */}
      {popoverOpen &&
        popoverRect &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              top: popoverRect.top,
              left: popoverRect.left,
              width: popoverRect.width,
              zIndex: 9999,
            }}
          >
            {/* Smart presets popover */}
            {showPresets && (
              <div className="p-2 bg-void-black/95 backdrop-blur-md rounded-lg border border-white/10 shadow-lg shadow-black/50">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">
                  Smart Presets
                </div>
                <div className="space-y-1">
                  {availablePresets.map((preset) => {
                    const time = preset.getTime(station, target);
                    return (
                      <button
                        key={preset.id}
                        onClick={() => handlePresetSelect(preset)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs rounded hover:bg-white/10 transition-colors group"
                        title={preset.description}
                      >
                        <PresetIcon
                          type={preset.icon}
                          className="text-gray-400 group-hover:text-plasma-orange"
                        />
                        <span className="flex-1 text-gray-300 group-hover:text-white">
                          {preset.label}
                        </span>
                        {time && (
                          <span className="text-gray-500 font-mono text-[10px]">
                            {format(time, use24h ? "HH:mm" : "h:mm a")} UTC
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {availablePresets.length === 0 && (
                    <div className="text-xs text-gray-500 text-center py-2">
                      Set your station location to enable presets
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Scenarios popover */}
            {showScenarios && (
              <div className="p-2 bg-void-black/95 backdrop-blur-md rounded-lg border border-white/10 shadow-lg shadow-black/50">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">
                  Saved Scenarios
                </div>

                <div className="flex gap-1 mb-2">
                  <input
                    type="text"
                    value={newScenarioName}
                    onChange={(e) => setNewScenarioName(e.target.value)}
                    placeholder="Scenario name..."
                    className="flex-1 px-2 py-1 text-xs bg-white/5 border border-white/10 rounded text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange"
                    onKeyDown={(e) => e.key === "Enter" && handleSaveScenario()}
                  />
                  <button
                    onClick={handleSaveScenario}
                    disabled={!newScenarioName.trim()}
                    className="px-2 py-1 text-xs font-medium bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/30 rounded hover:bg-plasma-orange/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>
                </div>

                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {timeScenarios.map((scenario) => (
                    <div
                      key={scenario.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/10 transition-colors group"
                    >
                      <button
                        onClick={() => applyTimeScenario(scenario.id)}
                        className="flex-1 text-left"
                      >
                        <div className="text-xs text-gray-300 group-hover:text-white">
                          {scenario.name}
                        </div>
                        <div className="text-[10px] text-gray-500">
                          {format(
                            new Date(scenario.time),
                            use24h ? "MMM d, HH:mm" : "MMM d, h:mm a",
                          )}{" "}
                          UTC
                          {scenario.target &&
                            ` - ${scenario.target.name || scenario.target.grid}`}
                        </div>
                      </button>
                      <button
                        onClick={() => removeTimeScenario(scenario.id)}
                        className="p-1 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete scenario"
                      >
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
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
                  ))}
                  {timeScenarios.length === 0 && (
                    <div className="text-xs text-gray-500 text-center py-2">
                      No saved scenarios
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>,
          document.body,
        )}

      {/* Main time display */}
      <div className="flex items-center justify-center gap-3 mb-3">
        {isLive && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-signal-green/20 border border-signal-green/30">
            <span className="w-2 h-2 rounded-full bg-signal-green animate-pulse" />
            <span className="text-xs font-medium text-signal-green">LIVE</span>
          </div>
        )}

        <button
          onClick={() => setShowDatePicker(!showDatePicker)}
          className="text-center group cursor-pointer"
          title="Click to pick date/time"
        >
          <div className="text-2xl font-mono font-bold text-white tracking-wide group-hover:text-plasma-orange transition-colors">
            {String(displayTime.getUTCHours()).padStart(2, "0")}:
            {String(displayTime.getUTCMinutes()).padStart(2, "0")}
            <span className="text-sm text-gray-400 ml-1">UTC</span>
          </div>
          <div className="text-xs text-gray-500 group-hover:text-gray-400 transition-colors">
            {displayTime.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })}
          </div>
        </button>

        {!isLive && (
          <button
            onClick={handleReturnToLive}
            className="flex items-center gap-1 px-2 py-1 rounded-full bg-caution-amber/20 border border-caution-amber/30 hover:bg-caution-amber/30 transition-colors"
            title="Return to live"
          >
            <span className="text-xs font-mono font-medium text-caution-amber">
              {offsetFromNow > 0 ? "+" : ""}
              {Math.round(offsetFromNow)}h
            </span>
          </button>
        )}
      </div>

      {/* Date picker dropdown */}
      {showDatePicker && (
        <div className="relative mb-3">
          <DateTimePicker
            value={displayTime}
            onChange={handleDateTimeChange}
            onClose={() => setShowDatePicker(false)}
            className="absolute z-50 left-0 right-0"
          />
        </div>
      )}

      {/* Quick offset presets */}
      <div className="flex gap-1 mb-2">
        {OFFSET_PRESETS.map((preset) => (
          <button
            key={preset.value}
            onClick={() => {
              setTimeOffset(preset.value);
              setIsPlaying(false);
            }}
            className={`
              flex-1 px-2 py-1.5 text-xs font-medium rounded transition-all
              ${
                isLive && preset.value === 0
                  ? "bg-signal-green text-black"
                  : timeOffset === preset.value && !absoluteTime
                    ? "bg-plasma-orange text-white"
                    : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
              }
            `}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Time slider with play controls */}
      <div className="relative mt-auto">
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`p-1.5 rounded transition-colors ${
              isPlaying
                ? "bg-plasma-orange text-white"
                : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
            }`}
            title={isPlaying ? "Pause" : "Play through time"}
          >
            {isPlaying ? (
              <svg
                className="w-3.5 h-3.5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg
                className="w-3.5 h-3.5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {isPlaying && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPlaySpeed(Math.max(0.5, playSpeed - 0.5))}
                className="px-1.5 py-0.5 text-[10px] bg-white/5 text-gray-400 rounded hover:bg-white/10"
              >
                -
              </button>
              <span className="text-[10px] text-gray-400 w-12 text-center">
                {playSpeed}x speed
              </span>
              <button
                onClick={() => setPlaySpeed(Math.min(10, playSpeed + 0.5))}
                className="px-1.5 py-0.5 text-[10px] bg-white/5 text-gray-400 rounded hover:bg-white/10"
              >
                +
              </button>
            </div>
          )}
        </div>

        <input
          type="range"
          min={-24}
          max={24}
          step={0.5}
          value={absoluteTime ? offsetFromNow : timeOffset}
          onChange={(e) => {
            const value = Number(e.target.value);
            if (absoluteTime) {
              const newTime = addHours(now, value);
              setAbsoluteTime(newTime.toISOString());
            } else {
              setTimeOffset(value);
            }
          }}
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
              "The Time Machine lets you simulate propagation conditions at different times. Move the slider or click the time display to pick any date/time.",
          },
          {
            title: "Smart Presets",
            content:
              "Use smart presets to quickly jump to sunrise, sunset, or optimal greyline times at your station or target location. The 'Contest Start' preset jumps to the next Saturday 00:00 UTC.",
          },
          {
            title: "Saved Scenarios",
            content:
              "Save your current time and target as a 'scenario' for quick recall. Great for planning DX sessions or remembering optimal times for specific paths.",
          },
          {
            title: "Play/Animate",
            content:
              "Use the play button to animate through time and watch how propagation conditions change. Adjust the speed to go faster or slower.",
          },
          {
            title: "Live Mode",
            content:
              "Click 'Now' or the offset badge to return to real-time conditions. The LIVE indicator confirms you're viewing current propagation.",
          },
        ]}
      />
    </div>
  );
}
