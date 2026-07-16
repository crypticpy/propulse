import { describe, expect, it } from "vitest";
import { settledPreviousHour } from "./hourly.js";

describe("settledPreviousHour", () => {
  it("holds the just-completed hour until the settle delay passes", () => {
    expect(
      settledPreviousHour(new Date("2026-08-01T10:19:59Z"), 20).toISOString(),
    ).toBe("2026-08-01T08:00:00.000Z");
  });

  it("releases the prior hour at the settle boundary", () => {
    expect(
      settledPreviousHour(new Date("2026-08-01T10:20:00Z"), 20).toISOString(),
    ).toBe("2026-08-01T09:00:00.000Z");
  });
});
