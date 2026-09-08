import { z } from "zod";

/** Pure schemas shared by widget UI and persistence; no component/store imports. */
export const recentContactsConfigSchema = z.object({
  rowCount: z.union([z.literal(2), z.literal(3), z.literal(4)]),
});
export type RecentContactsConfig = z.infer<typeof recentContactsConfigSchema>;
export const RECENT_CONTACTS_CONFIG_DEFAULTS: RecentContactsConfig = { rowCount: 4 };

export const persistedWidgetSchemas: Readonly<Record<string, { version: number; schema: z.ZodTypeAny }>> = {
  recentContacts: { version: 1, schema: recentContactsConfigSchema.strict() },
};
