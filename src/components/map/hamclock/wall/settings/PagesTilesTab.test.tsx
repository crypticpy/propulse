import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useHamClockWidgetConfigStore } from "@/stores/hamclockWidgetConfigStore";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { HAMCLOCK_WALL_PAGES } from "../pages";
import { WALL_PRESETS } from "../presets";
import { WALL_TILES } from "../tiles";
import { PagesTilesTab } from "./PagesTilesTab";

/** SlotEditor now lives on its own "TILES" sub-page (bot review after PR
 * #234 — the flat single-panel tab overflowed the 80vh dialog at 1366×768).
 * Tests that interact with the page/rail picker or the tile toggle list
 * must switch there first. */
function goToTilesSubPage() {
  fireEvent.click(screen.getByRole("radio", { name: "TILES" }));
}

describe("PagesTilesTab (B4/HW-27, HW-50, HW-52)", () => {
  beforeEach(() => {
    localStorage.removeItem("propulse-hamclock-widget-config");
    useHamClockWidgetConfigStore.setState({ widgets: {} });
    sessionStorage.removeItem("propulse-hamclock-display");
    useHamClockDisplayStore.getState().resetDisplay();
  });

  it("lists every shipped preset as a card", () => {
    render(<PagesTilesTab />);
    for (const preset of WALL_PRESETS) {
      expect(screen.getByText(preset.name.toUpperCase())).toBeTruthy();
    }
  });

  it("applies a preset's layout and autoPage when its card is used", () => {
    render(<PagesTilesTab />);
    const spaceWeather = WALL_PRESETS.find((p) => p.name === "Space weather")!;
    const card = screen
      .getByText("SPACE WEATHER")
      .closest(".hcc-preset-card")!;
    fireEvent.click(
      Array.from(card.querySelectorAll("button")).find(
        (b) => b.textContent === "USE THIS PRESET",
      )!,
    );
    expect(useHamClockDisplayStore.getState().railLayout).toEqual(
      spaceWeather.layout,
    );
    expect(useHamClockDisplayStore.getState().autoPage).toEqual(
      spaceWeather.autoPage,
    );
  });

  it("offers the preset's theme without forcing it, and KEEP CURRENT THEME leaves the theme alone", () => {
    render(<PagesTilesTab />);
    expect(useHamClockDisplayStore.getState().theme).toBe("pulse");
    const card = screen
      .getByText("WEATHER WALL")
      .closest(".hcc-preset-card")!;
    fireEvent.click(
      Array.from(card.querySelectorAll("button")).find(
        (b) => b.textContent === "USE THIS PRESET",
      )!,
    );
    // Weather wall suggests "classic", which differs from the default
    // "pulse" theme, so the offer must appear — but the layout is already
    // applied regardless of what the operator decides about the theme.
    expect(screen.getByText(/suggests the CLASSIC theme/)).toBeTruthy();
    expect(useHamClockDisplayStore.getState().theme).toBe("pulse");

    fireEvent.click(screen.getByRole("button", { name: "KEEP CURRENT THEME" }));
    expect(useHamClockDisplayStore.getState().theme).toBe("pulse");
    expect(screen.queryByText(/suggests the/)).toBeNull();
  });

  it("switches the theme when SWITCH THEME is chosen", () => {
    render(<PagesTilesTab />);
    const card = screen
      .getByText("WEATHER WALL")
      .closest(".hcc-preset-card")!;
    fireEvent.click(
      Array.from(card.querySelectorAll("button")).find(
        (b) => b.textContent === "USE THIS PRESET",
      )!,
    );
    fireEvent.click(screen.getByRole("button", { name: "SWITCH THEME" }));
    expect(useHamClockDisplayStore.getState().theme).toBe("classic");
  });

  it("shows a page and rail picker with all five shipped pages", () => {
    render(<PagesTilesTab />);
    goToTilesSubPage();
    for (const page of HAMCLOCK_WALL_PAGES) {
      expect(screen.getByText(page.title.toUpperCase())).toBeTruthy();
    }
    expect(screen.getByText("LEFT RAIL")).toBeTruthy();
    expect(screen.getByText("RIGHT RAIL")).toBeTruthy();
  });

  it("shows the used/limit count for the selected page and rail", () => {
    render(<PagesTilesTab />);
    goToTilesSubPage();
    // Default page is "spots", default rail is "left"; the shipped
    // composition places 3 tiles there at wall density (limit 4).
    expect(screen.getByText("3 of 4 used")).toBeTruthy();
  });

  it("toggles a tile on and off, updating railLayout for the selected page and rail", () => {
    render(<PagesTilesTab />);
    goToTilesSubPage();
    const row = screen.getByText(WALL_TILES.xray.title).closest(".hcc-row")!;
    const toggle = row.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(toggle.textContent).toBe("OFF");

    fireEvent.click(toggle);
    expect(
      useHamClockDisplayStore
        .getState()
        .railLayout.left.find((p) => p.pageId === "spots")?.tileIds,
    ).toContain("xray");

    fireEvent.click(toggle);
    expect(
      useHamClockDisplayStore
        .getState()
        .railLayout.left.find((p) => p.pageId === "spots")?.tileIds,
    ).not.toContain("xray");
  });

  it("disables and labels a tile already on this page's other rail", () => {
    render(<PagesTilesTab />);
    goToTilesSubPage();
    // The shipped "spots" page places bestBand on the right rail; the left
    // picker (default selection) must refuse to add it too.
    const row = screen
      .getByText(WALL_TILES.bestBand.title)
      .closest(".hcc-row")!;
    expect(row.getAttribute("data-disabled")).toBe("true");
    expect(row.querySelector(".hcc-row-detail")?.textContent).toBe(
      "ON RIGHT RAIL",
    );
  });

  it("reorders placed tiles with the up/down buttons", () => {
    render(<PagesTilesTab />);
    goToTilesSubPage();
    // Shipped left/spots order: cluster, bandActivity, recentContacts.
    const clusterRow = screen
      .getByText(WALL_TILES.cluster.title)
      .closest(".hcc-row")!;
    const moveDown = Array.from(clusterRow.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === "Move DX cluster down",
    )!;
    fireEvent.click(moveDown);
    expect(
      useHamClockDisplayStore
        .getState()
        .railLayout.left.find((p) => p.pageId === "spots")?.tileIds,
    ).toEqual(["bandActivity", "cluster", "recentContacts"]);
  });

  it("disables adding another tile once the rail's slot limit is reached", () => {
    render(<PagesTilesTab />);
    goToTilesSubPage();
    // Shipped left/spots already has 3 of 4; add one more to hit the limit.
    const xrayRow = screen.getByText(WALL_TILES.xray.title).closest(".hcc-row")!;
    fireEvent.click(xrayRow.querySelector('[role="switch"]')!);
    expect(screen.getByText("4 of 4 used")).toBeTruthy();

    const spaceWxRow = screen
      .getByText(WALL_TILES.spaceWx.title)
      .closest(".hcc-row")!;
    expect(spaceWxRow.getAttribute("data-disabled")).toBe("true");
    expect(spaceWxRow.querySelector(".hcc-row-detail")?.textContent).toBe(
      "RAIL FULL",
    );
  });

  it("resets to the shipped layout", () => {
    useHamClockDisplayStore.getState().setRailLayout({
      left: [{ pageId: "spots", tileIds: ["xray"] }],
      right: [],
    });
    render(<PagesTilesTab />);
    fireEvent.click(
      screen.getByRole("button", { name: "RESET TO SHIPPED LAYOUT" }),
    );
    expect(
      useHamClockDisplayStore
        .getState()
        .railLayout.left.find((p) => p.pageId === "spots")?.tileIds,
    ).toEqual(["cluster", "bandActivity", "recentContacts"]);
  });

  it("saves the current layout as a named preset", () => {
    render(<PagesTilesTab />);
    fireEvent.click(screen.getByRole("button", { name: "SAVE AS PRESET" }));
    fireEvent.change(screen.getByLabelText("Preset name"), {
      target: { value: "My Living Room" },
    });
    fireEvent.click(screen.getByRole("button", { name: "SAVE" }));
    expect(useHamClockDisplayStore.getState().presets).toHaveLength(1);
    expect(useHamClockDisplayStore.getState().presets[0].name).toBe(
      "My Living Room",
    );
    expect(screen.queryByLabelText("Preset name")).toBeNull();
  });

  it("shows an OPTIONS gear only on tiles that carry a config, and opens that tile's panel", () => {
    render(<PagesTilesTab />);
    goToTilesSubPage();
    // recentContacts is the reference registration (B5); page to where it
    // sits in the picker's tile list (18 tiles, 8 per page -> page 3).
    fireEvent.click(screen.getByRole("button", { name: "NEXT" }));
    fireEvent.click(screen.getByRole("button", { name: "NEXT" }));

    const optionsButtons = screen.getAllByRole("button", { name: /options$/i });
    expect(optionsButtons.length).toBeGreaterThanOrEqual(1);
    expect(optionsButtons[0].textContent).toBe("OPTIONS");

    fireEvent.click(optionsButtons[0]);
    expect(screen.getByText("Rows shown")).toBeTruthy();
  });

  it("pages through the tile list with PREV/NEXT", () => {
    render(<PagesTilesTab />);
    goToTilesSubPage();
    expect(screen.getByText("1 / 3")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "PREV" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "NEXT" }));
    expect(screen.getByText("2 / 3")).toBeTruthy();
  });

  it("renders saved presets as SAVED-tagged cards and applies their layout/autoPage when selected", () => {
    useHamClockDisplayStore.getState().setRailLayout({
      left: [{ pageId: "spots", tileIds: ["xray"] }],
      right: [],
    });
    useHamClockDisplayStore
      .getState()
      .setAutoPage({ enabled: false, dwellSeconds: 15 });
    const saved = useHamClockDisplayStore.getState().savePreset("My Wall");
    // Put the store back on the shipped layout/autoPage so the assertions
    // below can only pass if selecting the card actually re-applies them.
    useHamClockDisplayStore.getState().resetRailLayout();
    useHamClockDisplayStore
      .getState()
      .setAutoPage({ enabled: true, dwellSeconds: 30 });

    render(<PagesTilesTab />);
    const card = screen.getByText("MY WALL").closest(".hcc-preset-card")!;
    expect(card.querySelector(".hcc-preset-card-tag")?.textContent).toBe(
      "SAVED",
    );

    fireEvent.click(
      Array.from(card.querySelectorAll("button")).find(
        (b) => b.textContent === "USE THIS PRESET",
      )!,
    );
    expect(useHamClockDisplayStore.getState().railLayout).toEqual(
      saved.layout,
    );
    expect(useHamClockDisplayStore.getState().autoPage).toEqual(
      saved.autoPage,
    );
  });

  it("removes a saved preset when its REMOVE button is used", () => {
    useHamClockDisplayStore.getState().savePreset("Temp Preset");
    render(<PagesTilesTab />);
    expect(screen.getByText("TEMP PRESET")).toBeTruthy();

    const card = screen.getByText("TEMP PRESET").closest(".hcc-preset-card")!;
    fireEvent.click(
      Array.from(card.querySelectorAll("button")).find(
        (b) => b.textContent === "REMOVE",
      )!,
    );
    expect(useHamClockDisplayStore.getState().presets).toHaveLength(0);
    expect(screen.queryByText("TEMP PRESET")).toBeNull();
  });

  it("clears a stale theme offer once a later preset selection matches the active theme", () => {
    render(<PagesTilesTab />);
    // Weather wall suggests "classic", which differs from the default
    // "pulse" theme, so the offer appears without the operator choosing
    // either option yet.
    const weatherCard = screen
      .getByText("WEATHER WALL")
      .closest(".hcc-preset-card")!;
    fireEvent.click(
      Array.from(weatherCard.querySelectorAll("button")).find(
        (b) => b.textContent === "USE THIS PRESET",
      )!,
    );
    expect(screen.getByText(/suggests the CLASSIC theme/)).toBeTruthy();

    // Radio suggests "pulse", which still matches the (untouched) active
    // theme — this selection must clear the stale Classic offer rather than
    // leaving it on screen pointing at a preset that is no longer selected.
    const radioCard = screen.getByText("RADIO").closest(".hcc-preset-card")!;
    fireEvent.click(
      Array.from(radioCard.querySelectorAll("button")).find(
        (b) => b.textContent === "USE THIS PRESET",
      )!,
    );
    expect(screen.queryByText(/suggests the/)).toBeNull();
    expect(useHamClockDisplayStore.getState().theme).toBe("pulse");
  });
});
