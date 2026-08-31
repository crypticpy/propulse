import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BandLadderEntry } from "@/hooks/useBandVerdicts";
import { HamClockBestBandHero } from "./HamClockBestBandHero";

const mocks = vi.hoisted(() => ({
  verdicts: vi.fn(),
  activity: vi.fn(),
  ladder: vi.fn(),
}));

vi.mock("@/hooks/useBandVerdicts", () => ({
  useBandVerdicts: mocks.verdicts,
}));
vi.mock("@/hooks/useBandActivity", () => ({
  useBandActivity: mocks.activity,
}));
vi.mock("@/hooks/useBandLadder", () => ({
  canonicalKey: (scope: string, key: string, band: string) =>
    `${scope}:${key}:${band}`,
  useBandLadder: mocks.ladder,
}));
vi.mock("@/components/dx/BandVerdictDetailsDialog", () => ({
  BandVerdictDetailsDialog: ({ entry }: { entry: BandLadderEntry }) => (
    <div role="dialog">Details for {entry.band}</div>
  ),
}));

function entry(
  band: string,
  stable: BandLadderEntry["stable"],
  obs20m: number,
  reporters20m: number,
  fading = false,
): BandLadderEntry {
  return {
    band,
    stable,
    fading,
    since: 1,
    result: {
      scopeId: "regional:NA",
      band,
      inputs: { obs20m, reporters20m },
    },
  } as BandLadderEntry;
}

describe("HamClockBestBandHero", () => {
  beforeEach(() => {
    mocks.activity.mockReturnValue({ data: new Map() });
    mocks.ladder.mockReturnValue({ data: new Map() });
  });

  it("prefers stronger ladder evidence and then live observations", () => {
    mocks.verdicts.mockReturnValue({
      bands: [
        entry("40m", "verified", 8, 4),
        entry("20m", "hot", 5, 3),
        entry("15m", "hot", 12, 5),
      ],
      ready: true,
      scope: { type: "regional", continent: "NA", label: "North America" },
      activityScope: { type: "regional", continent: "NA" },
    });
    render(<HamClockBestBandHero />);

    expect(
      screen.getByRole("button", { name: /Best band now: 15m/i }),
    ).toBeTruthy();
  });

  it("opens the shared evidence dialog for the displayed fading band", () => {
    mocks.verdicts.mockReturnValue({
      bands: [entry("80m", "verified", 11, 6, true)],
      ready: true,
      scope: { type: "regional", continent: "NA", label: "North America" },
      activityScope: { type: "regional", continent: "NA" },
    });
    render(<HamClockBestBandHero />);

    const hero = screen.getByRole("button", { name: /Best band now: 80m/i });
    expect(hero.textContent).toContain("Fading");
    expect(hero.getAttribute("aria-label")).toContain("80m, Fading");
    expect(hero.getAttribute("aria-label")).not.toContain("Verified");
    fireEvent.click(hero);
    expect(screen.getByRole("dialog").textContent).toContain("80m");
  });
});
