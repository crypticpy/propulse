import { render, screen } from "@testing-library/react";
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
});
