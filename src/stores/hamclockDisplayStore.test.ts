import { beforeEach, expect, it } from "vitest";
import { useHamClockDisplayStore as display } from "./hamclockDisplayStore";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  display.getState().resetDisplay();
});
it("persists display choices per tab without persisting camera commands or touching app settings", () => {
  display.getState().setTextSize("xl");
  display.getState().togglePanel("moon");
  display
    .getState()
    .frameHome({ lat: 39, lon: -98, latitudeSpan: 42, longitudeSpan: 74 });
  const persisted = JSON.parse(
    sessionStorage.getItem("propulse-hamclock-display")!,
  );
  expect(persisted.state.textSize).toBe("xl");
  expect(persisted.state.hiddenPanels).toEqual(["moon"]);
  expect(persisted.state.homeRequest).toBeUndefined();
  expect(localStorage.getItem("propulse-hamclock-display")).toBeNull();
});
it("rejects stale or invalid persisted display options", async () => {
  sessionStorage.setItem(
    "propulse-hamclock-display",
    JSON.stringify({
      version: 1,
      state: {
        textSize: "giant",
        hiddenPanels: ["moon", "removed"],
        mapContent: "unknown",
        smartScaling: "no",
      },
    }),
  );
  await display.persist.rehydrate();
  expect(display.getState()).toMatchObject({
    textSize: "inherit",
    hiddenPanels: ["moon"],
    mapContent: "activity",
    smartScaling: true,
  });
});

it("resets every persisted preference and preserves expansion independently across tabs", async () => {
  display.getState().setMapContent("contacts");
  display.getState().setFollowRadio(true);
  display.getState().togglePanelExpansion("de");
  display.getState().togglePanelExpansion("spots");
  display.getState().togglePanelExpansion("contacts");
  display.getState().toggleSpotsSidebar();
  display.getState().setSpotsSide("left");
  const firstTab = sessionStorage.getItem("propulse-hamclock-display")!;
  display.getState().resetDisplay();
  expect(display.getState()).toMatchObject({
    mapContent: "activity",
    followRadio: false,
    panelCollapsed: {},
    spotsSide: "right",
    spotsSidebarCollapsed: false,
    infoSidebarCollapsed: false,
  });
  // Restoring one tab's session does not use the other tab's/default layout.
  sessionStorage.setItem("propulse-hamclock-display", firstTab);
  await display.persist.rehydrate();
  expect(display.getState()).toMatchObject({
    panelCollapsed: { de: true, spots: true, contacts: true },
    spotsSide: "left",
    spotsSidebarCollapsed: true,
  });
  expect(localStorage.getItem("propulse-hamclock-display")).toBeNull();
});

it("migrates a v1 session to desk density, pulse theme, auto units and page 0", async () => {
  sessionStorage.setItem(
    "propulse-hamclock-display",
    JSON.stringify({
      version: 1,
      state: { textSize: "lg", hiddenPanels: ["moon"] },
    }),
  );
  await display.persist.rehydrate();
  expect(display.getState()).toMatchObject({
    textSize: "lg",
    hiddenPanels: ["moon"],
    density: "desk",
    theme: "pulse",
    units: "auto",
    pageIndex: { left: 0, right: 0 },
  });
});

it("rejects invalid persisted wall options", async () => {
  sessionStorage.setItem(
    "propulse-hamclock-display",
    JSON.stringify({
      version: 2,
      state: {
        density: "kiosk",
        theme: "neon",
        units: "furlongs",
        pageIndex: { left: -2, right: "3" },
      },
    }),
  );
  await display.persist.rehydrate();
  expect(display.getState()).toMatchObject({
    density: "desk",
    theme: "pulse",
    units: "auto",
    pageIndex: { left: 0, right: 0 },
  });
});

it("wraps stepPage in both directions and keeps rails independent", () => {
  display.getState().stepPage("right", 1, 5);
  display.getState().stepPage("right", 1, 5);
  expect(display.getState().pageIndex).toEqual({ left: 0, right: 2 });

  display.getState().stepPage("left", -1, 5);
  expect(display.getState().pageIndex).toEqual({ left: 4, right: 2 });

  display.getState().stepPage("left", 1, 5);
  expect(display.getState().pageIndex.left).toBe(0);

  display.getState().setPage("right", 4);
  display.getState().stepPage("right", 1, 5);
  expect(display.getState().pageIndex.right).toBe(0);

  display.getState().stepPage("right", 1, 0);
  expect(display.getState().pageIndex.right).toBe(0);
});

it("persists density, theme, units and page indexes", () => {
  display.getState().setDensity("desk");
  display.getState().setTheme("brass");
  display.getState().setUnits("metric");
  display.getState().setPage("left", 3);
  const persisted = JSON.parse(
    sessionStorage.getItem("propulse-hamclock-display")!,
  );
  expect(persisted.state).toMatchObject({
    density: "desk",
    theme: "brass",
    units: "metric",
    pageIndex: { left: 3, right: 0 },
  });
});
