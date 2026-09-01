import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useKioskStore } from "@/stores/kioskStore";
import { useMapStore } from "@/stores/mapStore";
import { LayoutModeDropdown } from "./LayoutModeDropdown";

function LocationProbe() {
  return <output aria-label="Current route">{useLocation().pathname}</output>;
}

function renderMenu(initialPath = "/map") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LayoutModeDropdown />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("LayoutModeDropdown", () => {
  beforeEach(() => {
    localStorage.clear();
    useMapStore.setState({
      layoutMode: "normal",
      isFullscreen: false,
      isLiteMode: false,
    });
    useKioskStore.setState({ active: false, activeSceneId: null });
  });

  it("shows every map layout plus Wall Display configuration destinations", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /Normal/ }));

    expect(screen.getByRole("menuitemradio", { name: /Normal/ })).toBeTruthy();
    expect(screen.getByRole("menuitemradio", { name: /Lite/ })).toBeTruthy();
    expect(screen.getByRole("menuitemradio", { name: /Pro/ })).toBeTruthy();
    expect(screen.getByRole("menuitemradio", { name: /HamClock/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Wall Display/ })).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: /Configure Displays/ }),
    ).toBeTruthy();
  });

  it("switches layouts in place and opens the Wall Display configurator", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /Normal/ }));
    await user.click(screen.getByRole("menuitemradio", { name: /Pro/ }));

    expect(useMapStore.getState().layoutMode).toBe("pro");
    expect(screen.getByLabelText("Current route").textContent).toBe("/map");

    await user.click(screen.getByRole("button", { name: /Pro/ }));
    await user.click(screen.getByRole("menuitem", { name: /Wall Display/ }));

    expect(screen.getByLabelText("Current route").textContent).toBe("/kiosk");
  });

  it("can leave an active wall for a selected map layout", async () => {
    const user = userEvent.setup();
    useKioskStore.setState({ active: true, activeSceneId: "default-wall" });
    renderMenu("/solar");

    await user.click(screen.getByRole("button", { name: /Wall Display/ }));
    await user.click(screen.getByRole("menuitemradio", { name: /Lite/ }));

    expect(useKioskStore.getState().active).toBe(false);
    expect(useMapStore.getState().layoutMode).toBe("lite");
    expect(screen.getByLabelText("Current route").textContent).toBe("/map");
  });

  it("closes its own menu on Escape without changing the active layout", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: /Normal/ }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(useMapStore.getState().layoutMode).toBe("normal");
  });
});
