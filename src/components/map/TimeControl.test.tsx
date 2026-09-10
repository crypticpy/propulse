import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

describe("TimeControl (#927: preset row wraps at xl text scale)", () => {
  it("wraps the quick offset preset row instead of clipping +12h", () => {
    const absPath = resolve(REPO_ROOT, "src/components/map/TimeControl.tsx");
    const source = readFileSync(absPath, "utf8");
    const lines = source.split("\n");
    const markerIndex = lines.findIndex((line) =>
      line.includes("Quick offset presets"),
    );
    expect(markerIndex).toBeGreaterThanOrEqual(0);

    const rowLine = lines
      .slice(markerIndex)
      .find((line) => line.includes("<div className="));
    expect(rowLine).toBeDefined();
    expect(rowLine).toContain("flex-wrap");
    expect(rowLine).not.toContain('className="flex gap-1 mb-2"');
  });
});
