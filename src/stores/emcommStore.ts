import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  ActivationLevel,
  EmCommIncident,
  FrequencyPlan,
  SitRepEntry,
  ICS213Message,
} from "@/types/emcomm";

const MAX_INCIDENTS = 50;

export interface EmCommState {
  // ── Persisted ──────────────────────────────────────────────────────
  activeIncident: EmCommIncident | null;
  frequencyPlans: FrequencyPlan[];
  selectedPlanId: string | null;
  incidents: EmCommIncident[]; // history of past incidents

  // ── Runtime (not persisted) ────────────────────────────────────────
  sitRepEntries: SitRepEntry[]; // current incident only
  ics213Messages: ICS213Message[]; // current incident only

  // ── Actions ────────────────────────────────────────────────────────
  startActivation: (incident: Omit<EmCommIncident, "id" | "startedAt">) => void;
  stopActivation: () => void;
  setLevel: (level: ActivationLevel) => void;
  updateActiveIncident: (
    patch: Partial<Pick<EmCommIncident, "notes" | "frequencyPlanId" | "level">>,
  ) => void;
  pinAlert: (alertId: string) => void;
  unpinAlert: (alertId: string) => void;
  addFrequencyPlan: (plan: Omit<FrequencyPlan, "id">) => void;
  removeFrequencyPlan: (id: string) => void;
  selectFrequencyPlan: (id: string | null) => void;
  addSitRep: (entry: Omit<SitRepEntry, "id" | "timestamp">) => void;
  removeSitRep: (id: string) => void;
  addICS213: (msg: Omit<ICS213Message, "id">) => void;
  removeICS213: (id: string) => void;
  clearRuntimeData: () => void;
}

export const useEmcommStore = create<EmCommState>()(
  persist(
    (set) => ({
      // Persisted defaults
      activeIncident: null,
      frequencyPlans: [],
      selectedPlanId: null,
      incidents: [],

      // Runtime
      sitRepEntries: [],
      ics213Messages: [],

      // Actions
      startActivation: (incident) =>
        set({
          activeIncident: {
            ...incident,
            id: crypto.randomUUID(),
            startedAt: new Date().toISOString(),
          },
          selectedPlanId: incident.frequencyPlanId ?? null,
          sitRepEntries: [],
          ics213Messages: [],
        }),

      stopActivation: () =>
        set((s) => {
          if (!s.activeIncident) return s;
          const closed: EmCommIncident = {
            ...s.activeIncident,
            endedAt: new Date().toISOString(),
          };
          const history = [closed, ...s.incidents].slice(0, MAX_INCIDENTS);
          return {
            activeIncident: null,
            selectedPlanId: null,
            incidents: history,
            sitRepEntries: [],
            ics213Messages: [],
          };
        }),

      setLevel: (level) =>
        set((s) => {
          if (!s.activeIncident) return s;
          return {
            activeIncident: { ...s.activeIncident, level },
          };
        }),

      updateActiveIncident: (patch) =>
        set((s) => {
          if (!s.activeIncident) return s;
          const updated = { ...s.activeIncident, ...patch };
          return {
            activeIncident: updated,
            // Keep selectedPlanId in sync when frequencyPlanId changes
            ...(patch.frequencyPlanId !== undefined
              ? { selectedPlanId: patch.frequencyPlanId }
              : {}),
          };
        }),

      pinAlert: (alertId) =>
        set((s) => {
          if (!s.activeIncident) return s;
          if (s.activeIncident.pinnedAlertIds.includes(alertId)) return s;
          return {
            activeIncident: {
              ...s.activeIncident,
              pinnedAlertIds: [...s.activeIncident.pinnedAlertIds, alertId],
            },
          };
        }),

      unpinAlert: (alertId) =>
        set((s) => {
          if (!s.activeIncident) return s;
          return {
            activeIncident: {
              ...s.activeIncident,
              pinnedAlertIds: s.activeIncident.pinnedAlertIds.filter(
                (id) => id !== alertId,
              ),
            },
          };
        }),

      addFrequencyPlan: (plan) =>
        set((s) => ({
          frequencyPlans: [
            ...s.frequencyPlans,
            { ...plan, id: crypto.randomUUID() },
          ],
        })),

      removeFrequencyPlan: (id) =>
        set((s) => ({
          frequencyPlans: s.frequencyPlans.filter((p) => p.id !== id),
          selectedPlanId: s.selectedPlanId === id ? null : s.selectedPlanId,
        })),

      selectFrequencyPlan: (id) => set({ selectedPlanId: id }),

      addSitRep: (entry) =>
        set((s) => ({
          sitRepEntries: [
            ...s.sitRepEntries,
            {
              ...entry,
              id: crypto.randomUUID(),
              timestamp: new Date().toISOString(),
            },
          ],
        })),

      removeSitRep: (id) =>
        set((s) => ({
          sitRepEntries: s.sitRepEntries.filter((e) => e.id !== id),
        })),

      addICS213: (msg) =>
        set((s) => ({
          ics213Messages: [
            ...s.ics213Messages,
            { ...msg, id: crypto.randomUUID() },
          ],
        })),

      removeICS213: (id) =>
        set((s) => ({
          ics213Messages: s.ics213Messages.filter((m) => m.id !== id),
        })),

      clearRuntimeData: () => set({ sitRepEntries: [], ics213Messages: [] }),
    }),
    {
      name: "propulse-emcomm",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted: unknown, _version: number) => {
        const state = persisted as Record<string, unknown>;
        // Future migrations go here
        return state as unknown as EmCommState;
      },
      partialize: (state) => ({
        activeIncident: state.activeIncident,
        frequencyPlans: state.frequencyPlans,
        selectedPlanId: state.selectedPlanId,
        incidents: state.incidents,
      }),
    },
  ),
);
