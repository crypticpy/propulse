import { getEntriesByContestId, getLogEntriesByDate } from "@/lib/db/logStore";

export async function readHamClockContacts(contestId: string | null) {
  const entries = contestId
    ? await getEntriesByContestId(contestId)
    : await getLogEntriesByDate(new Date().toISOString().slice(0, 10));
  return entries.sort(
    (a, b) => b.date.localeCompare(a.date) || b.timeOn.localeCompare(a.timeOn),
  );
}
