import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DxccGrid } from "./DxccGrid";
import type { DxccSlot } from "@/lib/awards/types";

const SLOTS: DxccSlot[] = [
  {
    entityId: 339,
    name: "Japan",
    prefix: "JA",
    continent: "AS",
    cqZone: 25,
    status: "needed",
    qsoCount: 0,
    bands: [],
    modes: [],
  },
];

describe("DxccGrid", () => {
  it("shows the same status wording WasMap and WazGrid show, via the shared statusLabel", () => {
    render(
      <DxccGrid
        slots={SLOTS}
        totalEntities={340}
        workedCount={0}
        confirmedCount={0}
        neededCount={340}
      />,
    );

    // Regression guard for #1095: DxccGrid previously duplicated this
    // wording as an inline ternary with no `statusLabel` function; it now
    // comes from the shared module every award grid uses.
    expect(screen.getByTitle("Japan (JA) — Needed")).toBeTruthy();
  });
});
