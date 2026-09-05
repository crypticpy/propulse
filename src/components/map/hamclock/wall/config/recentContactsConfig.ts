import { z } from "zod";
import type { WidgetConfig } from "@/stores/hamclockWidgetConfigStore";
import { RecentContactsConfigPanel } from "./RecentContactsConfigPanel";

/**
 * Rows the recent-contacts tile draws. `RecentContactsTile` was built around
 * a hard visual ceiling of 4 (its own comment: "what the tile can show
 * without shrinking the callsign type") — so this config only ever asks for
 * *fewer* rows, never more, which keeps a configured tile inside the same
 * height the unconfigured tile already proved out. It is the wall's smallest
 * "genuinely useful" per-widget option: an operator with a busy rail can
 * trade contact history for room, without ever risking an overflow.
 */
export const recentContactsConfigSchema = z.object({
  rowCount: z.union([z.literal(2), z.literal(3), z.literal(4)]),
});

export type RecentContactsConfig = z.infer<typeof recentContactsConfigSchema>;

export const RECENT_CONTACTS_CONFIG_DEFAULTS: RecentContactsConfig = {
  rowCount: 4,
};

/**
 * The reference `WidgetConfig` for guide §9's contract: built exactly once
 * here, then consumed as-is by both `RecentContactsTile` (`useWidgetConfig`)
 * and `WALL_TILES` (`registerWidgetConfig`) — no other file re-assembles the
 * schema/defaults/panel triple from its parts.
 */
export const recentContactsConfig: WidgetConfig<RecentContactsConfig> = {
  schema: recentContactsConfigSchema,
  defaults: RECENT_CONTACTS_CONFIG_DEFAULTS,
  ConfigPanel: RecentContactsConfigPanel,
};
