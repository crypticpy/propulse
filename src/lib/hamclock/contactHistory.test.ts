import { describe, expect, it } from "vitest";
import type { LogEntry } from "@/lib/db/types";
import { getDB } from "@/lib/db";
import {
  buildContactHistory,
  contactTime,
  summarizeContacts,
  readHamClockContactHistory,
} from "./recentContacts";

const entry = (
  id: string,
  date: string,
  extra: Partial<LogEntry> = {},
): LogEntry => ({
  id,
  date,
  callsign: "W1AW",
  timeOn: "10:00",
  frequency: 14074,
  mode: "FT8",
  band: "20m",
  createdAt: `${date}T10:00:00Z`,
  updatedAt: `${date}T10:00:00Z`,
  ...extra,
});

describe("contact history", () => {
  it("reads the month plus chart range through the date index and counts older records separately", async () => {
    const db = await getDB();
    await db.put("logEntries", entry("archive", "2025-01-01"));
    await db.put("logEntries", entry("month-start", "2026-08-01"));
    await db.put("logEntries", entry("month-end", "2026-08-31"));
    await db.put("logEntries", entry("future", "2026-09-01"));
    const result = await readHamClockContactHistory("2026-08-31");
    expect(result.entries.map((e) => e.id)).toEqual([
      "month-start",
      "month-end",
    ]);
    expect(result.totalCount).toBe(4);
    await expect(readHamClockContactHistory("2026-02-30")).rejects.toThrow(
      "Invalid log date",
    );
  });
  it("uses Monday UTC weeks and full calendar months, including the 31st day", () => {
    const result = buildContactHistory(
      [
        entry("first", "2026-08-01"),
        entry("sun", "2026-08-30"),
        entry("mon", "2026-08-31"),
        entry("future", "2026-09-01"),
      ],
      new Date("2026-08-31T12:00:00Z"),
    );
    expect([result.todayCount, result.weekCount, result.monthCount]).toEqual([
      1, 1, 3,
    ]);
    expect(result.days).toHaveLength(30);
    expect(result.days[0].date).toBe("2026-08-02");
  });

  it("counts stable identities once, honors revisions and rejects malformed/future dates", () => {
    const old = entry("same", "2026-09-05");
    const result = buildContactHistory(
      [
        old,
        { ...old, date: "2026-09-06", updatedAt: "2026-09-06T11:00:00Z" },
        entry("bad", "2026-02-30"),
        entry("later", "2026-09-06", { timeOn: "23:00" }),
      ],
      new Date("2026-09-06T12:00:00Z"),
    );
    expect(result.todayCount).toBe(1);
    expect(result.monthCount).toBe(1);
    expect(
      Number.isNaN(
        contactTime(entry("bad", "2026-09-06", { timeOn: "24:00" })),
      ),
    ).toBe(true);
  });

  it("uses logged grids, keeps unlocated contacts and prefers recorded DXCC", () => {
    const result = summarizeContacts([
      entry("near", "2026-09-06", { grid: "EM38", myGrid: "EM38", dxcc: 339 }),
      entry("far", "2026-09-06", {
        grid: "PM95",
        myGrid: "EM38",
        timeOn: "12:30",
        dxcc: 339,
      }),
      entry("unknown", "2026-09-06", {
        grid: "invalid",
        myGrid: "EM38",
        callsign: "?",
        timeOn: "13:00",
      }),
    ]);
    expect(result.count).toBe(3);
    expect(result.located).toBe(2);
    expect(result.bestDx?.entry.id).toBe("far");
    expect(result.bestDx?.km).toBeGreaterThan(9000);
    expect(result.uniqueDxcc).toBe(1);
    expect(result.unresolvedDxcc).toBe(1);
    expect(result.longestGapMinutes).toBe(150);
  });

  it("selects an empty day without losing the month chart and recalculates after deletion", () => {
    const contacts = [
      entry("a", "2026-09-06"),
      entry("b", "2026-09-05", { band: "40m" }),
    ];
    const now = new Date("2026-09-06T12:00:00Z");
    const result = buildContactHistory(contacts, now, "2026-09-04");
    expect(result.summary.count).toBe(0);
    expect(result.days.at(-2)?.band).toBe("40m");
    expect(buildContactHistory(contacts.slice(1), now).todayCount).toBe(0);
  });
});
