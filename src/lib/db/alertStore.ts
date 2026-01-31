/**
 * CRUD operations for alert rules and history in IndexedDB
 * Provides functions to manage DX alerting rules and their trigger history
 */

import { getDB } from "./index";
import { generateId, now } from "./utils";
import type { AlertRule, AlertHistoryEntry } from "./types";

// ============================================================================
// Alert Rules CRUD
// ============================================================================

/**
 * Add a new alert rule to the database
 * @param rule - Alert rule data without id and createdAt
 * @returns Promise resolving to the generated rule ID
 */
export async function addAlertRule(
  rule: Omit<AlertRule, "id" | "createdAt">,
): Promise<string> {
  const db = await getDB();
  const id = generateId();

  const alertRule: AlertRule = {
    ...rule,
    id,
    name: rule.name.trim(),
    createdAt: now(),
  };

  await db.add("alertRules", alertRule);
  return id;
}

/**
 * Get a single alert rule by ID
 * @param id - The rule's unique identifier
 * @returns Promise resolving to the alert rule or undefined if not found
 */
export async function getAlertRule(id: string): Promise<AlertRule | undefined> {
  const db = await getDB();
  return db.get("alertRules", id);
}

/**
 * Update an existing alert rule
 * @param id - The rule's unique identifier
 * @param updates - Partial alert rule with fields to update
 * @throws Error if the rule does not exist
 */
export async function updateAlertRule(
  id: string,
  updates: Partial<Omit<AlertRule, "id" | "createdAt">>,
): Promise<void> {
  const db = await getDB();
  const existing = await db.get("alertRules", id);

  if (!existing) {
    throw new Error(`Alert rule with id ${id} not found`);
  }

  const updated: AlertRule = {
    ...existing,
    ...updates,
    id: existing.id, // Prevent id change
    createdAt: existing.createdAt, // Prevent createdAt change
  };

  // Normalize name if it was updated
  if (updates.name) {
    updated.name = updates.name.trim();
  }

  await db.put("alertRules", updated);
}

/**
 * Delete an alert rule by ID
 * @param id - The rule's unique identifier
 */
export async function deleteAlertRule(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("alertRules", id);
}

/**
 * Get all alert rules from the database
 * @returns Promise resolving to array of all alert rules
 */
export async function getAllAlertRules(): Promise<AlertRule[]> {
  const db = await getDB();
  return db.getAll("alertRules");
}

/**
 * Get only enabled alert rules
 * @returns Promise resolving to array of enabled alert rules
 */
export async function getEnabledAlertRules(): Promise<AlertRule[]> {
  const db = await getDB();
  const allRules = await db.getAll("alertRules");
  return allRules.filter((rule) => rule.enabled);
}

/**
 * Toggle the enabled state of an alert rule
 * @param id - The rule's unique identifier
 * @throws Error if the rule does not exist
 */
export async function toggleAlertRule(id: string): Promise<void> {
  const db = await getDB();
  const existing = await db.get("alertRules", id);

  if (!existing) {
    throw new Error(`Alert rule with id ${id} not found`);
  }

  const updated: AlertRule = {
    ...existing,
    enabled: !existing.enabled,
  };

  await db.put("alertRules", updated);
}

/**
 * Update the lastTriggered timestamp for a rule
 * @param id - The rule's unique identifier
 */
export async function updateRuleLastTriggered(id: string): Promise<void> {
  const db = await getDB();
  const existing = await db.get("alertRules", id);

  if (existing) {
    const updated: AlertRule = {
      ...existing,
      lastTriggered: now(),
    };
    await db.put("alertRules", updated);
  }
}

/**
 * Get the total count of alert rules
 * @returns Promise resolving to the rule count
 */
export async function getAlertRuleCount(): Promise<number> {
  const db = await getDB();
  return db.count("alertRules");
}

// ============================================================================
// Alert History CRUD
// ============================================================================

/**
 * Add a new alert history entry
 * @param entry - History entry data without id
 * @returns Promise resolving to the generated entry ID
 */
export async function addAlertHistoryEntry(
  entry: Omit<AlertHistoryEntry, "id">,
): Promise<string> {
  const db = await getDB();
  const id = generateId();

  const historyEntry: AlertHistoryEntry = {
    ...entry,
    id,
  };

  await db.add("alertHistory", historyEntry);

  // Update the rule's lastTriggered timestamp
  await updateRuleLastTriggered(entry.ruleId);

  return id;
}

