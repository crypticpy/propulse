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
import type {
  StationChain,
  ChainNode,
  FeedlineRun,
} from "@/types/stationChain";
import { MAX_CHAINS, MAX_CHAIN_NODES } from "@/types/stationChain";
import type { StationInventory } from "@/lib/station/stationChainEngine";
import { computeInsertPosition } from "@/lib/chainOrdering";
import { deleteImage } from "@/lib/db/imageStore";

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
  stationChains: StationChain[];
  activeChainId: string | null;

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

  // Chain actions
  addChain: (chain: Omit<StationChain, "id" | "createdAt">) => string | null;
  updateChain: (
    id: string,
    updates: Partial<Omit<StationChain, "id" | "createdAt">>,
  ) => { ok: true } | { ok: false; error: string };
  removeChain: (id: string) => void;
  duplicateChain: (id: string) => string | null;
  setActiveChain: (id: string | null) => void;
  addNodeToChain: (
    chainId: string,
    node: ChainNode,
    position: number,
  ) => { ok: true } | { ok: false; error: string };
  removeNodeFromChain: (
    chainId: string,
    position: number,
  ) => { ok: true } | { ok: false; error: string };
  reorderChainNodes: (
    chainId: string,
    fromIndex: number,
    toIndex: number,
  ) => { ok: true } | { ok: false; error: string };
  swapNodeEquipment: (
    chainId: string,
    nodeIndex: number,
    newEquipmentId: string,
  ) => { ok: true } | { ok: false; error: string };
  addFeedlineRun: (
    chainId: string,
    run: Omit<FeedlineRun, "id">,
  ) => string | null;
  updateFeedlineRun: (
    chainId: string,
    runId: string,
    updates: Partial<Omit<FeedlineRun, "id">>,
  ) => { ok: true } | { ok: false; error: string };

  // Image management
  setEquipmentImage: (
    type: "radio" | "antenna" | "feedline" | "accessory" | "inline",
    equipmentId: string,
    imageId: string,
  ) => void;
  clearEquipmentImage: (
    type: "radio" | "antenna" | "feedline" | "accessory" | "inline",
    equipmentId: string,
  ) => void;

  // Gallery management (radios, antennas, accessories only)
  addGalleryImage: (
    type: "radio" | "antenna" | "accessory",
    equipmentId: string,
    imageId: string,
  ) => void;
  removeGalleryImage: (
    type: "radio" | "antenna" | "accessory",
    equipmentId: string,
    imageId: string,
  ) => void;

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
      stationChains: [],
      activeChainId: null,

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

        // Orphan cleanup: delete associated image blob
        if (radio?.imageId) {
          deleteImage(radio.imageId).catch(() => {
            /* best-effort cleanup */
          });
        }
        // Orphan cleanup: delete gallery image blobs
        if (radio?.galleryImageIds) {
          for (const gid of radio.galleryImageIds) {
            deleteImage(gid).catch(() => {
              /* best-effort cleanup */
            });
          }
        }

        set((state) => {
          const updatedRadios = state.radios.filter((r) => r.id !== radioId);
          const activeRadioId =
            state.activeRadioId === radioId
              ? updatedRadios.length > 0
                ? updatedRadios[0].id
                : null
              : state.activeRadioId;
          // Clean up chains referencing this radio
          const stationChains = state.stationChains.map((chain) => ({
            ...chain,
            nodes: chain.nodes.filter(
              (n) => !(n.type === "radio" && n.radioId === radioId),
            ),
          }));
          const stationPresets = state.stationPresets.filter(
            (preset) => preset.radioId !== radioId,
          );
          const activePresetId = stationPresets.some(
            (preset) => preset.id === state.activePresetId,
          )
            ? state.activePresetId
            : null;
          return {
            radios: updatedRadios,
            activeRadioId,
            stationChains,
            stationPresets,
            activePresetId,
          };
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

        // Find all user radio IDs that reference this custom radio
        const affectedRadioIds = get()
          .radios.filter((r) => r.equipmentId === id)
          .map((r) => r.id);
        const affectedRadios = get().radios.filter((r) =>
          affectedRadioIds.includes(r.id),
        );

        for (const radio of affectedRadios) {
          if (radio.imageId) {
            deleteImage(radio.imageId).catch(() => {
              /* best-effort cleanup */
            });
          }
          for (const galleryId of radio.galleryImageIds ?? []) {
            deleteImage(galleryId).catch(() => {
              /* best-effort cleanup */
            });
          }
        }

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

          // Clean up chains referencing any of these radios
          const stationChains = state.stationChains.map((chain) => ({
            ...chain,
            nodes: chain.nodes.filter(
              (n) =>
                !(n.type === "radio" && affectedRadioIds.includes(n.radioId)),
            ),
          }));
          const stationPresets = state.stationPresets.filter(
            (preset) => !affectedRadioIds.includes(preset.radioId),
          );
          const activePresetId = stationPresets.some(
            (preset) => preset.id === state.activePresetId,
          )
            ? state.activePresetId
            : null;

          return {
            customRadios: nextCustom,
            radios: updatedRadios,
            activeRadioId,
            stationChains,
            stationPresets,
            activePresetId,
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

        // Orphan cleanup: delete associated image blob
        if (antenna?.imageId) {
          deleteImage(antenna.imageId).catch(() => {
            /* best-effort cleanup */
          });
        }
        // Orphan cleanup: delete gallery image blobs
        if (antenna?.galleryImageIds) {
          for (const gid of antenna.galleryImageIds) {
            deleteImage(gid).catch(() => {
              /* best-effort cleanup */
            });
          }
        }

        set((state) => ({
          antennas: state.antennas.filter((a) => a.id !== id),
          // Clean up presets referencing this antenna
          stationPresets: state.stationPresets.filter(
            (p) => p.antennaId !== id,
          ),
          // Clean up chains referencing this antenna
          stationChains: state.stationChains.map((chain) => ({
            ...chain,
            nodes: chain.nodes.filter(
              (n) => !(n.type === "antenna" && n.antennaId === id),
            ),
          })),
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

        // Orphan cleanup: delete associated image blob
        if (feedline?.imageId) {
          deleteImage(feedline.imageId).catch(() => {
            /* best-effort cleanup */
          });
        }

        set((state) => {
          // Find FeedlineRun IDs that reference this feedline
          const affectedRunIds = new Set<string>();
          for (const chain of state.stationChains) {
            for (const run of chain.feedlineRuns) {
              if (run.feedlineId === id) affectedRunIds.add(run.id);
            }
          }
          return {
            feedlines: state.feedlines.filter((f) => f.id !== id),
            // Clean up presets referencing this feedline
            stationPresets: state.stationPresets.map((p) =>
              p.feedlineId === id ? { ...p, feedlineId: undefined } : p,
            ),
            // Clean up chains: remove affected FeedlineRuns and their nodes
            stationChains: state.stationChains.map((chain) => ({
              ...chain,
              feedlineRuns: chain.feedlineRuns.filter(
                (r) => r.feedlineId !== id,
              ),
              nodes: chain.nodes.filter(
                (n) =>
                  !(
                    n.type === "feedline_run" &&
                    affectedRunIds.has(n.feedlineRunId)
                  ),
              ),
            })),
          };
        });
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

        // Orphan cleanup: delete associated image blob
        if (component?.imageId) {
          deleteImage(component.imageId).catch(() => {
            /* best-effort cleanup */
          });
        }

        set((state) => ({
          inlineComponents: state.inlineComponents.filter((c) => c.id !== id),
          stationPresets: state.stationPresets.map((p) => ({
            ...p,
            inlineComponentIds: p.inlineComponentIds?.filter(
              (cid) => cid !== id,
            ),
          })),
          // Clean up chains: remove from FeedlineRun.inlineComponentIds
          stationChains: state.stationChains.map((chain) => ({
            ...chain,
            feedlineRuns: chain.feedlineRuns.map((run) => ({
              ...run,
              inlineComponentIds: run.inlineComponentIds.filter(
                (cid) => cid !== id,
              ),
            })),
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

        // Orphan cleanup: delete associated image blob
        if (accessory?.imageId) {
          deleteImage(accessory.imageId).catch(() => {
            /* best-effort cleanup */
          });
        }
        // Orphan cleanup: delete gallery image blobs
        if (accessory?.galleryImageIds) {
          for (const gid of accessory.galleryImageIds) {
            deleteImage(gid).catch(() => {
              /* best-effort cleanup */
            });
          }
        }

        set((state) => ({
          accessories: state.accessories.filter((a) => a.id !== id),
          // Remove this accessory from all presets' accessoryIds
          stationPresets: state.stationPresets.map((p) => ({
            ...p,
            accessoryIds: p.accessoryIds.filter((aid) => aid !== id),
          })),
          // Clean up chains: remove from signal-path nodes and shackAccessoryIds
          stationChains: state.stationChains.map((chain) => ({
            ...chain,
            nodes: chain.nodes.filter(
              (n) => !(n.type === "accessory" && n.accessoryId === id),
            ),
            shackAccessoryIds: chain.shackAccessoryIds.filter(
              (aid) => aid !== id,
            ),
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

      // === Chain Actions ===

      addChain: (chain) => {
        let id: string | null = null;
        set((state) => {
          if (state.stationChains.length >= MAX_CHAINS) return state;
          const newId = crypto.randomUUID();
          id = newId;
          return {
            stationChains: [
              ...state.stationChains,
              { ...chain, id: newId, createdAt: new Date().toISOString() },
            ],
          };
        });
        if (id) {
          get()._addHistoryEntry({
            action: "added",
            equipmentType: "chain",
            equipmentId: id,
            equipmentName: chain.name,
          });
        }
        return id;
      },

      updateChain: (id, updates) => {
        let result: { ok: true } | { ok: false; error: string } = { ok: true };
        set((state) => {
          const idx = state.stationChains.findIndex((c) => c.id === id);
          if (idx === -1) {
            result = { ok: false, error: "Chain not found" };
            return state;
          }
          return {
            stationChains: state.stationChains.map((c, i) =>
              i === idx ? { ...c, ...updates } : c,
            ),
          };
        });
        if (result.ok) {
          const chain = get().stationChains.find((c) => c.id === id);
          get()._addHistoryEntry({
            action: "modified",
            equipmentType: "chain",
            equipmentId: id,
            equipmentName: chain?.name ?? "Unknown",
          });
        }
        return result;
      },

      removeChain: (id) => {
        const chain = get().stationChains.find((c) => c.id === id);
        const name = chain?.name ?? "Unknown";
        set((state) => ({
          stationChains: state.stationChains.filter((c) => c.id !== id),
          activeChainId:
            state.activeChainId === id ? null : state.activeChainId,
        }));
        get()._addHistoryEntry({
          action: "removed",
          equipmentType: "chain",
          equipmentId: id,
          equipmentName: name,
        });
      },

      duplicateChain: (id) => {
        let newId: string | null = null;
        const src = get().stationChains.find((c) => c.id === id);
        const originalName = src?.name ?? "Unknown";
        set((state) => {
          const current = state.stationChains.find((c) => c.id === id);
          if (!current || state.stationChains.length >= MAX_CHAINS)
            return state;
          newId = crypto.randomUUID();
          // Generate new IDs for feedline runs and remap node references
          const runIdMap = new Map<string, string>();
          const newRuns = current.feedlineRuns.map((r) => {
            const freshId = crypto.randomUUID();
            runIdMap.set(r.id, freshId);
            return { ...r, id: freshId };
          });
          const newNodes = current.nodes.map((n) => {
            if (n.type === "feedline_run") {
              const mappedId = runIdMap.get(n.feedlineRunId);
              return mappedId ? { ...n, feedlineRunId: mappedId } : { ...n };
            }
            return { ...n };
          });
          return {
            stationChains: [
              ...state.stationChains,
              {
                ...current,
                id: newId,
                name: `${current.name} (copy)`,
                nodes: newNodes,
                feedlineRuns: newRuns,
                createdAt: new Date().toISOString(),
              },
            ],
          };
        });
        if (newId) {
          get()._addHistoryEntry({
            action: "duplicated",
            equipmentType: "chain",
            equipmentId: newId,
            equipmentName: `${originalName} (copy)`,
            details: `Duplicated from ${originalName}`,
          });
        }
        return newId;
      },

      setActiveChain: (id) => set({ activeChainId: id }),

      addNodeToChain: (chainId, node, position) => {
        let result: { ok: true } | { ok: false; error: string } = { ok: true };
        set((state) => {
          const idx = state.stationChains.findIndex((c) => c.id === chainId);
          if (idx === -1) {
            result = { ok: false, error: "Chain not found" };
            return state;
          }
          const chain = state.stationChains[idx];
          if (chain.nodes.length >= MAX_CHAIN_NODES) {
            result = { ok: false, error: "Maximum chain nodes reached" };
            return state;
          }
          const clampedPos = Math.max(
            0,
            Math.min(position, chain.nodes.length),
          );
          const updatedNodes = [...chain.nodes];
          updatedNodes.splice(clampedPos, 0, node);
          return {
            stationChains: state.stationChains.map((c, i) =>
              i === idx ? { ...c, nodes: updatedNodes } : c,
            ),
          };
        });
        if (result.ok) {
          const chain = get().stationChains.find((c) => c.id === chainId);
          get()._addHistoryEntry({
            action: "modified",
            equipmentType: "chain",
            equipmentId: chainId,
            equipmentName: chain?.name ?? "Unknown",
            details: `Added ${node.type} node`,
          });
        }
        return result;
      },

      removeNodeFromChain: (chainId, position) => {
        let result: { ok: true } | { ok: false; error: string } = { ok: true };
        set((state) => {
          const idx = state.stationChains.findIndex((c) => c.id === chainId);
          if (idx === -1) {
            result = { ok: false, error: "Chain not found" };
            return state;
          }
          const chain = state.stationChains[idx];
          if (position < 0 || position >= chain.nodes.length) {
            result = { ok: false, error: "Invalid node position" };
            return state;
          }
          const removedNode = chain.nodes[position];
          const updatedNodes = chain.nodes.filter((_, i) => i !== position);
          // If removing a feedline_run node, also clean up the referenced FeedlineRun
          let updatedRuns = chain.feedlineRuns;
          if (removedNode.type === "feedline_run") {
            updatedRuns = chain.feedlineRuns.filter(
              (r) => r.id !== removedNode.feedlineRunId,
            );
          }
          return {
            stationChains: state.stationChains.map((c, i) =>
              i === idx
                ? { ...c, nodes: updatedNodes, feedlineRuns: updatedRuns }
                : c,
            ),
          };
        });
        if (result.ok) {
          const chain = get().stationChains.find((c) => c.id === chainId);
          get()._addHistoryEntry({
            action: "modified",
            equipmentType: "chain",
            equipmentId: chainId,
            equipmentName: chain?.name ?? "Unknown",
            details: "Removed node from chain",
          });
        }
        return result;
      },

      reorderChainNodes: (chainId, fromIndex, toIndex) => {
        let result: { ok: true } | { ok: false; error: string } = { ok: true };
        set((state) => {
          const idx = state.stationChains.findIndex((c) => c.id === chainId);
          if (idx === -1) {
            result = { ok: false, error: "Chain not found" };
            return state;
          }
          const chain = state.stationChains[idx];
          if (
            fromIndex < 0 ||
            fromIndex >= chain.nodes.length ||
            toIndex < 0 ||
            toIndex >= chain.nodes.length
          ) {
            result = { ok: false, error: "Invalid node index" };
            return state;
          }
          const updatedNodes = [...chain.nodes];
          const [moved] = updatedNodes.splice(fromIndex, 1);
          updatedNodes.splice(toIndex, 0, moved);
          return {
            stationChains: state.stationChains.map((c, i) =>
              i === idx ? { ...c, nodes: updatedNodes } : c,
            ),
          };
        });
        if (result.ok) {
          const chain = get().stationChains.find((c) => c.id === chainId);
          get()._addHistoryEntry({
            action: "modified",
            equipmentType: "chain",
            equipmentId: chainId,
            equipmentName: chain?.name ?? "Unknown",
            details: "Reordered chain nodes",
          });
        }
        return result;
      },

      swapNodeEquipment: (chainId, nodeIndex, newEquipmentId) => {
        let result: { ok: true } | { ok: false; error: string } = { ok: true };
        set((state) => {
          const idx = state.stationChains.findIndex((c) => c.id === chainId);
          if (idx === -1) {
            result = { ok: false, error: "Chain not found" };
            return state;
          }
          const chain = state.stationChains[idx];
          if (nodeIndex < 0 || nodeIndex >= chain.nodes.length) {
            result = { ok: false, error: "Invalid node index" };
            return state;
          }
          const node = chain.nodes[nodeIndex];

          if (node.type === "feedline_run") {
            // For feedline_run nodes, update the referenced FeedlineRun's feedlineId
            const run = chain.feedlineRuns.find(
              (r) => r.id === node.feedlineRunId,
            );
            if (!run) {
              result = { ok: false, error: "Feedline run not found" };
              return state;
            }
            const updatedRuns = chain.feedlineRuns.map((r) =>
              r.id === node.feedlineRunId
                ? { ...r, feedlineId: newEquipmentId }
                : r,
            );
            return {
              stationChains: state.stationChains.map((c, i) =>
                i === idx ? { ...c, feedlineRuns: updatedRuns } : c,
              ),
            };
          }

          // For radio, antenna, accessory: replace the node in the nodes array
          let newNode: ChainNode;
          switch (node.type) {
            case "radio":
              newNode = { type: "radio", radioId: newEquipmentId };
              break;
            case "antenna":
              newNode = { type: "antenna", antennaId: newEquipmentId };
              break;
            case "accessory":
              newNode = { type: "accessory", accessoryId: newEquipmentId };
              break;
          }
          const updatedNodes = chain.nodes.map((n, i) =>
            i === nodeIndex ? newNode : n,
          );
          return {
            stationChains: state.stationChains.map((c, i) =>
              i === idx ? { ...c, nodes: updatedNodes } : c,
            ),
          };
        });
        if (result.ok) {
          const chain = get().stationChains.find((c) => c.id === chainId);
          get()._addHistoryEntry({
            action: "modified",
            equipmentType: "chain",
            equipmentId: chainId,
            equipmentName: chain?.name ?? "Unknown",
            details: "Swapped equipment in chain",
          });
        }
        return result;
      },

      addFeedlineRun: (chainId, run) => {
        let runId: string | null = null;
        set((state) => {
          const idx = state.stationChains.findIndex((c) => c.id === chainId);
          if (idx === -1) return state;
          const chain = state.stationChains[idx];
          if (chain.nodes.length >= MAX_CHAIN_NODES) return state;
          const newRunId = crypto.randomUUID();
          runId = newRunId;
          const newRun: FeedlineRun = { ...run, id: newRunId };
          const updatedRuns = [...chain.feedlineRuns, newRun];
          // Smart auto-ordering via canonical rank system
          const updatedNodes = [...chain.nodes];
          const feedlineNode: ChainNode = {
            type: "feedline_run",
            feedlineRunId: newRunId,
          };
          const getAccCat = (accId: string) => {
            const acc = state.accessories.find((a) => a.id === accId);
            return acc?.category ?? null;
          };
          const insertPos = computeInsertPosition(
            updatedNodes,
            feedlineNode,
            getAccCat,
          );
          updatedNodes.splice(insertPos, 0, feedlineNode);
          return {
            stationChains: state.stationChains.map((c, i) =>
              i === idx
                ? { ...c, nodes: updatedNodes, feedlineRuns: updatedRuns }
                : c,
            ),
          };
        });
        if (runId) {
          const chain = get().stationChains.find((c) => c.id === chainId);
          get()._addHistoryEntry({
            action: "modified",
            equipmentType: "chain",
            equipmentId: chainId,
            equipmentName: chain?.name ?? "Unknown",
            details: "Added feedline run",
          });
        }
        return runId;
      },

      updateFeedlineRun: (chainId, runId, updates) => {
        let result: { ok: true } | { ok: false; error: string } = { ok: true };
        set((state) => {
          const idx = state.stationChains.findIndex((c) => c.id === chainId);
          if (idx === -1) {
            result = { ok: false, error: "Chain not found" };
            return state;
          }
          const chain = state.stationChains[idx];
          const runIdx = chain.feedlineRuns.findIndex((r) => r.id === runId);
          if (runIdx === -1) {
            result = { ok: false, error: "Feedline run not found" };
            return state;
          }
          const updatedRuns = chain.feedlineRuns.map((r, i) =>
            i === runIdx ? { ...r, ...updates } : r,
          );
          return {
            stationChains: state.stationChains.map((c, i) =>
              i === idx ? { ...c, feedlineRuns: updatedRuns } : c,
            ),
          };
        });
        if (result.ok) {
          const chain = get().stationChains.find((c) => c.id === chainId);
          get()._addHistoryEntry({
            action: "modified",
            equipmentType: "chain",
            equipmentId: chainId,
            equipmentName: chain?.name ?? "Unknown",
            details: "Updated feedline run",
          });
        }
        return result;
      },

      // === Image Management ===

      setEquipmentImage: (type, equipmentId, imageId) => {
        set((state) => {
          switch (type) {
            case "radio":
              return {
                radios: state.radios.map((r) =>
                  r.id === equipmentId ? { ...r, imageId } : r,
                ),
              };
            case "antenna":
              return {
                antennas: state.antennas.map((a) =>
                  a.id === equipmentId ? { ...a, imageId } : a,
                ),
              };
            case "feedline":
              return {
                feedlines: state.feedlines.map((f) =>
                  f.id === equipmentId ? { ...f, imageId } : f,
                ),
              };
            case "accessory":
              return {
                accessories: state.accessories.map((a) =>
                  a.id === equipmentId
                    ? ({ ...a, imageId } as UserAccessory)
                    : a,
                ),
              };
            case "inline":
              return {
                inlineComponents: state.inlineComponents.map((c) =>
                  c.id === equipmentId
                    ? ({ ...c, imageId } as InlineComponent)
                    : c,
                ),
              };
          }
        });
      },

      clearEquipmentImage: (type, equipmentId) => {
        let oldImageId: string | undefined;

        // Find the current imageId before clearing
        const state = get();
        switch (type) {
          case "radio":
            oldImageId = state.radios.find(
              (r) => r.id === equipmentId,
            )?.imageId;
            break;
          case "antenna":
            oldImageId = state.antennas.find(
              (a) => a.id === equipmentId,
            )?.imageId;
            break;
          case "feedline":
            oldImageId = state.feedlines.find(
              (f) => f.id === equipmentId,
            )?.imageId;
            break;
          case "accessory":
            oldImageId = state.accessories.find(
              (a) => a.id === equipmentId,
            )?.imageId;
            break;
          case "inline":
            oldImageId = state.inlineComponents.find(
              (c) => c.id === equipmentId,
            )?.imageId;
            break;
        }

        // Delete the blob from IndexedDB
        if (oldImageId) {
          deleteImage(oldImageId).catch(() => {
            /* best-effort cleanup */
          });
        }

        set((s) => {
          switch (type) {
            case "radio":
              return {
                radios: s.radios.map((r) =>
                  r.id === equipmentId ? { ...r, imageId: undefined } : r,
                ),
              };
            case "antenna":
              return {
                antennas: s.antennas.map((a) =>
                  a.id === equipmentId ? { ...a, imageId: undefined } : a,
                ),
              };
            case "feedline":
              return {
                feedlines: s.feedlines.map((f) =>
                  f.id === equipmentId ? { ...f, imageId: undefined } : f,
                ),
              };
            case "accessory":
              return {
                accessories: s.accessories.map((a) =>
                  a.id === equipmentId
                    ? ({ ...a, imageId: undefined } as UserAccessory)
                    : a,
                ),
              };
            case "inline":
              return {
                inlineComponents: s.inlineComponents.map((c) =>
                  c.id === equipmentId
                    ? ({ ...c, imageId: undefined } as InlineComponent)
                    : c,
                ),
              };
          }
        });
      },

      // === Gallery Management ===

      addGalleryImage: (type, equipmentId, imageId) => {
        set((state) => {
          switch (type) {
            case "radio": {
              return {
                radios: state.radios.map((r) => {
                  if (r.id !== equipmentId) return r;
                  const existing = r.galleryImageIds ?? [];
                  if (existing.length >= 5) return r;
                  if (existing.includes(imageId)) return r;
                  return { ...r, galleryImageIds: [...existing, imageId] };
                }),
              };
            }
            case "antenna": {
              return {
                antennas: state.antennas.map((a) => {
                  if (a.id !== equipmentId) return a;
                  const existing = a.galleryImageIds ?? [];
                  if (existing.length >= 5) return a;
                  if (existing.includes(imageId)) return a;
                  return { ...a, galleryImageIds: [...existing, imageId] };
                }),
              };
            }
            case "accessory": {
              return {
                accessories: state.accessories.map((a) => {
                  if (a.id !== equipmentId) return a;
                  const existing = a.galleryImageIds ?? [];
                  if (existing.length >= 5) return a;
                  if (existing.includes(imageId)) return a;
                  return {
                    ...a,
                    galleryImageIds: [...existing, imageId],
                  } as UserAccessory;
                }),
              };
            }
          }
        });
      },

      removeGalleryImage: (type, equipmentId, imageId) => {
        // Delete the blob from IndexedDB
        deleteImage(imageId).catch(() => {
          /* best-effort cleanup */
        });

        set((state) => {
          switch (type) {
            case "radio": {
              return {
                radios: state.radios.map((r) => {
                  if (r.id !== equipmentId) return r;
                  return {
                    ...r,
                    galleryImageIds: (r.galleryImageIds ?? []).filter(
                      (id) => id !== imageId,
                    ),
                  };
                }),
              };
            }
            case "antenna": {
              return {
                antennas: state.antennas.map((a) => {
                  if (a.id !== equipmentId) return a;
                  return {
                    ...a,
                    galleryImageIds: (a.galleryImageIds ?? []).filter(
                      (id) => id !== imageId,
                    ),
                  };
                }),
              };
            }
            case "accessory": {
              return {
                accessories: state.accessories.map((a) => {
                  if (a.id !== equipmentId) return a;
                  return {
                    ...a,
                    galleryImageIds: (a.galleryImageIds ?? []).filter(
                      (id) => id !== imageId,
                    ),
                  } as UserAccessory;
                }),
              };
            }
          }
        });
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
      version: 5,
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
        stationChains: state.stationChains,
        activeChainId: state.activeChainId,
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
        if (version < 4) {
          // Auto-convert existing stationPresets to stationChains
          const presets = (state.stationPresets as StationPreset[]) ?? [];
          const chains: StationChain[] = presets.map((preset) => {
            const nodes: ChainNode[] = [];
            // Radio node
            if (preset.radioId) {
              nodes.push({ type: "radio", radioId: preset.radioId });
            }
            // Accessory nodes (all accessories were signal-path in old presets)
            for (const accId of preset.accessoryIds ?? []) {
              nodes.push({ type: "accessory", accessoryId: accId });
            }
            // Feedline run
            const feedlineRuns: FeedlineRun[] = [];
            if (preset.feedlineId) {
              const runId = crypto.randomUUID();
              feedlineRuns.push({
                id: runId,
                feedlineId: preset.feedlineId,
                inlineComponentIds: preset.inlineComponentIds ?? [],
              });
              nodes.push({ type: "feedline_run", feedlineRunId: runId });
            }
            // Antenna node
            if (preset.antennaId) {
              nodes.push({ type: "antenna", antennaId: preset.antennaId });
            }
            return {
              id: preset.id,
              name: preset.name,
              nodes,
              feedlineRuns,
              operatingPowerWatts: preset.operatingPowerWatts,
              linkedLocationId: preset.linkedLocationId,
              shackAccessoryIds: [],
              notes: preset.notes,
              createdAt: preset.createdAt,
            };
          });
          state.stationChains = chains;
          state.activeChainId = (state.activePresetId as string | null) ?? null;
        }
        if (version < 5) {
          // v4→v5: imageId fields are optional — no data migration needed
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

/**
 * Hook to get all station chains
 */
export function useStationChains(): StationChain[] {
  return useShackStore((s) => s.stationChains);
}

/**
 * Hook to get the active station chain
 */
export function useActiveChain(): StationChain | null {
  const activeChainId = useShackStore((s) => s.activeChainId);
  const chains = useShackStore((s) => s.stationChains);
  if (!activeChainId) return null;
  return chains.find((c) => c.id === activeChainId) ?? null;
}

export function getStationInventory(): StationInventory {
  const state = useShackStore.getState();
  return {
    radios: (state.radios || []).map((userRadio) => ({
      userRadio,
      equipment: resolveEquipmentById(userRadio.equipmentId, state.customRadios),
    })),
    antennas: state.antennas,
    feedlines: state.feedlines,
    accessories: state.accessories,
    inlineComponents: state.inlineComponents,
  };
}

export function useStationInventory(): StationInventory {
  const radios = useUserRadios();
  const antennas = useUserAntennas();
  const feedlines = useUserFeedlines();
  const accessories = useUserAccessories();
  const inlineComponents = useInlineComponents();
  return { radios, antennas, feedlines, accessories, inlineComponents };
}

// Re-export helpers for use by migration utility and sync modules
export { isLegacyUserRadio, isUserRadio, createUserRadioInstance };
