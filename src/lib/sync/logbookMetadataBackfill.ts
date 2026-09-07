import { getDB } from "@/lib/db";
import { notifyLogEntries } from "@/lib/db/logStore";
import { getSupabase } from "@/lib/supabase";

const PREFIX = "propulse-logbook-metadata-v1:";
const pending = new Map<string, Promise<void>>();

/** Repair pre-upgrade rows without resetting cursors or replacing local edits. */
export function backfillLogbookMetadata(userId: string): Promise<void> {
  const active = pending.get(userId);
  if (active) return active;
  const task = backfill(userId).finally(() => pending.delete(userId));
  pending.set(userId, task);
  return task;
}

async function backfill(userId: string): Promise<void> {
  const key = PREFIX + userId;
  try {
    if (localStorage.getItem(key) === "done") return;
  } catch { /* Unavailable storage safely retries the additive repair. */ }

  const db = await getDB();
  const candidates = (await db.getAll("logEntries"))
    .filter(entry => entry.myGrid == null || entry.dxcc == null)
    .map(entry => entry.id);
  const supabase = getSupabase();
  for (let offset = 0; offset < candidates.length; offset += 100) {
    const { data, error } = await supabase.from("log_entries")
      .select("id,my_grid,dxcc,deleted_at")
      .eq("user_id", userId)
      .in("id", candidates.slice(offset, offset + 100));
    if (error) throw new Error(`Logbook metadata repair failed: ${error.message}`);
    const tx = db.transaction("logEntries", "readwrite");
    for (const row of data ?? []) {
      if (row.deleted_at) continue;
      // Re-read after the request: an intervening edit or deletion wins.
      const entry = await tx.store.get(row.id);
      if (!entry) continue;
      const myGrid = entry.myGrid ?? row.my_grid ?? undefined;
      const dxcc = entry.dxcc ?? row.dxcc ?? undefined;
      if (myGrid !== entry.myGrid || dxcc !== entry.dxcc) {
        await tx.store.put({ ...entry, myGrid, dxcc });
      }
    }
    await tx.done;
    notifyLogEntries();
  }
  // Failed/partial runs never advance the marker or either sync cursor.
  try { localStorage.setItem(key, "done"); } catch { /* Retry safely next pull. */ }
}
