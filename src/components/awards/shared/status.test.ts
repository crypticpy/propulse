import { describe, expect, it } from "vitest";
import type { SlotStatus } from "@/lib/awards/types";
import { STATUS_OPTIONS, statusBg, statusLabel, statusText } from "./status";

const STATUSES: SlotStatus[] = ["confirmed", "worked_unconfirmed", "needed"];

describe("statusLabel", () => {
  it("maps every status to its wording", () => {
    expect(statusLabel("confirmed")).toBe("Confirmed");
    expect(statusLabel("worked_unconfirmed")).toBe("Worked");
    expect(statusLabel("needed")).toBe("Needed");
  });

  it("has no unmapped status", () => {
    for (const status of STATUSES) {
      expect(statusLabel(status)).toEqual(expect.any(String));
      expect(statusLabel(status).length).toBeGreaterThan(0);
    }
  });
});

describe("statusBg", () => {
  it("maps every status to a background/border class pair", () => {
    for (const status of STATUSES) {
      const classes = statusBg(status);
      expect(classes).toEqual(expect.stringContaining("bg-"));
      expect(classes).toEqual(expect.stringContaining("border-"));
    }
  });
});

describe("statusText", () => {
  it("maps every status to a text colour class", () => {
    expect(statusText("confirmed")).toBe("text-signal-green");
    expect(statusText("worked_unconfirmed")).toBe("text-caution-yellow");
    expect(statusText("needed")).toBe("text-su-muted");
  });
});

describe("STATUS_OPTIONS", () => {
  it("offers All plus every status, in filter order", () => {
    expect(STATUS_OPTIONS.map((o) => o.value)).toEqual([
      "all",
      "confirmed",
      "worked_unconfirmed",
      "needed",
    ]);
  });

  it("labels each option with the same wording statusLabel uses", () => {
    for (const option of STATUS_OPTIONS) {
      if (option.value === "all") continue;
      expect(option.label).toBe(statusLabel(option.value));
    }
  });
});
