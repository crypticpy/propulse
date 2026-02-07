/**
 * Zustand store for radio equipment and station configuration
 * Decomposed from the monolithic userStore.ts
 * Persists to localStorage with key 'propulse-shack'
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { UserRadio, LegacyUserRadio, RadioEquipment } from "@/types/radio";
import type {
  UserAntenna,
  UserFeedline,
  UserAccessory,
  StationPreset,
} from "@/types/shack";
import {
  MAX_ANTENNAS,
  MAX_FEEDLINES,
  MAX_ACCESSORIES,
  MAX_PRESETS,
} from "@/types/shack";
import { getRadioById } from "@/lib/data/radios";

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_RADIOS = 10;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isLegacyUserRadio(value: unknown): value is LegacyUserRadio {
  return (
    typeof value === "object" &&
    value !== null &&
    "radioId" in value &&
    typeof (value as { radioId: unknown }).radioId === "string"
  );
}

function isUserRadio(value: unknown): value is UserRadio {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "equipmentId" in value &&
    typeof (value as { id: unknown }).id === "string" &&
    typeof (value as { equipmentId: unknown }).equipmentId === "string"
  );
}

function createUserRadioInstance(params: {
  equipmentId: string;
  nickname?: string;
  customPowerLimit?: number;
  addedAt?: string;
}): UserRadio {
  return {
    id: crypto.randomUUID(),
    equipmentId: params.equipmentId,
    nickname: params.nickname,
    customPowerLimit: params.customPowerLimit,
    addedAt: params.addedAt ?? new Date().toISOString(),
  };
}

function resolveEquipmentById(
  id: string,
  customRadios: RadioEquipment[] | undefined,
): RadioEquipment | undefined {
  const custom = customRadios?.find((r) => r.id === id);
  return custom ?? getRadioById(id);
}

// ─── Store interface ─────────────────────────────────────────────────────────

interface ShackStore {
  radios: UserRadio[];
  customRadios: RadioEquipment[];
  activeRadioId: string | null;
  antennas: UserAntenna[];
  feedlines: UserFeedline[];
  accessories: UserAccessory[];
  stationPresets: StationPreset[];
  activePresetId: string | null;

  // Radio actions
  addRadio: (radioId: string, nickname?: string) => string | null;
  addRadioInstance: (radioId: string, nickname?: string) => string | null;
  updateRadioInstance: (
    id: string,
    updates: Partial<Omit<UserRadio, "id" | "equipmentId" | "addedAt">>,
  ) => { ok: true } | { ok: false; error: string };
  removeRadio: (radioId: string) => void;
  setActiveRadio: (radioId: string | null) => void;
  addCustomRadio: (
    radio: Omit<RadioEquipment, "id">,
  ) => { ok: true; id: string } | { ok: false; error: string };
  updateCustomRadio: (
    id: string,
    updates: Partial<Omit<RadioEquipment, "id">>,
  ) => { ok: true } | { ok: false; error: string };
  removeCustomRadio: (id: string) => void;

  // Antenna actions
  addAntenna: (antenna: Omit<UserAntenna, "id" | "addedAt">) => string | null;
  updateAntenna: (
    id: string,
    updates: Partial<Omit<UserAntenna, "id" | "addedAt">>,
  ) => { ok: true } | { ok: false; error: string };
  removeAntenna: (id: string) => void;

  // Feedline actions
  addFeedline: (
    feedline: Omit<UserFeedline, "id" | "addedAt">,
  ) => string | null;
  updateFeedline: (
    id: string,
    updates: Partial<Omit<UserFeedline, "id" | "addedAt">>,
  ) => { ok: true } | { ok: false; error: string };
  removeFeedline: (id: string) => void;

  // Accessory actions
  addAccessory: (
    accessory: Omit<UserAccessory, "id" | "addedAt">,
  ) => string | null;
  updateAccessory: (
    id: string,
    updates: Partial<Omit<UserAccessory, "id" | "addedAt">>,
  ) => { ok: true } | { ok: false; error: string };
  removeAccessory: (id: string) => void;

  // Preset actions
  addPreset: (preset: Omit<StationPreset, "id" | "createdAt">) => string | null;
  updatePreset: (
    id: string,
    updates: Partial<Omit<StationPreset, "id" | "createdAt">>,
  ) => { ok: true } | { ok: false; error: string };
  removePreset: (id: string) => void;
  setActivePreset: (id: string | null) => void;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useShackStore = create<ShackStore>()(
  persist(
    (set) => ({
      radios: [],
      customRadios: [],
      activeRadioId: null,
      antennas: [],
      feedlines: [],
      accessories: [],
      stationPresets: [],
      activePresetId: null,

      addRadio: (radioId, nickname) => {
        let instanceId: string | null = null;

        set((state) => {
          const existing = state.radios.find((r) => r.equipmentId === radioId);
          if (existing) {
            instanceId = existing.id;
            return state;
          }

          if (state.radios.length >= MAX_RADIOS) return state;

          const newRadio = createUserRadioInstance({
            equipmentId: radioId,
            nickname,
          });
          instanceId = newRadio.id;

          const updatedRadios = [...state.radios, newRadio];
          const activeRadioId =
            state.activeRadioId ||
            (updatedRadios.length === 1 ? newRadio.id : null);

          return { radios: updatedRadios, activeRadioId };
        });

        return instanceId;
      },

      addRadioInstance: (radioId, nickname) => {
        let instanceId: string | null = null;

        set((state) => {
          if (state.radios.length >= MAX_RADIOS) return state;

          const newRadio = createUserRadioInstance({
            equipmentId: radioId,
            nickname,
          });
          instanceId = newRadio.id;

          const updatedRadios = [...state.radios, newRadio];
          const activeRadioId = state.activeRadioId || newRadio.id;

          return { radios: updatedRadios, activeRadioId };
        });

        return instanceId;
      },

      updateRadioInstance: (id, updates) => {
        let result: { ok: true } | { ok: false; error: string } = { ok: true };

        set((state) => {
          const idx = state.radios.findIndex((r) => r.id === id);
          if (idx === -1) {
            result = { ok: false, error: "Radio instance not found" };
            return state;
          }

          if (
            typeof updates.customPowerLimit === "number" &&
            (!Number.isFinite(updates.customPowerLimit) ||
              updates.customPowerLimit <= 0)
          ) {
            result = {
              ok: false,
              error: "Power limit must be a positive number",
            };
            return state;
          }

          const next = state.radios.map((r, i) =>
            i === idx ? { ...r, ...updates } : r,
          );

          return { radios: next };
        });

        return result;
      },

      removeRadio: (radioId) =>
        set((state) => {
          const updatedRadios = state.radios.filter((r) => r.id !== radioId);
          const activeRadioId =
            state.activeRadioId === radioId
              ? updatedRadios.length > 0
                ? updatedRadios[0].id
                : null
              : state.activeRadioId;
          return { radios: updatedRadios, activeRadioId };
        }),

      setActiveRadio: (radioId) => set({ activeRadioId: radioId }),

      addCustomRadio: (radio) => {
        const id = `custom-${crypto.randomUUID()}`;
        const displayName = radio.displayName?.trim();
        if (!displayName) {
          return { ok: false, error: "Custom radio name is required" };
        }

        let result: { ok: true; id: string } | { ok: false; error: string } = {
          ok: true,
          id,
        };

        set((state) => {
          const existing = state.customRadios || [];
          const normalized = displayName.toLowerCase();
          const hasDuplicate = existing.some(
            (r) => (r.displayName || "").trim().toLowerCase() === normalized,
          );
          if (hasDuplicate) {
            result = {
              ok: false,
              error: `A custom radio named "${displayName}" already exists`,
            };
            return state;
          }

          return {
            customRadios: [...existing, { ...radio, id, displayName }],
          };
        });

        return result;
      },

      updateCustomRadio: (id, updates) => {
        let result: { ok: true } | { ok: false; error: string } = { ok: true };

        set((state) => {
          const existing = state.customRadios || [];
          const idx = existing.findIndex((r) => r.id === id);
          if (idx === -1) {
            result = { ok: false, error: "Custom radio not found" };
            return state;
          }

          const nextDisplayName =
            typeof updates.displayName === "string"
              ? updates.displayName.trim()
              : existing[idx].displayName;

          if (!nextDisplayName) {
            result = { ok: false, error: "Custom radio name is required" };
            return state;
          }

          const normalized = nextDisplayName.toLowerCase();
          const hasDuplicate = existing.some(
            (r, i) =>
              i !== idx &&
              (r.displayName || "").trim().toLowerCase() === normalized,
          );
          if (hasDuplicate) {
            result = {
              ok: false,
              error: `A custom radio named "${nextDisplayName}" already exists`,
            };
            return state;
          }

          const nextCustom = existing.map((r, i) =>
            i === idx ? { ...r, ...updates, displayName: nextDisplayName } : r,
          );

          return { customRadios: nextCustom };
        });

        return result;
      },

      removeCustomRadio: (id) =>
        set((state) => {
          const nextCustom = (state.customRadios || []).filter(
            (r) => r.id !== id,
          );
          const updatedRadios = state.radios.filter(
            (r) => r.equipmentId !== id,
          );
          const currentActiveId = state.activeRadioId;
          const activeRadioId =
            currentActiveId &&
            updatedRadios.some((r) => r.id === currentActiveId)
              ? currentActiveId
              : updatedRadios.length > 0
                ? updatedRadios[0].id
                : null;

          return {
            customRadios: nextCustom,
            radios: updatedRadios,
            activeRadioId,
          };
        }),

      // === Antenna Actions ===

      addAntenna: (antenna) => {
        let id: string | null = null;
        set((state) => {
          if (state.antennas.length >= MAX_ANTENNAS) return state;
          const newId = crypto.randomUUID();
          id = newId;
          return {
            antennas: [
              ...state.antennas,
              { ...antenna, id: newId, addedAt: new Date().toISOString() },
            ],
          };
        });
        return id;
      },

      updateAntenna: (id, updates) => {
        let result: { ok: true } | { ok: false; error: string } = { ok: true };
        set((state) => {
          const idx = state.antennas.findIndex((a) => a.id === id);
          if (idx === -1) {
            result = { ok: false, error: "Antenna not found" };
            return state;
          }
          return {
            antennas: state.antennas.map((a, i) =>
              i === idx ? { ...a, ...updates } : a,
            ),
          };
        });
        return result;
      },

      removeAntenna: (id) =>
        set((state) => ({
          antennas: state.antennas.filter((a) => a.id !== id),
          // Clean up presets referencing this antenna
          stationPresets: state.stationPresets.filter(
            (p) => p.antennaId !== id,
          ),
        })),

      // === Feedline Actions ===

      addFeedline: (feedline) => {
        let id: string | null = null;
        set((state) => {
          if (state.feedlines.length >= MAX_FEEDLINES) return state;
          const newId = crypto.randomUUID();
          id = newId;
          return {
            feedlines: [
              ...state.feedlines,
              { ...feedline, id: newId, addedAt: new Date().toISOString() },
            ],
          };
        });
        return id;
      },

      updateFeedline: (id, updates) => {
        let result: { ok: true } | { ok: false; error: string } = { ok: true };
        set((state) => {
          const idx = state.feedlines.findIndex((f) => f.id === id);
          if (idx === -1) {
            result = { ok: false, error: "Feedline not found" };
            return state;
          }
          return {
            feedlines: state.feedlines.map((f, i) =>
              i === idx ? { ...f, ...updates } : f,
            ),
          };
        });
        return result;
      },

      removeFeedline: (id) =>
        set((state) => ({
          feedlines: state.feedlines.filter((f) => f.id !== id),
          // Clean up presets referencing this feedline
          stationPresets: state.stationPresets.map((p) =>
            p.feedlineId === id ? { ...p, feedlineId: undefined } : p,
          ),
        })),

      // === Accessory Actions ===

      addAccessory: (accessory) => {
        let id: string | null = null;
        set((state) => {
          if (state.accessories.length >= MAX_ACCESSORIES) return state;
          const newId = crypto.randomUUID();
          id = newId;
          return {
            accessories: [
              ...state.accessories,
              {
                ...accessory,
                id: newId,
                addedAt: new Date().toISOString(),
              } as UserAccessory,
            ],
          };
        });
        return id;
      },

      updateAccessory: (id, updates) => {
        let result: { ok: true } | { ok: false; error: string } = { ok: true };
        set((state) => {
          const idx = state.accessories.findIndex((a) => a.id === id);
          if (idx === -1) {
            result = { ok: false, error: "Accessory not found" };
            return state;
          }
          return {
            accessories: state.accessories.map((a, i) =>
              i === idx ? ({ ...a, ...updates } as UserAccessory) : a,
            ),
          };
        });
        return result;
      },

      removeAccessory: (id) =>
        set((state) => ({
          accessories: state.accessories.filter((a) => a.id !== id),
          // Remove this accessory from all presets' accessoryIds
          stationPresets: state.stationPresets.map((p) => ({
            ...p,
            accessoryIds: p.accessoryIds.filter((aid) => aid !== id),
          })),
        })),

      // === Preset Actions ===

      addPreset: (preset) => {
        let id: string | null = null;
        set((state) => {
          if (state.stationPresets.length >= MAX_PRESETS) return state;
          const newId = crypto.randomUUID();
          id = newId;
          return {
            stationPresets: [
              ...state.stationPresets,
              { ...preset, id: newId, createdAt: new Date().toISOString() },
            ],
          };
        });
        return id;
      },

      updatePreset: (id, updates) => {
        let result: { ok: true } | { ok: false; error: string } = { ok: true };
        set((state) => {
          const idx = state.stationPresets.findIndex((p) => p.id === id);
          if (idx === -1) {
            result = { ok: false, error: "Preset not found" };
            return state;
          }
          return {
            stationPresets: state.stationPresets.map((p, i) =>
              i === idx ? { ...p, ...updates } : p,
            ),
          };
        });
        return result;
      },

      removePreset: (id) =>
        set((state) => ({
          stationPresets: state.stationPresets.filter((p) => p.id !== id),
          // Clear activePresetId if it matches the removed preset
          activePresetId:
            state.activePresetId === id ? null : state.activePresetId,
        })),

      setActivePreset: (id) => set({ activePresetId: id }),
    }),
    {
      name: "propulse-shack",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        radios: state.radios,
        customRadios: state.customRadios,
        activeRadioId: state.activeRadioId,
        antennas: state.antennas,
        feedlines: state.feedlines,
        accessories: state.accessories,
        stationPresets: state.stationPresets,
        activePresetId: state.activePresetId,
      }),
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>;
        if (version < 2) {
          if (!("antennas" in state)) state.antennas = [];
          if (!("feedlines" in state)) state.feedlines = [];
          if (!("accessories" in state)) state.accessories = [];
          if (!("stationPresets" in state)) state.stationPresets = [];
          if (!("activePresetId" in state)) state.activePresetId = null;
        }
        return state as never;
      },
    },
  ),
);

// ─── Hooks ───────────────────────────────────────────────────────────────────

/**
 * Hook to get the active radio equipment details
 */
