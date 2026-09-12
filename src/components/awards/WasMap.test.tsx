import { render, screen } from "@testing-library/react";
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
});
