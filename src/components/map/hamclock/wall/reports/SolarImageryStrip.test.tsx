import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SolarImageryStrip } from "./SolarImageryStrip";

vi.mock("@/components/solar/useRetainedSolarImage", () => ({
  useRetainedSolarImage: () => ({
    visibleUrl: "/api/solar/image?product=test",
    hasLoadedImage: true,
    candidateFailed: false,
    probeUrl: null,
    handleVisibleLoad: vi.fn(),
    handleVisibleError: vi.fn(),
    handleProbeLoad: vi.fn(),
    handleProbeError: vi.fn(),
  }),
}));

describe("SolarImageryStrip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ observedAt: "2026-01-01T12:00:00.000Z" }),
        }),
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("pages two visible slots through all five SDO products", async () => {
    render(<SolarImageryStrip />);

    expect(screen.getByText("AIA 193 · CORONA")).toBeTruthy();
    expect(screen.getByText("HMI · MAGNETOGRAM")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.getByText("AIA 304 · CHROMOSPHERE")).toBeTruthy();
    expect(screen.getByText("AIA 171 · CORONA")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.getByText("AIA 211 · ACTIVE REGIONS")).toBeTruthy();
    expect(screen.getByText("AIA 193 · CORONA")).toBeTruthy();
  });
});
