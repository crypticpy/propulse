/**
 * Shack sync module — Tier 1 (Eager)
 *
 * Syncs all shack equipment data across 5 Supabase tables:
 *   - user_radios    — Radio instances
 *   - antennas       — User antennas
 *   - feedlines      — User feedlines
 *   - accessories    — User accessories
 *   - station_presets — Station presets
 *
 * Uses full-blob push (no processQueue). Json columns carry a `_snapshot`
 * of the full local object for lossless round-trip; direct columns serve
 * as indexed/queryable fields.
 */

import { getSupabase } from "@/lib/supabase";
import { useShackStore } from "@/stores/shackStore";
import type { SyncModule, SyncableTable } from "../types";
import type { Json, TablesInsert } from "@/types/supabase";
import type { UserRadio } from "@/types/radio";
import type {
  UserAntenna,
  UserFeedline,
  UserAccessory,
  StationPreset,
} from "@/types/shack";

// ─── Helpers ────────────────────────────────────────────────────────────────

const FEET_TO_METERS = 0.3048;

/**
 * Return the latest ISO timestamp from a list. Returns null if empty.
 */
function maxTimestamp(
  timestamps: (string | null | undefined)[],
): string | null {
  let max: string | null = null;
  for (const ts of timestamps) {
    if (ts && (!max || ts > max)) {
      max = ts;
    }
  }
  return max;
}

// ─── Local → Supabase row mappers ───────────────────────────────────────────

function radioToRow(
  radio: UserRadio,
  userId: string,
): TablesInsert<"user_radios"> {
  return {
    instance_id: radio.id,
    user_id: userId,
    equipment_id: radio.equipmentId,
    nickname: radio.nickname ?? null,
    tx_power_setting: radio.customPowerLimit ?? null,
    purchase_date: radio.purchaseDate ?? null,
    firmware_version: radio.firmwareRevision ?? null,
    serial_number: null, // No direct local field; preserved in snapshot
    notes: radio.notes ?? null,
    wiring: radio.wiringConfiguration ?? null,
    specs_override: { _snapshot: radio } as unknown as Json,
    created_at: radio.addedAt,
    updated_at: new Date().toISOString(),
  };
}

function antennaToRow(
  antenna: UserAntenna,
  userId: string,
): TablesInsert<"antennas"> {
  return {
    id: antenna.id,
    user_id: userId,
    name: antenna.name,
    type: antenna.antennaType,
    bands: antenna.bands,
    height_agl: antenna.heightMeters,
    azimuth: antenna.azimuthDeg ?? null,
    is_rotatable: antenna.isRotatable ?? false,
    is_portable: antenna.mounting === "portable",
    polarization: antenna.polarization,
    mounting: antenna.mounting,
    manufacturer: antenna.manufacturer ?? null,
    notes: antenna.notes ?? null,
    gain_dbi: (antenna.gainDbiOverride ?? null) as unknown as Json,
    swr_data: {
      swr: antenna.swrByBand ?? null,
      _snapshot: antenna,
    } as unknown as Json,
    created_at: antenna.addedAt,
    updated_at: new Date().toISOString(),
    // Columns without a direct local mapping default to null
    beamwidth_deg: null,
    front_to_back_db: null,
    feedpoint_impedance: null,
    radial_count: null,
    radial_length_m: null,
    installation_date: null,
  };
}

function feedlineToRow(
  feedline: UserFeedline,
  userId: string,
): TablesInsert<"feedlines"> {
  return {
    id: feedline.id,
    user_id: userId,
    type: feedline.feedlineType,
    length_meters: feedline.lengthFeet * FEET_TO_METERS,
    connectors: {
      connectorType: feedline.connectorType,
      connectorTypeFarEnd: feedline.connectorTypeFarEnd ?? null,
      connectorCount: feedline.connectorCount,
      _snapshot: feedline,
    } as unknown as Json,
    condition: feedline.condition,
    manufacturer: feedline.manufacturer ?? null,
    notes: feedline.notes ?? null,
    created_at: feedline.addedAt,
    updated_at: new Date().toISOString(),
    installation_date: feedline.yearInstalled
      ? `${feedline.yearInstalled}-01-01`
      : null,
  };
}

function accessoryToRow(
  accessory: UserAccessory,
  userId: string,
): TablesInsert<"accessories"> {
  return {
    id: accessory.id,
    user_id: userId,
    model: accessory.name,
    category: accessory.category,
    bands:
      "bands" in accessory && Array.isArray(accessory.bands)
        ? accessory.bands
        : [],
    manufacturer: accessory.manufacturer ?? null,
    notes: accessory.notes ?? null,
    specs: { _snapshot: accessory } as unknown as Json,
    created_at: accessory.addedAt,
    updated_at: new Date().toISOString(),
  };
}

