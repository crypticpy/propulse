import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WidgetShell } from "./WidgetShell";
import type { SolarWidgetState } from "@/lib/solar/contracts";

describe("WidgetShell state contract", () => {
  const expected: Array<[SolarWidgetState, string]> = [
    ["loading", "Loading"],
    ["fresh", "Current"],
    ["refreshing", "Refreshing"],
    ["stale", "Stale"],
    ["partial", "Partial"],
    ["empty", "No current items"],
    ["unavailable", "Unavailable"],
    ["error", "Error"],
  ];

  it.each(expected)("announces the %s state", (state, label) => {
    render(
      <WidgetShell title="Kp" state={state} hasData={state !== "loading"}>
        <p>Validated value</p>
      </WidgetShell>,
    );
    expect(screen.getByRole("status").textContent).toContain(label);
  });

  it("keeps last-good data visible with a stale explanation", () => {
    render(
      <WidgetShell
        title="Solar flux"
        state="stale"
        observedAt="2026-07-15T12:00:00.000Z"
        provider="NOAA SWPC"
        sourceUrl="https://services.swpc.noaa.gov/"
      >
        <p>123 sfu</p>
      </WidgetShell>,
    );
    expect(screen.getByText("123 sfu")).not.toBeNull();
    expect(screen.getByText(/older than expected/i)).not.toBeNull();
    expect(screen.queryByText(/refresh failed/i)).toBeNull();
    expect(screen.getByRole("link", { name: "NOAA SWPC" }).getAttribute("href")).toBe(
      "https://services.swpc.noaa.gov/",
    );
  });

  it("distinguishes a failed refresh from an older observation", () => {
    render(
      <WidgetShell
        title="Solar wind"
        state="stale"
        staleMessage="The latest refresh failed. Last validated data remains visible."
      >
        <p>412 km/s</p>
      </WidgetShell>,
    );
    expect(screen.getByText(/latest refresh failed/i)).not.toBeNull();
    expect(screen.getByText("412 km/s")).not.toBeNull();
  });

  it("does not render decision content when no usable data exists", () => {
    const retry = vi.fn();
    render(
      <WidgetShell title="Alerts" state="error" hasData={false} onRetry={retry}>
        <p>No alerts reported</p>
      </WidgetShell>,
    );
    expect(screen.queryByText("No alerts reported")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("renders an explicit successful empty state without treating it as an error", () => {
    render(
      <WidgetShell title="Alerts" state="empty" hasData>
        <p>No recent bulletins were reported in the current successful response.</p>
      </WidgetShell>,
    );
    expect(screen.getByText(/current successful response/i)).not.toBeNull();
    expect(screen.queryByText(/No recent reading is available/i)).toBeNull();
  });
});


it("distinguishes forecast issue age from observation age", () => {
  render(<WidgetShell title="Forecast" state="fresh" observedAt={new Date().toISOString()} timestampLabel="Issued">Forecast content</WidgetShell>);
  expect(screen.getByText(/Issued just now/)).not.toBeNull();
  expect(screen.queryByText(/Observed/)).toBeNull();
});
