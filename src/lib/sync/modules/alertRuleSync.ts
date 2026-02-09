/**
 * Alert rule sync module — Tier 3 (Lazy)
 *
 * Syncs the `alert_rules` table. Immediate push on CRUD, full pull on load.
 * Alert rules are stored in IndexedDB locally (not a Zustand store).
 * This module bridges IndexedDB ↔ Supabase.
 */

import { getSupabase } from "@/lib/supabase";
import { getAllAlertRules } from "@/lib/db/alertStore";
import { getDB } from "@/lib/db";
import type {
  AlertRule,
  AlertConditions,
  AlertNotification,
} from "@/lib/db/types";
import type { SyncModule, SyncableTable, WriteQueueEntry } from "../types";
import type { Tables, TablesInsert } from "@/types/supabase";
import type { Json } from "@/types/supabase";

function rowToAlertRule(row: Tables<"alert_rules">): AlertRule {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    conditions: row.conditions as unknown as AlertConditions,
    notification: row.notification as unknown as AlertNotification,
    createdAt: row.created_at,
  };
}

function alertRuleToRow(
  rule: AlertRule,
  userId: string,
): TablesInsert<"alert_rules"> {
  return {
    id: rule.id,
    user_id: userId,
    name: rule.name,
    enabled: rule.enabled,
    conditions: rule.conditions as unknown as Json,
    notification: rule.notification as unknown as Json,
    created_at: rule.createdAt,
  };
}

export const alertRuleSync: SyncModule = {
  name: "alertRules",
  tier: "lazy",
  tables: ["alert_rules"] as SyncableTable[],

  async pull(userId: string, _since: string | null): Promise<string | null> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("alert_rules")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      throw new Error(`Alert rules pull failed: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return null;
    }

    const serverRules = data.map(rowToAlertRule);

    // Use db.put() to write server rules with their original IDs.
    // addAlertRule() would generate a new ID which we don't want on pull.
    const db = await getDB();
    for (const rule of serverRules) {
      // put() inserts or updates — preserves the server's ID and createdAt
      await db.put("alertRules", rule);
    }

    // Local rules not on server — keep them (they'll be pushed on next push)
    // We don't delete local-only rules since they may not have been pushed yet

    let maxTs: string | null = null;
    for (const row of data) {
      if (!maxTs || row.created_at > maxTs) maxTs = row.created_at;
    }
    return maxTs;
  },

  async push(userId: string): Promise<void> {
    const supabase = getSupabase();
    const rules = await getAllAlertRules();

    if (rules.length > 0) {
      const rows = rules.map((r) => alertRuleToRow(r, userId));
      const { error } = await supabase
        .from("alert_rules")
        .upsert(rows, { onConflict: "user_id,id" });

      if (error) {
        throw new Error(`Alert rules push failed: ${error.message}`);
      }
    }

    // Note: No orphan deletion — deletions handled via processQueue with
    // explicit delete operations from the write queue.
  },

  async processQueue(
    userId: string,
    entries: WriteQueueEntry[],
  ): Promise<string[]> {
    const supabase = getSupabase();
    const processed: string[] = [];

    for (const entry of entries) {
      if (entry.operation === "upsert") {
        const { user_id: _uid, ...data } = entry.data as Record<
          string,
          unknown
        > & { user_id?: unknown };
        const { error } = await supabase.from("alert_rules").upsert(
          {
            ...data,
            user_id: userId,
          } as TablesInsert<"alert_rules">,
          { onConflict: "id" },
        );
        if (!error) processed.push(entry.queueId);
      } else if (entry.operation === "delete") {
        const { error } = await supabase
          .from("alert_rules")
          .delete()
          .eq("user_id", userId)
          .eq("id", entry.data.id as string);
        if (!error) processed.push(entry.queueId);
      }
    }

    return processed;
  },
};
