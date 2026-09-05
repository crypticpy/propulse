import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { useMapStore } from "@/stores/mapStore";
import { DisplayTab } from "./DisplayTab";

vi.mock("@/hooks/useActiveLocation", () => ({ useActiveLocation: vi.fn() }));

describe("DisplayTab", () => {
  beforeEach(() => {
    useHamClockDisplayStore.getState().resetDisplay();
    useMapStore.getState().setViewMode("flat");
    vi.mocked(useActiveLocation).mockReturnValue(null);
  });

  it("spells the smart scaling state as ON or OFF", () => {
    render(<DisplayTab />);
    const toggle = screen.getByRole("switch", { name: "Smart scaling" });
    expect(toggle.textContent).toBe("ON");

    fireEvent.click(toggle);
    expect(toggle.textContent).toBe("OFF");
    expect(useHamClockDisplayStore.getState().smartScaling).toBe(false);
  });

  it("switches density and units through segmented controls", () => {
    render(<DisplayTab />);
    fireEvent.click(screen.getByRole("radio", { name: "DESK" }));
    expect(useHamClockDisplayStore.getState().density).toBe("desk");

    fireEvent.click(screen.getByRole("radio", { name: "METRIC" }));
    expect(useHamClockDisplayStore.getState().units).toBe("metric");
  });

  it("disables non-activity map content options in azimuthal projection", () => {
    useMapStore.getState().setViewMode("azimuthal");
    render(<DisplayTab />);
    expect(
      (screen.getByRole("radio", { name: "MY CONTACTS" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("radio", { name: "ACTIVITY" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("disables SET HOME with no active location, and calls frameHome once one is set", () => {
    const { rerender } = render(<DisplayTab />);
    expect(
      screen.getByRole("button", { name: "SET HOME" }).hasAttribute("disabled"),
    ).toBe(true);

    vi.mocked(useActiveLocation).mockReturnValue({
      id: "home",
      name: "Home",
      grid: "EM10dg",
      lat: 30.27,
      lon: -97.74,
      type: "home",
      createdAt: new Date(0).toISOString(),
    });
    rerender(<DisplayTab />);
    const button = screen.getByRole("button", { name: "SET HOME" });
    expect(button.hasAttribute("disabled")).toBe(false);

    fireEvent.click(button);
    expect(useHamClockDisplayStore.getState().homeRequest).not.toBeNull();
  });
});