function presetToRow(
  preset: StationPreset,
  userId: string,
): TablesInsert<"station_presets"> {
  return {
    id: preset.id,
    user_id: userId,
    name: preset.name,
    description: preset.notes ?? null,
    radio_instance_id: preset.radioId ?? null,
    antenna_id: preset.antennaId ?? null,
    feedline_id: preset.feedlineId ?? null,
    accessory_ids: preset.accessoryIds ?? [],
    is_active: false,
    linked_location_id: null,
    created_at: preset.createdAt,
    updated_at: new Date().toISOString(),
  };
}

// ─── Supabase row → Local type mappers ──────────────────────────────────────

/**
 * Reconstruct a local type from a Supabase row, preferring the `_snapshot`
 * stored in the Json column for lossless round-trip. Falls back to
 * column-based reconstruction when no snapshot is available.
 */

function rowToRadio(row: {
  instance_id: string;
  equipment_id: string;
  nickname: string | null;
  tx_power_setting: number | null;
  purchase_date: string | null;
  firmware_version: string | null;
  notes: string | null;
  wiring: string | null;
  specs_override: Json | null;
  created_at: string;
}): UserRadio {
  // Prefer snapshot from Json column
  const override = row.specs_override as Record<string, unknown> | null;
  if (override?._snapshot) {
    return override._snapshot as UserRadio;
  }

  // Column-based fallback
  return {
    id: row.instance_id,
    equipmentId: row.equipment_id,
    nickname: row.nickname ?? undefined,
    customPowerLimit: row.tx_power_setting ?? undefined,
    purchaseDate: row.purchase_date ?? undefined,
    firmwareRevision: row.firmware_version ?? undefined,
    wiringConfiguration: row.wiring ?? undefined,
    notes: row.notes ?? undefined,
    addedAt: row.created_at,
  };
}

function rowToAntenna(row: {
  id: string;
  name: string;
  type: string;
  bands: string[];
  height_agl: number | null;
  azimuth: number | null;
  is_rotatable: boolean;
  polarization: string | null;
  mounting: string | null;
  manufacturer: string | null;
  notes: string | null;
  gain_dbi: Json | null;
  swr_data: Json | null;
  created_at: string;
}): UserAntenna {
  // Prefer snapshot from swr_data Json column
  const swrData = row.swr_data as Record<string, unknown> | null;
  if (swrData?._snapshot) {
    return swrData._snapshot as UserAntenna;
  }

  // Column-based fallback
  return {
    id: row.id,
    name: row.name,
    antennaType: row.type as UserAntenna["antennaType"],
    gainPatternType: row.type as UserAntenna["gainPatternType"],
    bands: row.bands,
    heightMeters: row.height_agl ?? 0,
    azimuthDeg: row.azimuth ?? undefined,
    isRotatable: row.is_rotatable,
    polarization: (row.polarization ??
      "vertical") as UserAntenna["polarization"],
    mounting: (row.mounting ?? "mast") as UserAntenna["mounting"],
    manufacturer: row.manufacturer ?? undefined,
    gainDbiOverride: row.gain_dbi as Record<string, number> | undefined,
    swrByBand: (swrData?.swr as Record<string, number>) ?? undefined,
    notes: row.notes ?? undefined,
    addedAt: row.created_at,
  };
}

function rowToFeedline(row: {
  id: string;
  type: string;
  length_meters: number;
  connectors: Json | null;
  condition: string | null;
  manufacturer: string | null;
  notes: string | null;
  installation_date: string | null;
  created_at: string;
}): UserFeedline {
  // Prefer snapshot from connectors Json column
  const connectorsData = row.connectors as Record<string, unknown> | null;
  if (connectorsData?._snapshot) {
    return connectorsData._snapshot as UserFeedline;
  }

  // Column-based fallback
  return {
    id: row.id,
    name: row.type, // No name column; use type as fallback
    feedlineType: row.type as UserFeedline["feedlineType"],
    lengthFeet: row.length_meters / FEET_TO_METERS,
    connectorCount: (connectorsData?.connectorCount as number) ?? 2,
    connectorType:
      (connectorsData?.connectorType as UserFeedline["connectorType"]) ??
      "pl259",
    connectorTypeFarEnd:
      (connectorsData?.connectorTypeFarEnd as UserFeedline["connectorType"]) ??
      undefined,
    condition: (row.condition ?? "good") as UserFeedline["condition"],
    manufacturer: row.manufacturer ?? undefined,
    yearInstalled: row.installation_date
      ? parseInt(row.installation_date.slice(0, 4), 10) || undefined
      : undefined,
    notes: row.notes ?? undefined,
    addedAt: row.created_at,
  };
}

