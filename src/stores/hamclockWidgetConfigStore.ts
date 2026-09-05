import type { ComponentType } from "react";
import type { ZodType } from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * A widget's configurable shape: how to validate a persisted value, what it
 * defaults to when nothing is stored (or the stored shape fails validation),
 * and the panel that edits it inside a `HamClockDialog`.
 */
export interface WidgetConfig<T> {
  schema: ZodType<T>;
  defaults: T;
  ConfigPanel: ComponentType<{ value: T; onChange: (next: T) => void }>;
}

/**
 * The same shape with `T` erased to `unknown`, so `WALL_TILES` can hold
 * heterogeneous widget configs in one record without an unsound cast at
 * every call site that reads the registry.
 */
export interface RegisteredWidgetConfig {
  schema: ZodType<unknown>;
  defaults: unknown;
  ConfigPanel: ComponentType<{
    value: unknown;
    onChange: (next: unknown) => void;
  }>;
}

/**
 * The only place a `WidgetConfig<T>` becomes a `RegisteredWidgetConfig`. The
 * erasure is sound because a value only ever flows back into its specific
 * type through `config.schema` (see `useWidgetConfig` below) — nothing reads
 * the erased `unknown` as if it were `T` without going through the schema
 * first, so there is no unsound cast anywhere else in the registry.
 */
export function registerWidgetConfig<T>(
  config: WidgetConfig<T>,
): RegisteredWidgetConfig {
  return config as unknown as RegisteredWidgetConfig;
}

interface HamClockWidgetConfigState {
  /** Keyed by tile id. Only tiles that have been configured have an entry. */
  widgets: Partial<Record<string, unknown>>;
  setWidgetConfig: (id: string, value: unknown) => void;
  resetWidgetConfig: (id: string) => void;
}

/**
 * Per-tile widget settings, persisted by tile id. Values are stored as
 * whatever shape the widget's schema last accepted; `useWidgetConfig` is
 * responsible for validating on read, this store just holds the bytes.
 */
export const useHamClockWidgetConfigStore =
  create<HamClockWidgetConfigState>()(
    persist(
      (set) => ({
        widgets: {},
        setWidgetConfig: (id, value) =>
          set((s) => ({ widgets: { ...s.widgets, [id]: value } })),
        resetWidgetConfig: (id) =>
          set((s) => {
            const next = { ...s.widgets };
            delete next[id];
            return { widgets: next };
          }),
      }),
      {
        name: "propulse-hamclock-widget-config",
        version: 1,
        storage: createJSONStorage(() => localStorage),
      },
    ),
  );

/**
 * Reads a widget's persisted config, falling back to `config.defaults` when
 * nothing is stored yet or the stored shape no longer matches the schema —
 * a stale shape from an older version of the panel never throws, it just
 * reverts to defaults. The setter validates before writing, so a caller
 * can never persist a value the schema rejects.
 */
export function useWidgetConfig<T>(
  id: string,
  config: WidgetConfig<T>,
): [T, (next: T) => void] {
  const stored = useHamClockWidgetConfigStore((s) => s.widgets[id]);
  const setWidgetConfig = useHamClockWidgetConfigStore(
    (s) => s.setWidgetConfig,
  );

  const parsed = config.schema.safeParse(stored);
  const value = parsed.success ? parsed.data : config.defaults;

  const setValue = (next: T) => {
    const result = config.schema.safeParse(next);
    if (!result.success) return;
    setWidgetConfig(id, result.data);
  };

  return [value, setValue];
}
