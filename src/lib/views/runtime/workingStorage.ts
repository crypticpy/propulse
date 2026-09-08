import { viewConfigurationSchema, type ViewConfiguration } from "../contracts";

export const WORKING_SLOT_PREFIX = "propulse-view-working/v1";

export interface WorkingSlotRecord {
  config: ViewConfiguration;
  workingRevision: number;
  sourceView: { id: string; revision: number } | null;
}

export interface WorkingSlotStorage {
  read(namespace: string, slotId: string): WorkingSlotRecord | null;
  write(namespace: string, slotId: string, record: WorkingSlotRecord): void;
  clear(namespace: string, slotId: string): void;
  clearNamespace(namespace: string): void;
}

const FORBIDDEN_KEYS = [
  "instanceId", "target", "selectedReportId", "selectedPathPointId", "expandedGroupIds",
  "popup", "animationQueue", "animationClock", "measuredQuality", "hover",
];

export function workingSlotKey(namespace: string, slotId: string): string {
  return `${WORKING_SLOT_PREFIX}/${namespace}/${slotId}`;
}

function cloneConfig(config: ViewConfiguration): ViewConfiguration {
  return viewConfigurationSchema.parse(JSON.parse(JSON.stringify(config)));
}

function parseRecord(raw: string): WorkingSlotRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (FORBIDDEN_KEYS.some((key) => key in record)) return null;
  if (record.v !== 1) return null;
  const config = viewConfigurationSchema.safeParse(record.config);
  if (!config.success) return null;
  const workingRevision = record.workingRevision;
  if (typeof workingRevision !== "number" || !Number.isInteger(workingRevision) || workingRevision < 0) {
    return null;
  }
  let sourceView: WorkingSlotRecord["sourceView"] = null;
  if (record.sourceView != null) {
    const source = record.sourceView as { id?: unknown; revision?: unknown };
    if (typeof source.id !== "string" || typeof source.revision !== "number") return null;
    sourceView = { id: source.id, revision: source.revision };
  }
  return { config: config.data, workingRevision, sourceView };
}

export function createMemoryWorkingStorage(initial?: Map<string, string>): WorkingSlotStorage {
  const values = initial ?? new Map<string, string>();
  return {
    read(namespace, slotId) {
      const raw = values.get(workingSlotKey(namespace, slotId));
      return raw ? parseRecord(raw) : null;
    },
    write(namespace, slotId, record) {
      values.set(workingSlotKey(namespace, slotId), JSON.stringify({
        v: 1,
        config: cloneConfig(record.config),
        workingRevision: record.workingRevision,
        sourceView: record.sourceView,
      }));
    },
    clear(namespace, slotId) {
      values.delete(workingSlotKey(namespace, slotId));
    },
    clearNamespace(namespace) {
      const prefix = `${WORKING_SLOT_PREFIX}/${namespace}/`;
      for (const key of [...values.keys()]) {
        if (key.startsWith(prefix)) values.delete(key);
      }
    },
  };
}

export function createSessionWorkingStorage(storage: Storage): WorkingSlotStorage {
  return {
    read(namespace, slotId) {
      try {
        const raw = storage.getItem(workingSlotKey(namespace, slotId));
        return raw ? parseRecord(raw) : null;
      } catch {
        return null;
      }
    },
    write(namespace, slotId, record) {
      try {
        storage.setItem(workingSlotKey(namespace, slotId), JSON.stringify({
          v: 1,
          config: cloneConfig(record.config),
          workingRevision: record.workingRevision,
          sourceView: record.sourceView,
        }));
      } catch {
        /* Quota or private-mode failures leave the in-memory runtime authoritative. */
      }
    },
    clear(namespace, slotId) {
      try {
        storage.removeItem(workingSlotKey(namespace, slotId));
      } catch {
        /* ignore */
      }
    },
    clearNamespace(namespace) {
      const prefix = `${WORKING_SLOT_PREFIX}/${namespace}/`;
      try {
        const keys: string[] = [];
        for (let i = 0; i < storage.length; i += 1) {
          const key = storage.key(i);
          if (key?.startsWith(prefix)) keys.push(key);
        }
        for (const key of keys) storage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export function defaultSessionStorage(): Storage | null {
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}