export function useActiveRadio(): RadioEquipment | null {
  const activeRadioId = useShackStore((s) => s.activeRadioId);
  const radios = useShackStore((s) => s.radios) || [];
  const customRadios = useShackStore((s) => s.customRadios);
  if (!activeRadioId) return null;
  const activeInstance = radios.find((r) => r.id === activeRadioId);
  if (activeInstance) {
    return (
      resolveEquipmentById(activeInstance.equipmentId, customRadios) || null
    );
  }
  return resolveEquipmentById(activeRadioId, customRadios) || null;
}

/**
 * Hook to get all user's radios with their equipment details
 */
export function useUserRadios(): Array<{
  userRadio: UserRadio;
  equipment: RadioEquipment | undefined;
}> {
  const radios = useShackStore((s) => s.radios) || [];
  const customRadios = useShackStore((s) => s.customRadios);
  return radios.map((userRadio) => ({
    userRadio,
    equipment: resolveEquipmentById(userRadio.equipmentId, customRadios),
  }));
}

/**
 * Hook to get the active user radio instance
 */
export function useActiveUserRadio(): UserRadio | null {
  const activeRadioId = useShackStore((s) => s.activeRadioId);
  const radios = useShackStore((s) => s.radios) || [];
  if (!activeRadioId) return null;
  return radios.find((r) => r.id === activeRadioId) ?? null;
}

/**
 * Hook to get the active station preset
 */
export function useActivePreset(): StationPreset | null {
  const activePresetId = useShackStore((s) => s.activePresetId);
  const presets = useShackStore((s) => s.stationPresets);
  if (!activePresetId) return null;
  return presets.find((p) => p.id === activePresetId) ?? null;
}

/**
 * Hook to get all user antennas
 */
export function useUserAntennas(): UserAntenna[] {
  return useShackStore((s) => s.antennas);
}

/**
 * Hook to get all user feedlines
 */
export function useUserFeedlines(): UserFeedline[] {
  return useShackStore((s) => s.feedlines);
}

/**
 * Hook to get all user accessories
 */
export function useUserAccessories(): UserAccessory[] {
  return useShackStore((s) => s.accessories);
}

/**
 * Hook to get all station presets
 */
export function useStationPresets(): StationPreset[] {
  return useShackStore((s) => s.stationPresets);
}

// Re-export helpers for use by migration utility and sync modules
export { isLegacyUserRadio, isUserRadio, createUserRadioInstance };