function rowToAccessory(row: {
  id: string;
  model: string;
  category: string;
  bands: string[];
  manufacturer: string | null;
  notes: string | null;
  specs: Json | null;
  created_at: string;
}): UserAccessory {
  // Prefer snapshot from specs Json column
  const specsData = row.specs as Record<string, unknown> | null;
  if (specsData?._snapshot) {
    return specsData._snapshot as UserAccessory;
  }

  // Column-based fallback — return a minimal AccessoryBase-compatible shape.
  // The discriminated union requires a `category`, so we cast through unknown.
  return {
    id: row.id,
    name: row.model,
    category: row.category,
    manufacturer: row.manufacturer ?? undefined,
    notes: row.notes ?? undefined,
    addedAt: row.created_at,
  } as unknown as UserAccessory;
}

function rowToPreset(row: {
  id: string;
  name: string;
  description: string | null;
  radio_instance_id: string | null;
  antenna_id: string | null;
  feedline_id: string | null;
  accessory_ids: string[];
  created_at: string;
}): StationPreset {
  return {
    id: row.id,
    name: row.name,
    radioId: row.radio_instance_id ?? "",
    antennaId: row.antenna_id ?? "",
    feedlineId: row.feedline_id ?? undefined,
    accessoryIds: row.accessory_ids ?? [],
    operatingPowerWatts: 100, // Default; no column mapping
    notes: row.description ?? undefined,
    createdAt: row.created_at,
  };
}

// ─── Sync Module ────────────────────────────────────────────────────────────

