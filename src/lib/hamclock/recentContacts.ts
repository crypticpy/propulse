import { getEntriesByContestId, getLogEntriesByDate } from "@/lib/db/logStore";
import { getDB } from "@/lib/db";
import type { LogEntry } from "@/lib/db/types";
import { lookupEntity } from "@/lib/data/dxccEntities";
import { gridToLatLon } from "@/lib/utils/grid";
import { getDistance } from "@/lib/utils/path";

export async function readHamClockContacts(
  contestId: string | null,
  today = new Date().toISOString().slice(0, 10),
) {
  const entries = contestId
    ? await getEntriesByContestId(contestId)
    : await getLogEntriesByDate(today);
  return entries.sort(
    (a, b) => b.date.localeCompare(a.date) || b.timeOn.localeCompare(a.timeOn),
  );
}

const DAY = 86_400_000;
const dateKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function contactTime(entry: Pick<LogEntry, "date" | "timeOn">): number {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
    !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(entry.timeOn)
  )
    return NaN;
  const time = Date.parse(
    `${entry.date}T${entry.timeOn.length === 5 ? `${entry.timeOn}:00` : entry.timeOn}Z`,
  );
  return Number.isFinite(time) && dateKey(time) === entry.date ? time : NaN;
}

export function contactLocation(grid?: string) {
  const normalized = grid?.trim();
  if (!normalized || !/^[A-R]{2}\d{2}([A-X]{2}(\d{2})?)?$/i.test(normalized))
    return null;
  // Use the supported six-character parent of a valid extended locator.
  return gridToLatLon(normalized.slice(0, 6));
}

/** Indexed range covers the full calendar month as well as the rolling chart. */
export async function readHamClockContactHistory(today: string) {
  const end = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(end) || dateKey(end) !== today)
    throw new Error("Invalid log date");
  const first = [dateKey(end - 29 * DAY), `${today.slice(0, 7)}-01`].sort()[0];
  const db = await getDB();
  const tx = db.transaction("logEntries", "readonly");
  const [entries, totalCount] = await Promise.all([
    tx.store.index("by-date").getAll(IDBKeyRange.bound(first, today)),
    tx.store.count(),
  ]);
  await tx.done;
  return { entries, totalCount, readAt: Date.now() };
}

function leader(entries: LogEntry[], key: "band" | "mode") {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const value =
      key === "band"
        ? entry[key].trim().toLowerCase()
        : entry[key].trim().toUpperCase();
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const first = [...counts].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0];
  return first ? { value: first[0], count: first[1] } : null;
}

export function summarizeContacts(entries: LogEntry[]) {
  const entities = new Set<number>();
  let unresolvedDxcc = 0;
  let located = 0;
  let bestDx: { entry: LogEntry; km: number } | null = null;
  let longestGapMinutes: number | null = null;
  const sorted = [...entries].sort((a, b) => contactTime(a) - contactTime(b));
  for (const [index, entry] of sorted.entries()) {
    const dxcc =
      entry.dxcc && entry.dxcc > 0
        ? entry.dxcc
        : lookupEntity(entry.callsign)?.entity.id;
    if (dxcc) entities.add(dxcc);
    else unresolvedDxcc++;
    const from = contactLocation(entry.myGrid);
    const to = contactLocation(entry.grid);
    if (from && to) {
      located++;
      const km = getDistance(from.lat, from.lon, to.lat, to.lon);
      if (!bestDx || km > bestDx.km) bestDx = { entry, km };
    }
    if (index > 0)
      longestGapMinutes = Math.max(
        longestGapMinutes ?? 0,
        (contactTime(entry) - contactTime(sorted[index - 1])) / 60_000,
      );
  }
  return {
    count: entries.length,
    uniqueDxcc: entities.size,
    unresolvedDxcc,
    topBand: leader(entries, "band"),
    topMode: leader(entries, "mode"),
    bestDx,
    located,
    longestGapMinutes,
    last: sorted.at(-1) ?? null,
  };
}

/** UTC calendar periods. A duplicate identity counts once, using its newest revision. */
export function buildContactHistory(
  input: LogEntry[],
  now: Date,
  selectedDay?: string | null,
) {
  const today = dateKey(now.getTime());
  const midnight = Date.parse(`${today}T00:00:00Z`);
  const week = dateKey(midnight - ((now.getUTCDay() + 6) % 7) * DAY);
  const month = `${today.slice(0, 7)}-01`;
  const unique = new Map<string, LogEntry>();
  for (const entry of input) {
    const previous = unique.get(entry.id);
    if (!previous || entry.updatedAt > previous.updatedAt)
      unique.set(entry.id, entry);
  }
  const entries = [...unique.values()].filter(
    (entry) =>
      Number.isFinite(contactTime(entry)) &&
      contactTime(entry) <= now.getTime(),
  );
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = dateKey(midnight - (29 - index) * DAY);
    const day = entries.filter((entry) => entry.date === date);
    return {
      date,
      count: day.length,
      band: leader(day, "band")?.value ?? null,
    };
  });
  const period = selectedDay
    ? entries.filter((entry) => entry.date === selectedDay)
    : entries.filter((entry) => entry.date >= month);
  return {
    today,
    days,
    todayCount: entries.filter((e) => e.date === today).length,
    weekCount: entries.filter((e) => e.date >= week).length,
    monthCount: entries.filter((e) => e.date >= month).length,
    totalInRange: entries.length,
    summary: summarizeContacts(period),
  };
}
