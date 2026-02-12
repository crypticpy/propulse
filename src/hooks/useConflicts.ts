/**
 * Hook for sync conflict resolution.
 *
 * Provides conflict state and resolution actions from the QSO store.
 */

import { useQSOStore } from "@/stores/qsoStore";

export function useConflicts() {
  const conflicts = useQSOStore((s) => s.conflicts);
  const resolveConflict = useQSOStore((s) => s.resolveConflict);
  const pendingSyncCount = useQSOStore((s) => s.pendingSyncCount);

  return {
    conflicts,
    conflictCount: conflicts.length,
    resolveConflict,
    pendingSyncCount,
    hasConflicts: conflicts.length > 0,
  };
}
