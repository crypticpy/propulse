import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Header } from "./Header";

vi.mock("@/lib/supabase", () => ({ getSupabase: vi.fn(), isSupabaseConfigured: false }));
vi.mock("@/components/ui/HealthStatusIndicator", () => ({ HealthStatusIndicator: () => <button>System health</button> }));
vi.mock("@/components/ui/SyncStatusIndicator", () => ({ SyncStatusIndicator: () => null }));
vi.mock("@/components/ui/ConnectivityBadge", () => ({ ConnectivityBadge: () => null }));
vi.mock("@/components/qso/ConflictBadge", () => ({ ConflictBadge: () => null }));
vi.mock("@/components/location/QuickLocationControl", () => ({ QuickLocationControl: () => <button>Current location</button> }));

describe("shared masthead", () => {
  it.each(["/", "/solar", "/map", "/planner"])("keeps the clock, location, status and Tools trigger on %s", async route => {
    const view = render(<MemoryRouter initialEntries={[route]}><Header /></MemoryRouter>);
    expect(view.container.querySelector("time")?.textContent).toMatch(/^\d{2}:\d{2}:\d{2} UTC$/);
    expect(await screen.findByRole("button", { name: "Current location" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "System health" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tools/ })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeTruthy();
  });
});