export const shackSync: SyncModule = {
  name: "shack",
  tier: "eager",
  tables: [
    "user_radios",
    "antennas",
    "feedlines",
    "accessories",
    "station_presets",
  ] as SyncableTable[],

  // ── Pull ────────────────────────────────────────────────────────────────

  async pull(userId: string, since: string | null): Promise<string | null> {
    const supabase = getSupabase();
    const timestamps: string[] = [];

    // --- Pull radios ---
    let radioQuery = supabase
      .from("user_radios")
      .select("*")
      .eq("user_id", userId);
    if (since) {
      radioQuery = radioQuery.gt("updated_at", since);
    }
    const { data: radioRows, error: radioError } = await radioQuery;
    if (radioError) {
      throw new Error(`Shack radios pull failed: ${radioError.message}`);
    }

    // --- Pull antennas ---
    let antennaQuery = supabase
      .from("antennas")
      .select("*")
      .eq("user_id", userId);
    if (since) {
      antennaQuery = antennaQuery.gt("updated_at", since);
    }
    const { data: antennaRows, error: antennaError } = await antennaQuery;
    if (antennaError) {
      throw new Error(`Shack antennas pull failed: ${antennaError.message}`);
    }

    // --- Pull feedlines ---
    let feedlineQuery = supabase
      .from("feedlines")
      .select("*")
      .eq("user_id", userId);
    if (since) {
      feedlineQuery = feedlineQuery.gt("updated_at", since);
    }
    const { data: feedlineRows, error: feedlineError } = await feedlineQuery;
    if (feedlineError) {
      throw new Error(`Shack feedlines pull failed: ${feedlineError.message}`);
    }

    // --- Pull accessories ---
    let accessoryQuery = supabase
      .from("accessories")
      .select("*")
      .eq("user_id", userId);
    if (since) {
      accessoryQuery = accessoryQuery.gt("updated_at", since);
    }
    const { data: accessoryRows, error: accessoryError } = await accessoryQuery;
    if (accessoryError) {
      throw new Error(
        `Shack accessories pull failed: ${accessoryError.message}`,
      );
    }

    // --- Pull station presets ---
    let presetQuery = supabase
      .from("station_presets")
      .select("*")
      .eq("user_id", userId);
    if (since) {
      presetQuery = presetQuery.gt("updated_at", since);
    }
    const { data: presetRows, error: presetError } = await presetQuery;
    if (presetError) {
      throw new Error(
        `Shack station presets pull failed: ${presetError.message}`,
      );
    }

    // --- Merge into local state ---
    const state = useShackStore.getState();
    const stateUpdate: Record<string, unknown> = {};

    // Radios: server wins for matching IDs, preserve local-only
    if (radioRows && radioRows.length > 0) {
      const serverRadios = radioRows.map(rowToRadio);
      for (const row of radioRows) {
        timestamps.push(row.updated_at);
      }
      const serverIdSet = new Set(serverRadios.map((r) => r.id));
      const localOnly = state.radios.filter((r) => !serverIdSet.has(r.id));
      stateUpdate.radios = [...serverRadios, ...localOnly];
    }

    // Antennas
    if (antennaRows && antennaRows.length > 0) {
      const serverAntennas = antennaRows.map(rowToAntenna);
      for (const row of antennaRows) {
        timestamps.push(row.updated_at);
      }
      const serverIdSet = new Set(serverAntennas.map((a) => a.id));
      const localOnly = state.antennas.filter((a) => !serverIdSet.has(a.id));
      stateUpdate.antennas = [...serverAntennas, ...localOnly];
    }

    // Feedlines
    if (feedlineRows && feedlineRows.length > 0) {
      const serverFeedlines = feedlineRows.map(rowToFeedline);
      for (const row of feedlineRows) {
        timestamps.push(row.updated_at);
      }
      const serverIdSet = new Set(serverFeedlines.map((f) => f.id));
      const localOnly = state.feedlines.filter((f) => !serverIdSet.has(f.id));
      stateUpdate.feedlines = [...serverFeedlines, ...localOnly];
    }

    // Accessories
    if (accessoryRows && accessoryRows.length > 0) {
      const serverAccessories = accessoryRows.map(rowToAccessory);
      for (const row of accessoryRows) {
        timestamps.push(row.updated_at);
      }
      const serverIdSet = new Set(serverAccessories.map((a) => a.id));
      const localOnly = state.accessories.filter((a) => !serverIdSet.has(a.id));
      stateUpdate.accessories = [...serverAccessories, ...localOnly];
    }

    // Station presets
    if (presetRows && presetRows.length > 0) {
      const serverPresets = presetRows.map(rowToPreset);
      for (const row of presetRows) {
        timestamps.push(row.updated_at);
      }
      const serverIdSet = new Set(serverPresets.map((p) => p.id));
      const localOnly = state.stationPresets.filter(
        (p) => !serverIdSet.has(p.id),
      );
      stateUpdate.stationPresets = [...serverPresets, ...localOnly];
    }

    // Single setState call for the entire pull
    if (Object.keys(stateUpdate).length > 0) {
      useShackStore.setState(stateUpdate);
    }

    return maxTimestamp(timestamps);
  },

  // ── Push ────────────────────────────────────────────────────────────────

  async push(userId: string): Promise<void> {
    const supabase = getSupabase();
    const { radios, antennas, feedlines, accessories, stationPresets } =
      useShackStore.getState();

    // --- Upsert radios ---
    if (radios.length > 0) {
      const radioRows = radios.map((r) => radioToRow(r, userId));
      const { error: radioError } = await supabase
        .from("user_radios")
        .upsert(radioRows, { onConflict: "instance_id" });

      if (radioError) {
        throw new Error(`Shack radios push failed: ${radioError.message}`);
      }
    }

    // --- Upsert antennas ---
    if (antennas.length > 0) {
      const antennaRows = antennas.map((a) => antennaToRow(a, userId));
      const { error: antennaError } = await supabase
        .from("antennas")
        .upsert(antennaRows, { onConflict: "id" });

      if (antennaError) {
        throw new Error(`Shack antennas push failed: ${antennaError.message}`);
      }
    }

    // --- Upsert feedlines ---
    if (feedlines.length > 0) {
      const feedlineRows = feedlines.map((f) => feedlineToRow(f, userId));
      const { error: feedlineError } = await supabase
        .from("feedlines")
        .upsert(feedlineRows, { onConflict: "id" });

      if (feedlineError) {
        throw new Error(
          `Shack feedlines push failed: ${feedlineError.message}`,
        );
      }
    }

    // --- Upsert accessories ---
    if (accessories.length > 0) {
      const accessoryRows = accessories.map((a) => accessoryToRow(a, userId));
      const { error: accessoryError } = await supabase
        .from("accessories")
        .upsert(accessoryRows, { onConflict: "id" });

      if (accessoryError) {
        throw new Error(
          `Shack accessories push failed: ${accessoryError.message}`,
        );
      }
    }

    // --- Upsert station presets ---
    if (stationPresets.length > 0) {
      const presetRows = stationPresets.map((p) => presetToRow(p, userId));
      const { error: presetError } = await supabase
        .from("station_presets")
        .upsert(presetRows, { onConflict: "id" });

      if (presetError) {
        throw new Error(
          `Shack station presets push failed: ${presetError.message}`,
        );
      }
    }

    // Note: We intentionally do NOT delete server-side rows missing from
    // the local set. In a multi-device scenario, another device may have
    // added equipment that this device hasn't pulled yet. Orphan cleanup
    // should be handled via explicit delete operations through the write queue.
  },
};
