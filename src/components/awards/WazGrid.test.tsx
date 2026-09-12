import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WazGrid } from "./WazGrid";
import type { WazZone } from "@/lib/awards/types";

const SLOTS: WazZone[] = [
  {
    zone: 5,
    status: "worked_unconfirmed",
    qsoCount: 2,
    bands: ["15m"],
    modes: [],
  },
];

describe("WazGrid", () => {
  it("shows the status wording on the zone cell", () => {
    render(
      <WazGrid
        slots={SLOTS}
        totalZones={40}
        workedCount={1}
        confirmedCount={0}
        neededCount={39}
      />,
    );

    expect(screen.getByTitle("CQ Zone 5 — Worked")).toBeTruthy();
  });

  it("opens the slot detail panel on click, with a Status meta field showing the worked wording", () => {
    render(
      <WazGrid
        slots={SLOTS}
        totalZones={40}
        workedCount={1}
        confirmedCount={0}
        neededCount={39}
      />,
    );

    fireEvent.click(screen.getByTitle("CQ Zone 5 — Worked"));

    const dialog = screen.getByRole("dialog", {
      name: /Details for CQ Zone 5/,
    });
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText("Status")).toBeTruthy();
    // Status wording appears twice: the header badge and the "Status" field.
    expect(within(dialog).getAllByText("Worked").length).toBeGreaterThanOrEqual(
      2,
    );
  });
});
