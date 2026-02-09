/**
 * useTimeFormat Hook
 *
 * Provides time formatting functions that respect the user's 12h/24h preference
 * from settingsStore. Use this hook in any component that displays times.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { use24h, formatTime, formatDateTime } = useTimeFormat();
 *   return <span>{formatTime(new Date())}</span>;
 * }
 * ```
 */

import { useCallback } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { formatLocal, formatLocalDateTime } from "@/lib/utils/time";

/**
 * Hook that provides time formatting aware of user's 12h/24h preference.
 *
 * Returns:
 * - `use24h`: boolean — true when user prefers 24-hour format
 * - `formatTime(date)`: formats a Date as local time string ("08:32" or "8:32 AM")
 * - `formatDateTime(date)`: formats a Date with date + time ("Jan 15, 2024 08:32")
 */
export function useTimeFormat() {
  const use24h = useSettingsStore((s) => s.timeFormat === "24h");

  const formatTime = useCallback(
    (date: Date) => formatLocal(date, use24h),
    [use24h],
  );

  const formatDateTime = useCallback(
    (date: Date) => formatLocalDateTime(date, use24h),
    [use24h],
  );

  return { use24h, formatTime, formatDateTime } as const;
}
