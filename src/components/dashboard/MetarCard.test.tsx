import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MetarStation } from "@/hooks/useMetar";
import { MetarCard } from "./MetarCard";

const hookState = vi.hoisted(() => ({
  stations: [] as MetarStation[],
  hasLocation: true,
  isLoading: false,
  error: null as Error | null,
}));

vi.mock("@/hooks/useMetar", () => ({
  useMetar: () => hookState,
}));

const longStation: MetarStation = {
  icaoId: "KLONG",
  name: "Regional International Airport With A Deliberately Long Name",
  lat: 41.1,
  lon: -87.9,
  obsTime: 1_788_160_000,
  temp: -12.4,
  dewp: -14,
  wdir: 360,
  wspd: 120,
  wgst: 150,
  visib: "10+",
  altim: 30.01,
  wxString: null,
  fltCat: "VFR",
  rawOb:
    "KZLONG 311955Z 360120G150KT 10SM FEW250 M12/M14 A3001 RMK TEST LONG RAW OBSERVATION",
};

describe("MetarCard", () => {
  beforeEach(() => {
    hookState.stations = [];
    hookState.hasLocation = true;
    hookState.isLoading = false;
    hookState.error = null;
  });

  it("keeps a station row mounted when its ICAO code is missing", () => {
    hookState.stations = [{ ...longStation, icaoId: null }];
    const { rerender } = render(<MetarCard />);
    const row = screen.getByRole("button", {
      name: /Regional International Airport/i,
    });

    rerender(<MetarCard />);
    expect(
      screen.getByRole("button", { name: /Regional International Airport/i }),
    ).toBe(row);
  });

  it("keeps an anonymous expanded station open when nearby results reorder", () => {
    const anonymous = { ...longStation, icaoId: null };
    hookState.stations = [anonymous];
    const { rerender } = render(<MetarCard />);
    const row = screen.getByRole("button", {
      name: /Regional International Airport/i,
    });

    fireEvent.click(row);
    expect(screen.getByText(longStation.rawOb!)).toBeTruthy();

    hookState.stations = [
      { ...longStation, icaoId: "KNEW", name: "New nearer station" },
      anonymous,
    ];
    rerender(<MetarCard />);

    const reorderedRow = screen.getByRole("button", {
      name: /Regional International Airport/i,
    });
    expect(reorderedRow).toBe(row);
    expect(reorderedRow.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(longStation.rawOb!)).toBeTruthy();
  });

  it("contains long observations in a min-width-safe metric grid", () => {
    hookState.stations = [longStation];
    render(<MetarCard />);

    const row = screen.getByRole("button", { name: /KLONG/i });
    expect(row.className).toContain("min-w-0");
    expect(row.querySelectorAll("[data-metar-metric]")).toHaveLength(3);
    expect(
      row.querySelector('[data-metar-metric="wind"]')?.textContent,
    ).toContain("360°/120kt G150");
    expect(
      row.querySelector('[data-metar-metric="wind"]')?.className,
    ).toContain("min-w-0");
  });

  it("expands and collapses the raw observation without changing rows", () => {
    hookState.stations = [longStation];
    render(<MetarCard />);

    const row = screen.getByRole("button", { name: /KLONG/i });
    expect(screen.queryByText(longStation.rawOb!)).toBeNull();

    fireEvent.click(row);
    expect(screen.getByText(longStation.rawOb!).textContent).toBe(
      longStation.rawOb,
    );
    expect(row.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(row);
    expect(screen.queryByText(longStation.rawOb!)).toBeNull();
  });
});
