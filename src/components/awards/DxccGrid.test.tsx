import { fireEvent, render, screen, within } from "@testing-library/react";
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
    bands: ["20m"],
    modes: ["CW"],
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

  it("opens the slot detail panel on click, with continent/zone in their own rows and chips for bands and modes", () => {
    render(
      <DxccGrid
        slots={SLOTS}
        totalEntities={340}
        workedCount={0}
        confirmedCount={0}
        neededCount={340}
      />,
    );

    fireEvent.click(screen.getByTitle("Japan (JA) — Needed"));

    const dialog = screen.getByRole("dialog", { name: /Details for Japan/ });
    expect(dialog).toBeTruthy();

    const continentRow = within(dialog).getByText("Continent").closest("div");
    expect(continentRow?.textContent).toContain("AS");

    const cqZoneRow = within(dialog).getByText("CQ Zone").closest("div");
    expect(cqZoneRow?.textContent).toContain("25");

    expect(within(dialog).getByText("Bands")).toBeTruthy();
    expect(within(dialog).getByText("20m")).toBeTruthy();
    expect(within(dialog).getByText("Modes")).toBeTruthy();
    expect(within(dialog).getByText("CW")).toBeTruthy();
  });

  it("closes on Escape and restores focus to the clicked entity cell", () => {
    render(
      <DxccGrid
        slots={SLOTS}
        totalEntities={340}
        workedCount={0}
        confirmedCount={0}
        neededCount={340}
      />,
    );

    const cell = screen.getByTitle("Japan (JA) — Needed");
    cell.focus();
    fireEvent.click(cell);
    expect(
      screen.getByRole("dialog", { name: /Details for Japan/ }),
    ).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(cell);
  });
});
