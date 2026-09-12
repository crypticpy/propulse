import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  GEAR_DELETION_RETENTION_MS,
  gearDeletionKey,
  type GearDeletionTable,
} from "@/lib/sync/shackDeletionIntent";
import { useShackStore } from "@/stores/shackStore";
import type { SettingsBackup } from "@/lib/utils/settingsBackup";

export interface RestoreGearRef {
  table: GearDeletionTable;
  recordId: string;
  label: string;
}

export type SkippedRestoreGearReason =
  | "tombstoned"
  | "purged"
  | "pending_deletion";

export interface SkippedRestoreGearItem {
  table: GearDeletionTable;
  recordId: string;
  label: string;
  reason: SkippedRestoreGearReason;
}

function gearIdColumn(table: GearDeletionTable): "instance_id" | "id" {
  return table === "user_radios" ? "instance_id" : "id";
}

function labelForGear(
  table: GearDeletionTable,
  recordId: string,
  backup: SettingsBackup,
): string {
  const prefs = backup.userPreferences?.preferences as
    | { radios?: Array<{ id: string; nickname?: string }> }
    | undefined;
  switch (table) {
    case "user_radios":
      return (
        prefs?.radios?.find((radio) => radio.id === recordId)?.nickname ??
        recordId
      );
    case "custom_radios":
      return (
        (
          backup.userPreferences?.preferences as
            | { customRadios?: Array<{ id: string; displayName?: string }> }
            | undefined
        )?.customRadios?.find((radio) => radio.id === recordId)?.displayName ??
        recordId
      );
    case "antennas":
      return (
        backup.shackEquipment?.antennas?.find((item) => item.id === recordId)
          ?.name ?? recordId
      );
    case "feedlines":
      return (
        backup.shackEquipment?.feedlines?.find((item) => item.id === recordId)
          ?.name ?? recordId
      );
    case "inline_components":
      return (
        backup.shackEquipment?.inlineComponents?.find(
          (item) => item.id === recordId,
        )?.name ?? recordId
      );
    case "accessories":
      return (
        backup.shackEquipment?.accessories?.find((item) => item.id === recordId)
          ?.name ?? recordId
      );
    case "station_presets":
      return (
        backup.shackEquipment?.stationPresets?.find(
          (item) => item.id === recordId,
        )?.name ?? recordId
      );
    case "station_chains":
      return (
        backup.shackEquipment?.stationChains?.find(
          (item) => item.id === recordId,
        )?.name ?? recordId
      );
    default:
      return recordId;
  }
}

export function collectBackupGearRefs(backup: SettingsBackup): RestoreGearRef[] {
  const refs: RestoreGearRef[] = [];
  const prefs = backup.userPreferences?.preferences as
    | {
        radios?: Array<{ id: string }>;
        customRadios?: Array<{ id: string }>;
      }
    | undefined;

  for (const radio of prefs?.radios ?? []) {
    refs.push({
      table: "user_radios",
      recordId: radio.id,
      label: labelForGear("user_radios", radio.id, backup),
    });
  }
  for (const radio of prefs?.customRadios ?? []) {
    refs.push({
      table: "custom_radios",
      recordId: radio.id,
      label: labelForGear("custom_radios", radio.id, backup),
    });
  }
  for (const antenna of backup.shackEquipment?.antennas ?? []) {
    refs.push({
      table: "antennas",
      recordId: antenna.id,
      label: labelForGear("antennas", antenna.id, backup),
    });
  }
  for (const feedline of backup.shackEquipment?.feedlines ?? []) {
    refs.push({
      table: "feedlines",
      recordId: feedline.id,
      label: labelForGear("feedlines", feedline.id, backup),
    });
  }
  for (const component of backup.shackEquipment?.inlineComponents ?? []) {
    refs.push({
      table: "inline_components",
      recordId: component.id,
      label: labelForGear("inline_components", component.id, backup),
    });
  }
  for (const accessory of backup.shackEquipment?.accessories ?? []) {
    refs.push({
      table: "accessories",
      recordId: accessory.id,
      label: labelForGear("accessories", accessory.id, backup),
    });
  }
  for (const preset of backup.shackEquipment?.stationPresets ?? []) {
    refs.push({
      table: "station_presets",
      recordId: preset.id,
      label: labelForGear("station_presets", preset.id, backup),
    });
  }
  for (const chain of backup.shackEquipment?.stationChains ?? []) {
    refs.push({
      table: "station_chains",
      recordId: chain.id,
      label: labelForGear("station_chains", chain.id, backup),
    });
  }
  return refs;
}

function refsByTable(
  refs: readonly RestoreGearRef[],
): Map<GearDeletionTable, RestoreGearRef[]> {
  const grouped = new Map<GearDeletionTable, RestoreGearRef[]>();
  for (const ref of refs) {
    const bucket = grouped.get(ref.table) ?? [];
    bucket.push(ref);
    grouped.set(ref.table, bucket);
  }
  return grouped;
}

