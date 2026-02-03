/**
 * DateTimePicker Component
 *
 * A calendar-based date/time picker for the Time Machine.
 * Supports selecting any date/time with UTC display.
 */

import { useState, useMemo, useCallback } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
} from "date-fns";

export interface DateTimePickerProps {
  value: Date;
  onChange: (date: Date) => void;
  onClose: () => void;
  className?: string;
}

export function DateTimePicker({
  value,
  onChange,
  onClose,
  className = "",
}: DateTimePickerProps) {
  const [viewMonth, setViewMonth] = useState(value);
  const [selectedDate, setSelectedDate] = useState(value);
  const [hours, setHours] = useState(value.getUTCHours());
  const [minutes, setMinutes] = useState(value.getUTCMinutes());

  // Days in the current view month
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // Pad the beginning with empty slots for alignment
    const startDayOfWeek = getDay(monthStart);
    const paddedDays: (Date | null)[] = Array(startDayOfWeek).fill(null);

    return [...paddedDays, ...daysInMonth];
  }, [viewMonth]);

  // Handle date selection
  const handleDayClick = useCallback(
    (day: Date) => {
      const newDate = new Date(
        Date.UTC(
          day.getFullYear(),
          day.getMonth(),
          day.getDate(),
          hours,
          minutes,
          0,
          0,
        ),
      );
      setSelectedDate(newDate);
      onChange(newDate);
    },
    [hours, minutes, onChange],
  );

  // Handle time changes
  const handleTimeChange = useCallback(
    (newHours: number, newMinutes: number) => {
      setHours(newHours);
      setMinutes(newMinutes);
      const newDate = new Date(
        Date.UTC(
          selectedDate.getUTCFullYear(),
          selectedDate.getUTCMonth(),
          selectedDate.getUTCDate(),
          newHours,
          newMinutes,
          0,
          0,
        ),
      );
      setSelectedDate(newDate);
      onChange(newDate);
    },
    [selectedDate, onChange],
  );

  return (
    <div
      className={`bg-gray-900/95 backdrop-blur-md rounded-lg border border-white/10 shadow-xl p-3 ${className}`}
    >
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setViewMonth(subMonths(viewMonth, 1))}
          className="p-1 text-gray-400 hover:text-white transition-colors"
          aria-label="Previous month"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <span className="text-sm font-medium text-white">
          {format(viewMonth, "MMMM yyyy")}
        </span>
        <button
          onClick={() => setViewMonth(addMonths(viewMonth, 1))}
          className="p-1 text-gray-400 hover:text-white transition-colors"
          aria-label="Next month"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
          <div
            key={day}
            className="text-[10px] text-gray-500 text-center font-medium"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Days */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, index) => {
          if (!day) {
            return <div key={`empty-${index}`} className="w-7 h-7" />;
          }

          const isSelected = isSameDay(day, selectedDate);
          const isCurrentMonth = isSameMonth(day, viewMonth);
          const isToday = isSameDay(day, new Date());

          return (
            <button
              key={day.toISOString()}
              onClick={() => handleDayClick(day)}
              className={`
                w-7 h-7 text-xs rounded-full transition-all flex items-center justify-center
                ${
                  isSelected
                    ? "bg-plasma-orange text-white font-bold"
                    : isToday
                      ? "bg-cosmic-cyan/20 text-cosmic-cyan border border-cosmic-cyan/30"
                      : isCurrentMonth
                        ? "text-gray-300 hover:bg-white/10"
                        : "text-gray-600 hover:bg-white/5"
                }
              `}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>

      {/* Time Input */}
      <div className="border-t border-white/10 pt-3 mt-3">
        <div className="flex items-center justify-center gap-2">
          <label className="text-xs text-gray-400">UTC Time:</label>
          <input
            type="number"
            min={0}
            max={23}
            value={hours}
            onChange={(e) =>
              handleTimeChange(
                Math.max(0, Math.min(23, parseInt(e.target.value) || 0)),
                minutes,
              )
            }
            className="w-12 px-2 py-1 text-center text-sm bg-white/5 border border-white/10 rounded text-white focus:outline-none focus:border-plasma-orange"
            aria-label="Hours UTC"
          />
          <span className="text-gray-400">:</span>
          <input
            type="number"
            min={0}
            max={59}
            value={minutes}
            onChange={(e) =>
              handleTimeChange(
                hours,
                Math.max(0, Math.min(59, parseInt(e.target.value) || 0)),
              )
            }
            className="w-12 px-2 py-1 text-center text-sm bg-white/5 border border-white/10 rounded text-white focus:outline-none focus:border-plasma-orange"
            aria-label="Minutes UTC"
          />
          <span className="text-xs text-gray-500">UTC</span>
        </div>

        {/* Local time display */}
        <div className="text-center mt-2 text-xs text-gray-500">
          Local: {format(selectedDate, "h:mm a")}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2 mt-3 border-t border-white/10 pt-3">
        <button
          onClick={() => {
            const now = new Date();
            setSelectedDate(now);
            setViewMonth(now);
            setHours(now.getUTCHours());
            setMinutes(now.getUTCMinutes());
            onChange(now);
          }}
          className="flex-1 px-2 py-1.5 text-xs font-medium bg-signal-green/20 text-signal-green border border-signal-green/30 rounded hover:bg-signal-green/30 transition-colors"
        >
          Now
        </button>
        <button
          onClick={onClose}
          className="flex-1 px-2 py-1.5 text-xs font-medium bg-white/5 text-gray-300 border border-white/10 rounded hover:bg-white/10 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
