import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WasMap } from "./WasMap";
import type { WasState } from "@/lib/awards/types";

const SLOTS: WasState[] = [
  {
    abbr: "TX",
    name: "Texas",
    status: "confirmed",
    qsoCount: 5,
    bands: ["20m"],
    modes: ["SSB"],
  },
];

describe("WasMap", () => {
  it("shows the status wording on the state cell", () => {
    render(
      <WasMap
        slots={SLOTS}
        totalStates={50}
        workedCount={1}
        confirmedCount={1}
        neededCount={49}
      />,
    );

    expect(screen.getByTitle("Texas — Confirmed")).toBeTruthy();
  });

  it("opens the slot detail panel on click, with the confirmed status and a mono abbreviation subtitle", () => {
    render(
      <WasMap
        slots={SLOTS}
        totalStates={50}
        workedCount={1}
        confirmedCount={1}
        neededCount={49}
      />,
    );

    fireEvent.click(screen.getByTitle("Texas — Confirmed"));

    const dialog = screen.getByRole("dialog", { name: /Details for Texas/ });
    expect(dialog).toBeTruthy();
    // Status wording appears twice: the header badge and the "Status" field.
    expect(
      within(dialog).getAllByText("Confirmed").length,
    ).toBeGreaterThanOrEqual(2);
    expect(within(dialog).getByText("TX").className).toContain("font-mono");
  });

  it("closes on Escape and restores focus to the clicked state cell", () => {
    render(
      <WasMap
        slots={SLOTS}
        totalStates={50}
        workedCount={1}
        confirmedCount={1}
        neededCount={49}
      />,
    );

    const cell = screen.getByTitle("Texas — Confirmed");
    cell.focus();
    fireEvent.click(cell);
    expect(
      screen.getByRole("dialog", { name: /Details for Texas/ }),
    ).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(cell);
  });
});
