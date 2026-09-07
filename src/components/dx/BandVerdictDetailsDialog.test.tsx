import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { evaluateLadder, type LadderInputs } from "@/lib/verdict/ladder";
import type { BandLadderEntry } from "@/hooks/useBandVerdicts";
import type { CanonicalLadderRow } from "@/hooks/useBandLadder";
import type { CanonicalBandRow } from "@/lib/verdict/bestBand";
import { BandVerdictDetailsDialog } from "./BandVerdictDetailsDialog";

function fadingEntry(): BandLadderEntry {
  const inputs: LadderInputs = {
    physicsScore: 0.72,
    obs20m: 8,
    reporters20m: 4,
    count10mRecent: 2,
    count10mPrior: 6,
  };
  return {
    band: "80m",
    stable: "verified",
    fading: true,
    since: Date.now() - 10 * 60_000,
    result: {
      scopeId: "regional:NA",
      band: "80m",
      evaluation: evaluateLadder(inputs),
      inputs,
      counts: {
        count60m: 24,
        sourceCounts60m: { WSPR: 24 },
        modeObs20m: { digital: 8 },
      },
      at: Date.now(),
    },
  };
}

function canonicalRow(
  overrides: Partial<CanonicalLadderRow> = {},
): CanonicalBandRow {
  return {
    band: "80m",
    scopeType: "regional",
    scopeKey: "NA",
    state: "hot",
    stableSince: new Date(Date.now() - 45 * 60_000).toISOString(),
    surprise: false,
    openedAt: null,
    inputs: {},
    updatedAt: new Date(Date.now() - 45 * 60_000).toISOString(),
    stale: true,
    ...overrides,
  };
}

describe("BandVerdictDetailsDialog", () => {
  it("shows a stale qualifier when the server ladder row has stopped ticking", () => {
    render(
      <BandVerdictDetailsDialog
        entry={fadingEntry()}
        canonical={canonicalRow()}
        scopeLabel="Regional · North America"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Stale")).not.toBeNull();
    expect(screen.getByText(/Last verdict/)).not.toBeNull();
  });

  it("portals fading details above an overflow-constrained panel", () => {
    const close = vi.fn();
    const { container } = render(
      <div style={{ overflow: "hidden" }}>
        <BandVerdictDetailsDialog
          entry={fadingEntry()}
          scopeLabel="Regional · North America"
          onClose={close}
        />
      </div>,
    );

    const dialog = screen.getByRole("dialog", { name: "80m band health" });
    expect(container.contains(dialog)).toBe(false);
    expect(screen.getByText("Fading")).not.toBeNull();
    expect(screen.getByText(/Regional · North America/)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(close).toHaveBeenCalledOnce();
  });
});