async function fetchServerTombstoneKeys(
  userId: string,
  refs: readonly RestoreGearRef[],
): Promise<Map<string, SkippedRestoreGearReason>> {
  const blocked = new Map<string, SkippedRestoreGearReason>();
  if (!isSupabaseConfigured || refs.length === 0) {
    return blocked;
  }

  const supabase = getSupabase();
  for (const [table, tableRefs] of refsByTable(refs)) {
    const idColumn = gearIdColumn(table);
    const ids = tableRefs.map((ref) => ref.recordId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from(table as any) as any)
      .select(`${idColumn}, deleted_at`)
      .eq("user_id", userId)
      .in(idColumn, ids);

    if (error) {
      throw new Error(
        `[settingsBackup] Failed to query ${table} tombstones: ${error.message}`,
      );
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const seen = new Set<string>();
    for (const row of rows) {
      const recordId = String(row[idColumn]);
      seen.add(recordId);
      const key = gearDeletionKey({ table, recordId });
      if (row.deleted_at) {
        blocked.set(key, "tombstoned");
      }
    }

  }

  return blocked;
}

function localBlockedKeys(userId: string): Map<string, SkippedRestoreGearReason> {
  const blocked = new Map<string, SkippedRestoreGearReason>();
  const shack = useShackStore.getState();
  const cutoff = Date.now() - GEAR_DELETION_RETENTION_MS;

  for (const pending of shack.pendingGearDeletions) {
    if (pending.ownerId !== userId) continue;
    blocked.set(
      gearDeletionKey(pending),
      "pending_deletion",
    );
  }

  for (const ack of shack.acknowledgedGearDeletions) {
    if (ack.ownerId !== userId) continue;
    if (Date.parse(ack.acknowledgedAt) < cutoff) continue;
    blocked.set(gearDeletionKey(ack), "purged");
  }

  return blocked;
}

export async function resolveRestoreGearBlocks(
  userId: string,
  refs: readonly RestoreGearRef[],
): Promise<{
  blockedKeys: Set<string>;
  skipped: SkippedRestoreGearItem[];
}> {
  if (refs.length === 0) {
    return { blockedKeys: new Set(), skipped: [] };
  }

  const blocked = localBlockedKeys(userId);
  if (isSupabaseConfigured) {
    const serverBlocked = await fetchServerTombstoneKeys(userId, refs);
    for (const [key, reason] of serverBlocked) {
      if (reason === "tombstoned" || !blocked.has(key)) {
        blocked.set(key, reason);
      }
    }
  }

  const skipped: SkippedRestoreGearItem[] = [];
  for (const ref of refs) {
    const key = gearDeletionKey(ref);
    const reason = blocked.get(key);
    if (!reason) continue;
    skipped.push({ ...ref, reason });
  }

  return {
    blockedKeys: new Set(skipped.map((item) => gearDeletionKey(item))),
    skipped,
  };
}

export function filterBlockedGearFromBackup(
  backup: SettingsBackup,
  blockedKeys: ReadonlySet<string>,
): SettingsBackup {
  if (blockedKeys.size === 0) {
    return backup;
  }

  const keep = (table: GearDeletionTable, recordId: string) =>
    !blockedKeys.has(gearDeletionKey({ table, recordId }));

  const prefs = backup.userPreferences?.preferences as
    | {
        radios?: Array<{ id: string }>;
        customRadios?: Array<{ id: string }>;
        activeRadioId?: string | null;
      }
    | undefined;

  const filteredRadios = prefs?.radios?.filter((radio) =>
    keep("user_radios", radio.id),
  );
  const filteredCustomRadios = prefs?.customRadios?.filter((radio) =>
    keep("custom_radios", radio.id),
  );
  const activeRadioId =
    prefs?.activeRadioId &&
    keep("user_radios", prefs.activeRadioId)
      ? prefs.activeRadioId
      : null;

  const shack = backup.shackEquipment;
  const filteredShack = shack
    ? {
        antennas: shack.antennas.filter((item) => keep("antennas", item.id)),
        feedlines: shack.feedlines.filter((item) =>
          keep("feedlines", item.id),
        ),
        inlineComponents: (shack.inlineComponents ?? []).filter((item) =>
          keep("inline_components", item.id),
        ),
        accessories: shack.accessories.filter((item) =>
          keep("accessories", item.id),
        ),
        stationPresets: shack.stationPresets.filter((item) =>
          keep("station_presets", item.id),
        ),
        activePresetId:
          shack.activePresetId &&
          keep("station_presets", shack.activePresetId)
            ? shack.activePresetId
            : null,
        ...(shack.stationChains !== undefined
          ? {
              stationChains: shack.stationChains.filter((item) =>
                keep("station_chains", item.id),
              ),
            }
          : {}),
        activeChainId:
          shack.activeChainId && keep("station_chains", shack.activeChainId)
            ? shack.activeChainId
            : null,
      }
    : undefined;

  return {
    ...backup,
    userPreferences: {
      ...backup.userPreferences,
      preferences: {
        ...backup.userPreferences.preferences,
        ...(filteredRadios !== undefined ? { radios: filteredRadios } : {}),
        ...(filteredCustomRadios !== undefined
          ? { customRadios: filteredCustomRadios }
          : {}),
        activeRadioId,
      } as SettingsBackup["userPreferences"]["preferences"],
    },
    ...(filteredShack ? { shackEquipment: filteredShack } : {}),
  };
}
