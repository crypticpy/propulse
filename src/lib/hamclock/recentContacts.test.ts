import { afterEach, expect, it, vi } from "vitest";
import { getEntriesByContestId, getLogEntriesByDate } from "@/lib/db/logStore";
import { readHamClockContacts } from "./recentContacts";
vi.mock("@/lib/db/logStore", () => ({
  getEntriesByContestId: vi.fn(),
  getLogEntriesByDate: vi.fn(),
}));
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});
it("uses the UTC date and keeps contacts without locations in newest-first order", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-05T00:02:00Z"));
  vi.mocked(getLogEntriesByDate).mockResolvedValue([
    { id: "old", date: "2026-09-05", timeOn: "00:00", grid: "EM38" },
    { id: "new", date: "2026-09-05", timeOn: "00:01" },
  ] as never);
  expect((await readHamClockContacts(null)).map((e) => e.id)).toEqual([
    "new",
    "old",
  ]);
  expect(getLogEntriesByDate).toHaveBeenCalledWith("2026-09-05");
});
it("uses the active contest session across date boundaries", async () => {
  vi.mocked(getEntriesByContestId).mockResolvedValue([]);
  await readHamClockContacts("session-1");
  expect(getEntriesByContestId).toHaveBeenCalledWith("session-1");
  expect(getLogEntriesByDate).not.toHaveBeenCalled();
});
