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
  InlineComponent,
  EquipmentHistoryEntry,
} from "@/types/shack";
import {
  MAX_ANTENNAS,
  MAX_FEEDLINES,
  MAX_INLINE_COMPONENTS,
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
  inlineComponents: InlineComponent[];
  accessories: UserAccessory[];
  stationPresets: StationPreset[];
  activePresetId: string | null;
  equipmentHistory: EquipmentHistoryEntry[];

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
  duplicateAntenna: (id: string) => string | null;

  // Feedline actions
  addFeedline: (
    feedline: Omit<UserFeedline, "id" | "addedAt">,
  ) => string | null;
  updateFeedline: (
    id: string,
    updates: Partial<Omit<UserFeedline, "id" | "addedAt">>,
  ) => { ok: true } | { ok: false; error: string };
  removeFeedline: (id: string) => void;
  duplicateFeedline: (id: string) => string | null;

  // Inline component actions
  addInlineComponent: (
    component: Omit<InlineComponent, "id" | "addedAt">,
  ) => string | null;
  updateInlineComponent: (
    id: string,
    updates: Partial<Omit<InlineComponent, "id" | "addedAt">>,
  ) => { ok: true } | { ok: false; error: string };
  removeInlineComponent: (id: string) => void;
  duplicateInlineComponent: (id: string) => string | null;

  // Accessory actions
  addAccessory: (
    accessory: Omit<UserAccessory, "id" | "addedAt">,
  ) => string | null;
  updateAccessory: (
    id: string,
    updates: Partial<Omit<UserAccessory, "id" | "addedAt">>,
  ) => { ok: true } | { ok: false; error: string };
  removeAccessory: (id: string) => void;
  duplicateAccessory: (id: string) => string | null;

  // Preset actions
  addPreset: (preset: Omit<StationPreset, "id" | "createdAt">) => string | null;
  updatePreset: (
    id: string,
    updates: Partial<Omit<StationPreset, "id" | "createdAt">>,
  ) => { ok: true } | { ok: false; error: string };
  removePreset: (id: string) => void;
  setActivePreset: (id: string | null) => void;
  duplicatePreset: (id: string) => string | null;

  // History
  _addHistoryEntry: (
    entry: Omit<EquipmentHistoryEntry, "id" | "timestamp">,
  ) => void;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useShackStore = create<ShackStore>()(
  persist(
    (set, get) => ({
      radios: [],
      customRadios: [],
      activeRadioId: null,
      antennas: [],
      feedlines: [],
      inlineComponents: [],
      accessories: [],
      stationPresets: [],
      activePresetId: null,
      equipmentHistory: [],

      addRadio: (radioId, nickname) => {
        let instanceId: string | null = null;
        let wasAdded = false;

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
          wasAdded = true;

          const updatedRadios = [...state.radios, newRadio];
          const activeRadioId =
            state.activeRadioId ||
            (updatedRadios.length === 1 ? newRadio.id : null);

          return { radios: updatedRadios, activeRadioId };
        });

        if (wasAdded && instanceId) {
          const radioEquip = resolveEquipmentById(radioId, get().customRadios);
          get()._addHistoryEntry({
            action: "added",
            equipmentType: "radio",
            equipmentId: instanceId,
            equipmentName: nickname ?? radioEquip?.displayName ?? radioId,
          });
        }

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

        if (instanceId) {
          const radioEquip = resolveEquipmentById(radioId, get().customRadios);
          get()._addHistoryEntry({
            action: "added",
            equipmentType: "radio",
            equipmentId: instanceId,
            equipmentName: nickname ?? radioEquip?.displayName ?? radioId,
          });
        }

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

        if (result.ok) {
          const radio = get().radios.find((r) => r.id === id);
          const radioEquip = radio
            ? resolveEquipmentById(radio.equipmentId, get().customRadios)
            : undefined;
          get()._addHistoryEntry({
            action: "modified",
            equipmentType: "radio",
            equipmentId: id,
            equipmentName:
              radio?.nickname ?? radioEquip?.displayName ?? "Unknown",
          });
        }

        return result;
      },

      removeRadio: (radioId) => {
        const radio = get().radios.find((r) => r.id === radioId);
        const radioEquip = radio
          ? resolveEquipmentById(radio.equipmentId, get().customRadios)
          : undefined;
        const name = radio?.nickname ?? radioEquip?.displayName ?? "Unknown";

        set((state) => {
          const updatedRadios = state.radios.filter((r) => r.id !== radioId);
          const activeRadioId =
            state.activeRadioId === radioId
              ? updatedRadios.length > 0
                ? updatedRadios[0].id
                : null
              : state.activeRadioId;
          return { radios: updatedRadios, activeRadioId };
        });

        get()._addHistoryEntry({
          action: "removed",
          equipmentType: "radio",
          equipmentId: radioId,
          equipmentName: name,
        });
      },

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

        if (result.ok) {
          get()._addHistoryEntry({
            action: "added",
            equipmentType: "radio",
            equipmentId: id,
            equipmentName: displayName,
          });
        }

        return result;
      },

      updateCustomRadio: (id, updates) => {
        let result: { ok: true } | { ok: false; error: string } = { ok: true };
        let updatedName = "";

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

          updatedName = nextDisplayName;
          const nextCustom = existing.map((r, i) =>
            i === idx ? { ...r, ...updates, displayName: nextDisplayName } : r,
          );

          return { customRadios: nextCustom };
        });

        if (result.ok) {
          get()._addHistoryEntry({
            action: "modified",
            equipmentType: "radio",
            equipmentId: id,
            equipmentName: updatedName,
          });
        }

        return result;
      },

      removeCustomRadio: (id) => {
        const customRadio = (get().customRadios || []).find((r) => r.id === id);
        const name = customRadio?.displayName ?? "Unknown";

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
        });

        get()._addHistoryEntry({
          action: "removed",
          equipmentType: "radio",
          equipmentId: id,
          equipmentName: name,
        });
      },

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
        if (id) {
          get()._addHistoryEntry({
            action: "added",
            equipmentType: "antenna",
            equipmentId: id,
            equipmentName: antenna.name,
          });
        }
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
        if (result.ok) {
          const antenna = get().antennas.find((a) => a.id === id);
          get()._addHistoryEntry({
            action: "modified",
            equipmentType: "antenna",
            equipmentId: id,
            equipmentName: antenna?.name ?? "Unknown",
          });
        }
        return result;
      },

      removeAntenna: (id) => {
        const antenna = get().antennas.find((a) => a.id === id);
        const name = antenna?.name ?? "Unknown";
        set((state) => ({
          antennas: state.antennas.filter((a) => a.id !== id),
          // Clean up presets referencing this antenna
          stationPresets: state.stationPresets.filter(
            (p) => p.antennaId !== id,
          ),
        }));
        get()._addHistoryEntry({
          action: "removed",
          equipmentType: "antenna",
          equipmentId: id,
          equipmentName: name,
        });
      },

      duplicateAntenna: (id) => {
        let newId: string | null = null;
        const src = get().antennas.find((a) => a.id === id);
        const originalName = src?.name ?? "Unknown";
        set((state) => {
          const current = state.antennas.find((a) => a.id === id);
          if (!current || state.antennas.length >= MAX_ANTENNAS) return state;
          newId = crypto.randomUUID();
          return {
            antennas: [
              ...state.antennas,
              {
                ...current,
                id: newId,
                name: `${current.name} (copy)`,
                addedAt: new Date().toISOString(),
              },
            ],
          };
        });
        if (newId) {
          get()._addHistoryEntry({
            action: "duplicated",
            equipmentType: "antenna",
            equipmentId: newId,
            equipmentName: `${originalName} (copy)`,
            details: `Duplicated from ${originalName}`,
          });
        }
        return newId;
      },

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
        if (id) {
          get()._addHistoryEntry({
            action: "added",
            equipmentType: "feedline",
            equipmentId: id,
            equipmentName: feedline.name,
          });
        }
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
        if (result.ok) {
          const feedline = get().feedlines.find((f) => f.id === id);
          get()._addHistoryEntry({
            action: "modified",
            equipmentType: "feedline",
            equipmentId: id,
            equipmentName: feedline?.name ?? "Unknown",
          });
        }
        return result;
      },

      removeFeedline: (id) => {
        const feedline = get().feedlines.find((f) => f.id === id);
        const name = feedline?.name ?? "Unknown";
        set((state) => ({
          feedlines: state.feedlines.filter((f) => f.id !== id),
          // Clean up presets referencing this feedline
          stationPresets: state.stationPresets.map((p) =>
            p.feedlineId === id ? { ...p, feedlineId: undefined } : p,
          ),
        }));
        get()._addHistoryEntry({
          action: "removed",
          equipmentType: "feedline",
          equipmentId: id,
          equipmentName: name,
        });
      },

      duplicateFeedline: (id) => {
        let newId: string | null = null;
        const src = get().feedlines.find((f) => f.id === id);
        const originalName = src?.name ?? "Unknown";
        set((state) => {
          const current = state.feedlines.find((f) => f.id === id);
          if (!current || state.feedlines.length >= MAX_FEEDLINES) return state;
          newId = crypto.randomUUID();
          return {
            feedlines: [
              ...state.feedlines,
              {
                ...current,
                id: newId,
                name: `${current.name} (copy)`,
                addedAt: new Date().toISOString(),
              },
            ],
          };
        });
        if (newId) {
          get()._addHistoryEntry({
            action: "duplicated",
            equipmentType: "feedline",
            equipmentId: newId,
            equipmentName: `${originalName} (copy)`,
            details: `Duplicated from ${originalName}`,
          });
        }
        return newId;
      },

      // === Inline Component Actions ===

      addInlineComponent: (component) => {
        let id: string | null = null;
        set((state) => {
          if (state.inlineComponents.length >= MAX_INLINE_COMPONENTS)
            return state;
          const newId = crypto.randomUUID();
          id = newId;
          return {
            inlineComponents: [
              ...state.inlineComponents,
              {
                ...component,
                id: newId,
                addedAt: new Date().toISOString(),
              } as InlineComponent,
            ],
          };
        });
        if (id) {
          get()._addHistoryEntry({
            action: "added",
            equipmentType: "inline_component",
            equipmentId: id,
            equipmentName: component.name,
          });
        }
        return id;
      },

      updateInlineComponent: (id, updates) => {
        let result: { ok: true } | { ok: false; error: string } = { ok: true };
        set((state) => {
          const idx = state.inlineComponents.findIndex((c) => c.id === id);
          if (idx === -1) {
            result = { ok: false, error: "Inline component not found" };
            return state;
          }
          return {
            inlineComponents: state.inlineComponents.map((c, i) =>
              i === idx ? ({ ...c, ...updates } as InlineComponent) : c,
            ),
          };
        });
        if (result.ok) {
          const component = get().inlineComponents.find((c) => c.id === id);
          get()._addHistoryEntry({
            action: "modified",
            equipmentType: "inline_component",
            equipmentId: id,
            equipmentName: component?.name ?? "Unknown",
          });
        }
        return result;
      },

      removeInlineComponent: (id) => {
        const component = get().inlineComponents.find((c) => c.id === id);
        const name = component?.name ?? "Unknown";
        set((state) => ({
          inlineComponents: state.inlineComponents.filter((c) => c.id !== id),
          stationPresets: state.stationPresets.map((p) => ({
            ...p,
            inlineComponentIds: p.inlineComponentIds?.filter(
              (cid) => cid !== id,
            ),
          })),
        }));
        get()._addHistoryEntry({
          action: "removed",
          equipmentType: "inline_component",
          equipmentId: id,
          equipmentName: name,
        });
      },

      duplicateInlineComponent: (id) => {
        let newId: string | null = null;
        const src = get().inlineComponents.find((c) => c.id === id);
        const originalName = src?.name ?? "Unknown";
        set((state) => {
          const current = state.inlineComponents.find((c) => c.id === id);
          if (
            !current ||
            state.inlineComponents.length >= MAX_INLINE_COMPONENTS
          )
            return state;
          newId = crypto.randomUUID();
          return {
            inlineComponents: [
              ...state.inlineComponents,
              {
                ...current,
                id: newId,
                name: `${current.name} (copy)`,
                addedAt: new Date().toISOString(),
              } as InlineComponent,
            ],
          };
        });
        if (newId) {
          get()._addHistoryEntry({
            action: "duplicated",
            equipmentType: "inline_component",
            equipmentId: newId,
            equipmentName: `${originalName} (copy)`,
            details: `Duplicated from ${originalName}`,
          });
        }
        return newId;
      },

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
        if (id) {
          get()._addHistoryEntry({
            action: "added",
            equipmentType: "accessory",
            equipmentId: id,
            equipmentName: accessory.name,
          });
        }
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
        if (result.ok) {
          const accessory = get().accessories.find((a) => a.id === id);
          get()._addHistoryEntry({
            action: "modified",
            equipmentType: "accessory",
            equipmentId: id,
            equipmentName: accessory?.name ?? "Unknown",
          });
        }
        return result;
      },

      removeAccessory: (id) => {
        const accessory = get().accessories.find((a) => a.id === id);
        const name = accessory?.name ?? "Unknown";
        set((state) => ({
          accessories: state.accessories.filter((a) => a.id !== id),
          // Remove this accessory from all presets' accessoryIds
          stationPresets: state.stationPresets.map((p) => ({
            ...p,
            accessoryIds: p.accessoryIds.filter((aid) => aid !== id),
          })),
        }));
        get()._addHistoryEntry({
          action: "removed",
          equipmentType: "accessory",
          equipmentId: id,
          equipmentName: name,
        });
      },

      duplicateAccessory: (id) => {
        let newId: string | null = null;
        const src = get().accessories.find((a) => a.id === id);
        const originalName = src?.name ?? "Unknown";
        set((state) => {
          const current = state.accessories.find((a) => a.id === id);
          if (!current || state.accessories.length >= MAX_ACCESSORIES)
            return state;
          newId = crypto.randomUUID();
          return {
            accessories: [
              ...state.accessories,
              {
                ...current,
                id: newId,
                name: `${current.name} (copy)`,
                addedAt: new Date().toISOString(),
              } as UserAccessory,
            ],
          };
        });
        if (newId) {
          get()._addHistoryEntry({
            action: "duplicated",
            equipmentType: "accessory",
            equipmentId: newId,
            equipmentName: `${originalName} (copy)`,
            details: `Duplicated from ${originalName}`,
          });
        }
        return newId;
      },

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
        if (id) {
          get()._addHistoryEntry({
            action: "added",
            equipmentType: "preset",
            equipmentId: id,
            equipmentName: preset.name,
          });
        }
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
        if (result.ok) {
          const preset = get().stationPresets.find((p) => p.id === id);
          get()._addHistoryEntry({
            action: "modified",
            equipmentType: "preset",
            equipmentId: id,
            equipmentName: preset?.name ?? "Unknown",
          });
        }
        return result;
      },

      removePreset: (id) => {
        const preset = get().stationPresets.find((p) => p.id === id);
        const name = preset?.name ?? "Unknown";
        set((state) => ({
          stationPresets: state.stationPresets.filter((p) => p.id !== id),
          // Clear activePresetId if it matches the removed preset
          activePresetId:
            state.activePresetId === id ? null : state.activePresetId,
        }));
        get()._addHistoryEntry({
          action: "removed",
          equipmentType: "preset",
          equipmentId: id,
          equipmentName: name,
        });
      },

      setActivePreset: (id) => set({ activePresetId: id }),

      duplicatePreset: (id) => {
        let newId: string | null = null;
        const src = get().stationPresets.find((p) => p.id === id);
        const originalName = src?.name ?? "Unknown";
        set((state) => {
          const current = state.stationPresets.find((p) => p.id === id);
          if (!current || state.stationPresets.length >= MAX_PRESETS)
            return state;
          newId = crypto.randomUUID();
          return {
            stationPresets: [
              ...state.stationPresets,
              {
                ...current,
                id: newId,
                name: `${current.name} (copy)`,
                createdAt: new Date().toISOString(),
              },
            ],
          };
        });
        if (newId) {
          get()._addHistoryEntry({
            action: "duplicated",
            equipmentType: "preset",
            equipmentId: newId,
            equipmentName: `${originalName} (copy)`,
            details: `Duplicated from ${originalName}`,
          });
        }
        return newId;
      },

      // === History ===

      _addHistoryEntry: (entry) =>
        set((state) => {
          const historyEntry: EquipmentHistoryEntry = {
            ...entry,
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
          };
          // Keep last 200 entries
          const history = [...state.equipmentHistory, historyEntry].slice(-200);
          return { equipmentHistory: history };
        }),
    }),
    {
      name: "propulse-shack",
      version: 3,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        radios: state.radios,
        customRadios: state.customRadios,
        activeRadioId: state.activeRadioId,
        antennas: state.antennas,
        feedlines: state.feedlines,
        inlineComponents: state.inlineComponents,
        accessories: state.accessories,
        stationPresets: state.stationPresets,
        activePresetId: state.activePresetId,
        equipmentHistory: state.equipmentHistory,
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
        if (version < 3) {
          if (!("inlineComponents" in state)) state.inlineComponents = [];
          if (!("equipmentHistory" in state)) state.equipmentHistory = [];
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

/**
 * Hook to get all inline feedline components
 */
export function useInlineComponents(): InlineComponent[] {
  return useShackStore((s) => s.inlineComponents);
}

/**
 * Hook to get equipment history
 */
export function useEquipmentHistory(): EquipmentHistoryEntry[] {
  return useShackStore((s) => s.equipmentHistory);
}

// Re-export helpers for use by migration utility and sync modules
export { isLegacyUserRadio, isUserRadio, createUserRadioInstance };
