/**
 * NCSRotationCalendar -- Weekly grid showing which operator is NCS each day.
 *
 * Displays a 7-day grid (Mon-Sun). Managers can click a cell to assign
 * a callsign via inline edit. Data is stored as a simple JSONB-style
 * array of { callsign, dayOfWeek } entries.
 */

import { useState, useCallback, useMemo } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface NCSRotationEntry {
  callsign: string;
  /** 0 = Sunday, 6 = Saturday */
  dayOfWeek: number;
}

export interface NCSRotationCalendarProps {
  rotation: NCSRotationEntry[];
  /** true when the authenticated user is a manager of this net */
  isManager: boolean;
  onUpdateRotation?: (rotation: NCSRotationEntry[]) => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Day labels ordered Mon(1)–Sun(0) for natural weekly display */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_LABELS: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

// ── Component ────────────────────────────────────────────────────────────────

export function NCSRotationCalendar({
  rotation,
  isManager,
  onUpdateRotation,
}: NCSRotationCalendarProps) {
  // Which day cell is being edited (-1 = none)
  const [editingDay, setEditingDay] = useState<number>(-1);
  const [editValue, setEditValue] = useState("");

  // Build a quick lookup: dayOfWeek → callsign
  const dayMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const entry of rotation) {
      map.set(entry.dayOfWeek, entry.callsign);
    }
    return map;
  }, [rotation]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const openEdit = useCallback(
    (day: number) => {
      if (!isManager) return;
      setEditingDay(day);
      setEditValue(dayMap.get(day) ?? "");
    },
    [isManager, dayMap],
  );

  const commitEdit = useCallback(() => {
    if (editingDay < 0) return;

    const trimmed = editValue.trim().toUpperCase();

    // Build new rotation array: replace or remove entry for this day
    const updated = rotation.filter((e) => e.dayOfWeek !== editingDay);
    if (trimmed) {
      updated.push({ callsign: trimmed, dayOfWeek: editingDay });
    }

    onUpdateRotation?.(updated);
    setEditingDay(-1);
    setEditValue("");
  }, [editingDay, editValue, rotation, onUpdateRotation]);

  const cancelEdit = useCallback(() => {
    setEditingDay(-1);
    setEditValue("");
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-panel/30 border border-white/5 rounded-2xl p-4">
      {/* Header */}
      <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-3">
        NCS Rotation
      </h3>

      {/* 7-day grid */}
      <div className="grid grid-cols-7 gap-1">
        {DAY_ORDER.map((day) => {
          const assignee = dayMap.get(day);
          const isEditing = editingDay === day;

          return (
            <div key={day} className="flex flex-col items-center">
              {/* Day label */}
              <span className="text-[10px] uppercase tracking-widest text-gray-500 text-center mb-1">
                {DAY_LABELS[day]}
              </span>

              {/* Cell */}
              {isEditing ? (
                <div className="bg-void/80 border border-plasma-orange/40 rounded-lg p-1 min-h-[40px] w-full flex items-center justify-center">
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                    onBlur={commitEdit}
                    autoFocus
                    className="w-full bg-transparent text-center text-xs font-mono text-white placeholder:text-gray-600 focus:outline-none"
                    placeholder="Call"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openEdit(day)}
                  disabled={!isManager}
                  className={`bg-void/50 border border-white/5 rounded-lg p-2 min-h-[40px] w-full flex items-center justify-center transition-colors ${
                    isManager
                      ? "hover:border-plasma-orange/30 hover:bg-void/70 cursor-pointer"
                      : "cursor-default"
                  }`}
                >
                  {assignee ? (
                    <span className="font-mono text-xs text-white truncate">
                      {assignee}
                    </span>
                  ) : (
                    <span className="text-gray-600 text-xs select-none">—</span>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Edit hint */}
      {isManager && (
        <p className="text-[10px] text-gray-600 mt-2 text-center">
          Click a day to assign NCS
        </p>
      )}
    </div>
  );
}
