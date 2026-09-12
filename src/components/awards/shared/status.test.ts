import { describe, expect, it } from "vitest";
import type { SlotStatus } from "@/lib/awards/types";
import {
  STATUS_OPTIONS,
  legendSwatchConfirmed,
  legendSwatchNeeded,
  legendSwatchWorked,
  progressFillConfirmed,
  progressFillWorked,
  statusBg,
  statusLabel,
  statusText,
} from "./status";

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
  it("maps every status to its exact background/border class pair", () => {
    expect(statusBg("confirmed")).toBe(
      "bg-signal-green/20 border-signal-green/50",
    );
    expect(statusBg("worked_unconfirmed")).toBe(
      "bg-caution-amber/20 border-caution-amber/50",
    );
    expect(statusBg("needed")).toBe("bg-su-panel/40 border-su-line/40");
  });
});

describe("statusText", () => {
  it("maps every status to a text colour class", () => {
    expect(statusText("confirmed")).toBe("text-signal-green");
    expect(statusText("worked_unconfirmed")).toBe("text-caution-amber");
    expect(statusText("needed")).toBe("text-su-muted");
  });
});

describe("legend and progress hues", () => {
  it("exports shared summary swatch and progress fill classes", () => {
    expect(legendSwatchConfirmed).toBe("bg-signal-green/60");
    expect(legendSwatchWorked).toBe("bg-caution-amber/60");
    expect(legendSwatchNeeded).toBe("bg-su-input");
    expect(progressFillConfirmed).toBe("bg-signal-green");
    expect(progressFillWorked).toBe("bg-caution-amber");
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
