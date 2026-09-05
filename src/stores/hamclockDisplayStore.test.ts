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