/**
 * Get alert history entries, optionally limited
 * @param limit - Optional maximum number of entries to return (most recent first)
 * @returns Promise resolving to array of history entries sorted by triggeredAt descending
 */
export async function getAlertHistory(
  limit?: number,
): Promise<AlertHistoryEntry[]> {
  const db = await getDB();
  const allEntries = await db.getAll("alertHistory");

  // Sort by triggeredAt descending (most recent first)
  allEntries.sort(
    (a, b) =>
      new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime(),
  );

  if (limit && limit > 0) {
    return allEntries.slice(0, limit);
  }

  return allEntries;
}

/**
 * Get undismissed alert history entries
 * @param limit - Optional maximum number of entries to return
 * @returns Promise resolving to array of undismissed history entries
 */
export async function getUndismissedAlertHistory(
  limit?: number,
): Promise<AlertHistoryEntry[]> {
  const history = await getAlertHistory(limit);
  return history.filter((entry) => !entry.dismissed);
}

/**
 * Dismiss an alert history entry
 * @param id - The history entry's unique identifier
 */
export async function dismissAlertHistory(id: string): Promise<void> {
  const db = await getDB();
  const existing = await db.get("alertHistory", id);

  if (existing) {
    const updated: AlertHistoryEntry = {
      ...existing,
      dismissed: true,
    };
    await db.put("alertHistory", updated);
  }
}

/**
 * Dismiss all undismissed alert history entries
 */
export async function dismissAllAlertHistory(): Promise<void> {
  const db = await getDB();
  const allEntries = await db.getAll("alertHistory");

  const tx = db.transaction("alertHistory", "readwrite");

  for (const entry of allEntries) {
    if (!entry.dismissed) {
      const updated: AlertHistoryEntry = {
        ...entry,
        dismissed: true,
      };
      tx.store.put(updated);
    }
  }

  await tx.done;
}

/**
 * Clear all alert history entries from the database
 * WARNING: This permanently removes all alert history
 */
export async function clearAlertHistory(): Promise<void> {
  const db = await getDB();
  await db.clear("alertHistory");
}

/**
 * Get alert history entries for a specific rule
 * @param ruleId - The rule's unique identifier
 * @param limit - Optional maximum number of entries to return
 * @returns Promise resolving to array of history entries for the rule
 */
export async function getAlertHistoryByRule(
  ruleId: string,
  limit?: number,
): Promise<AlertHistoryEntry[]> {
  const db = await getDB();
  const index = db.transaction("alertHistory").store.index("by-ruleId");
  const entries = await index.getAll(ruleId);

  // Sort by triggeredAt descending
  entries.sort(
    (a, b) =>
      new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime(),
  );

  if (limit && limit > 0) {
    return entries.slice(0, limit);
  }

  return entries;
}

/**
 * Get the count of alert history entries
 * @returns Promise resolving to the history entry count
 */
export async function getAlertHistoryCount(): Promise<number> {
  const db = await getDB();
  return db.count("alertHistory");
}

/**
 * Check if a spot was recently alerted for a specific rule
 * Prevents duplicate alerts for the same spot within a cooldown period
 * @param ruleId - The rule's unique identifier
 * @param spotId - The spot's unique identifier
 * @param cooldownMs - Cooldown period in milliseconds (default: 5 minutes)
 * @returns Promise resolving to true if alert was recently sent
 */
export async function wasRecentlyAlerted(
  ruleId: string,
  spotId: string,
  cooldownMs: number = 5 * 60 * 1000,
): Promise<boolean> {
  const db = await getDB();
  const cutoffTime = new Date(Date.now() - cooldownMs).toISOString();

  // Use index to query only entries for this rule (much smaller dataset)
  const tx = db.transaction("alertHistory", "readonly");
  const index = tx.store.index("by-ruleId");

  // Get only entries for this specific rule
  const entries = await index.getAll(ruleId);

  // Filter in memory for matching spotId and recent timestamp
  return entries.some(
    (entry) => entry.spotId === spotId && entry.triggeredAt > cutoffTime,
  );
}
