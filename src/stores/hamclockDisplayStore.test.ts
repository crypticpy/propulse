import { beforeEach, describe, expect, it } from "vitest";
import {
  assertUniqueTilesPerPage,
  findDuplicateTile,
} from "@/lib/hamclock/wallPages";
import {
  clampPageIndex,
  railLayoutPageIds,
  sanitizeRailLayout,
  useHamClockDisplayStore as display,
  wallPages,
  type RailLayout,
} from "./hamclockDisplayStore";

function cloneLayout(layout: RailLayout): RailLayout {
  return {
    left: layout.left.map((page) => ({ ...page, tileIds: [...page.tileIds] })),
    right: layout.right.map((page) => ({
      ...page,
      tileIds: [...page.tileIds],
    })),
  };
}

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
    density: "wall",
    theme: "pulse",
    units: "auto",
    pageIndex: { left: 0, right: 0 },
  });
});

it("moves a pre-wall v2 session onto the new wall default", async () => {
  sessionStorage.setItem(
    "propulse-hamclock-display",
    JSON.stringify({
      version: 2,
      state: { density: "desk", theme: "brass", units: "metric" },
    }),
  );
  await display.persist.rehydrate();
  expect(display.getState()).toMatchObject({
    density: "wall",
    theme: "brass",
    units: "metric",
  });
});

it("rejects invalid persisted wall options", async () => {
  sessionStorage.setItem(
    "propulse-hamclock-display",
    JSON.stringify({
      version: 3,
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
    density: "wall",
    theme: "pulse",
    units: "auto",
    pageIndex: { left: 0, right: 0 },
  });
});

it("reconciles a persisted session with diverged rail pages onto the left value", async () => {
  sessionStorage.setItem(
    "propulse-hamclock-display",
    JSON.stringify({
      version: 3,
      state: { pageIndex: { left: 2, right: 4 } },
    }),
  );
  await display.persist.rehydrate();
  // Both rails follow one page: a stale session from before paging was
  // synchronized collapses onto `left` rather than keeping the split.
  expect(display.getState().pageIndex).toEqual({ left: 2, right: 2 });
});

it("keeps an explicit desk choice made after the wall default shipped", async () => {
  sessionStorage.setItem(
    "propulse-hamclock-display",
    JSON.stringify({ version: 3, state: { density: "desk" } }),
  );
  await display.persist.rehydrate();
  expect(display.getState().density).toBe("desk");
});

it("wraps stepPage in both directions with both rails always synchronized", () => {
  display.getState().stepPage("right", 1, 5);
  expect(display.getState().pageIndex).toEqual({ left: 1, right: 1 });

  display.getState().stepPage("left", 1, 5);
  expect(display.getState().pageIndex).toEqual({ left: 2, right: 2 });

  display.getState().stepPage("left", -1, 5);
  expect(display.getState().pageIndex).toEqual({ left: 1, right: 1 });

  // The `side` argument no longer selects a rail — both `setPage` and
  // `stepPage` always write the one shared page to both keys, regardless of
  // which side was passed.
  display.getState().setPage("left", 4);
  display.getState().stepPage("right", 1, 5);
  expect(display.getState().pageIndex).toEqual({ left: 0, right: 0 });

  display.getState().stepPage("right", 1, 0);
  expect(display.getState().pageIndex).toEqual({ left: 0, right: 0 });
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
    pageIndex: { left: 3, right: 3 },
  });
});

describe("assertUniqueTilesPerPage", () => {
  it("accepts a layout with no repeated tile ids", () => {
    expect(() =>
      assertUniqueTilesPerPage([
        { left: ["cluster", "bandActivity"], right: ["bestBand", "moon"] },
        { left: ["sun"], right: ["muf", "reliability"] },
      ]),
    ).not.toThrow();
  });

  it("rejects a tile repeated within one rail", () => {
    expect(() =>
      assertUniqueTilesPerPage([
        { left: ["cluster", "cluster"], right: ["bestBand"] },
      ]),
    ).toThrow(/page 0/);
  });

  it("rejects a tile placed on both rails of the same page", () => {
    expect(() =>
      assertUniqueTilesPerPage([
        { left: ["bandActivity"], right: ["bandActivity"] },
      ]),
    ).toThrow(/bandActivity/);
  });

  it("allows the same tile to reappear on a different page", () => {
    expect(() =>
      assertUniqueTilesPerPage([
        { left: ["bandActivity"], right: [] },
        { left: [], right: ["bandActivity"] },
      ]),
    ).not.toThrow();
  });
});

describe("findDuplicateTile", () => {
  it("returns null for a layout with no repeats", () => {
    expect(
      findDuplicateTile([{ left: ["cluster"], right: ["bestBand"] }]),
    ).toBeNull();
  });

  it("reports the page index and tile id of the first repeat", () => {
    expect(
      findDuplicateTile([
        { left: ["cluster"], right: [] },
        { left: ["moon"], right: ["moon"] },
      ]),
    ).toEqual({ pageIndex: 1, tileId: "moon" });
  });
});

describe("railLayoutPageIds", () => {
  it("orders left-rail page ids first, then any right-only page ids", () => {
    const layout: RailLayout = {
      left: [
        { pageId: "spots", tileIds: [] },
        { pageId: "solar", tileIds: [] },
      ],
      right: [
        { pageId: "solar", tileIds: [] },
        { pageId: "weather", tileIds: [] },
      ],
    };
    expect(railLayoutPageIds(layout)).toEqual(["spots", "solar", "weather"]);
  });
});

describe("railLayout / setRailLayout (HW-27, HW-50)", () => {
  it("seeds the shipped composition by default", () => {
    const layout = display.getState().railLayout;
    expect(railLayoutPageIds(layout)).toEqual([
      "spots",
      "solar",
      "forecast",
      "weather",
      "sdr",
    ]);
  });

  it("accepts a layout with no repeated tile placements", () => {
    const layout = cloneLayout(display.getState().railLayout);
    layout.left[0].tileIds = ["cluster"];
    const accepted = display.getState().setRailLayout(layout);
    expect(accepted).toBe(true);
    expect(display.getState().railLayout.left[0].tileIds).toEqual(["cluster"]);
  });

  it("rejects a layout that places the same tile twice on one page and keeps the previous layout", () => {
    const before = cloneLayout(display.getState().railLayout);
    const bad = cloneLayout(before);
    bad.left[0].tileIds = ["cluster"];
    bad.right[0].tileIds = [...bad.right[0].tileIds, "cluster"];

    const accepted = display.getState().setRailLayout(bad);

    expect(accepted).toBe(false);
    expect(display.getState().railLayout).toEqual(before);
  });

  it("resets to the shipped layout", () => {
    const layout = cloneLayout(display.getState().railLayout);
    layout.left[0].tileIds = ["cluster"];
    display.getState().setRailLayout(layout);
    display.getState().resetRailLayout();
    expect(railLayoutPageIds(display.getState().railLayout)).toEqual([
      "spots",
      "solar",
      "forecast",
      "weather",
      "sdr",
    ]);
    expect(display.getState().railLayout.left[0].tileIds).not.toEqual([
      "cluster",
    ]);
  });
});

describe("wallPages / pageIndex clamp (review pass after B4)", () => {
  it("shows exactly one page when the layout defines only one (a Living-room-style preset)", () => {
    const onePageLayout: RailLayout = {
      left: [{ pageId: "weather", tileIds: ["weather", "alerts"] }],
      right: [{ pageId: "weather", tileIds: ["emcomm", "moon"] }],
    };
    const accepted = display.getState().setRailLayout(onePageLayout);
    expect(accepted).toBe(true);
    const pages = wallPages(display.getState().railLayout);
    expect(pages).toEqual([{ id: "weather", title: "Weather & Emergency" }]);
  });

  it("appends a page named only on the right rail, so nothing is lost", () => {
    const layout: RailLayout = {
      left: [{ pageId: "spots", tileIds: ["cluster"] }],
      right: [{ pageId: "solar", tileIds: ["sun"] }],
    };
    expect(wallPages(layout).map((p) => p.id)).toEqual(["spots", "solar"]);
  });

  it("clamps pageIndex to the new layout's page count when setRailLayout shrinks it (page 4 of 5 -> page 1 of 2)", () => {
    display.getState().setPage("left", 4);
    expect(display.getState().pageIndex).toEqual({ left: 4, right: 4 });

    const twoPageLayout = cloneLayout(display.getState().railLayout);
    twoPageLayout.left = twoPageLayout.left.slice(0, 2);
    twoPageLayout.right = twoPageLayout.right.slice(0, 2);
    const accepted = display.getState().setRailLayout(twoPageLayout);

    expect(accepted).toBe(true);
    expect(display.getState().pageIndex).toEqual({ left: 1, right: 1 });
  });

  it("clamps pageIndex the same way when a preset switch shrinks the page count", () => {
    display.getState().setPage("left", 4);
    const twoPageLayout = cloneLayout(display.getState().railLayout);
    twoPageLayout.left = twoPageLayout.left.slice(0, 2);
    twoPageLayout.right = twoPageLayout.right.slice(0, 2);

    const applied = display
      .getState()
      .applyLayoutPreset(twoPageLayout, { enabled: true, dwellSeconds: 15 });

    expect(applied).toBe(true);
    expect(display.getState().pageIndex).toEqual({ left: 1, right: 1 });
  });
});

describe("clampPageIndex", () => {
  it("clamps into [0, count - 1], and to 0 when count is less than 1", () => {
    expect(clampPageIndex(4, 5)).toBe(4);
    expect(clampPageIndex(4, 2)).toBe(1);
    expect(clampPageIndex(-1, 5)).toBe(0);
    expect(clampPageIndex(0, 0)).toBe(0);
  });
});

describe("presets (wall spec §7)", () => {
  it("saves the current railLayout and autoPage as a new preset", () => {
    display.getState().setAutoPage({ enabled: false, dwellSeconds: 45 });
    const preset = display.getState().savePreset("My Preset");
    expect(preset.name).toBe("My Preset");
    expect(preset.autoPage).toEqual({ enabled: false, dwellSeconds: 45 });
    expect(display.getState().presets).toHaveLength(1);
    expect(display.getState().presets[0].id).toBe(preset.id);
  });

  it("deletes a preset by id", () => {
    const preset = display.getState().savePreset("Delete me");
    display.getState().deletePreset(preset.id);
    expect(display.getState().presets).toHaveLength(0);
  });

  it("applies a preset's layout and autoPage together, rejecting a duplicate-tile layout", () => {
    const layout = cloneLayout(display.getState().railLayout);
    layout.left[0].tileIds = ["cluster"];
    const applied = display
      .getState()
      .applyLayoutPreset(layout, { enabled: true, dwellSeconds: 10 });
    expect(applied).toBe(true);
    expect(display.getState().railLayout.left[0].tileIds).toEqual(["cluster"]);
    expect(display.getState().autoPage).toEqual({
      enabled: true,
      dwellSeconds: 10,
    });

    const before = cloneLayout(display.getState().railLayout);
    const bad = cloneLayout(before);
    bad.left[0].tileIds = ["cluster", "cluster"];
    const rejected = display
      .getState()
      .applyLayoutPreset(bad, { enabled: false, dwellSeconds: 20 });
    expect(rejected).toBe(false);
    expect(display.getState().railLayout).toEqual(before);
  });
});

describe("sanitizeRailLayout (read-time cleanup, wall spec §6)", () => {
  it("falls back to the shipped layout for a non-object value", () => {
    expect(railLayoutPageIds(sanitizeRailLayout(undefined))).toEqual([
      "spots",
      "solar",
      "forecast",
      "weather",
      "sdr",
    ]);
  });

  it("drops unknown tile ids and unknown page ids", () => {
    const cleaned = sanitizeRailLayout({
      left: [
        { pageId: "spots", tileIds: ["cluster", "retired-tile"] },
        { pageId: "retired-page", tileIds: ["moon"] },
      ],
      right: [{ pageId: "spots", tileIds: ["bestBand"] }],
    });
    expect(cleaned.left).toEqual([{ pageId: "spots", tileIds: ["cluster"] }]);
    expect(cleaned.right).toEqual([{ pageId: "spots", tileIds: ["bestBand"] }]);
  });

  it("falls back per-side to the shipped composition when a side ends up empty", () => {
    const cleaned = sanitizeRailLayout({
      left: [{ pageId: "retired-page", tileIds: ["moon"] }],
      right: [{ pageId: "spots", tileIds: ["bestBand"] }],
    });
    expect(railLayoutPageIds({ left: cleaned.left, right: [] })).toEqual([
      "spots",
      "solar",
      "forecast",
      "weather",
      "sdr",
    ]);
    expect(cleaned.right).toEqual([{ pageId: "spots", tileIds: ["bestBand"] }]);
  });

  it("falls back to the whole shipped layout when cleanup still leaves a duplicate", () => {
    const cleaned = sanitizeRailLayout({
      left: [{ pageId: "spots", tileIds: ["cluster"] }],
      right: [{ pageId: "spots", tileIds: ["cluster"] }],
    });
    expect(railLayoutPageIds(cleaned)).toEqual([
      "spots",
      "solar",
      "forecast",
      "weather",
      "sdr",
    ]);
  });
});

it("migrates a v3 session by seeding railLayout, presets and autoPage", async () => {
  sessionStorage.setItem(
    "propulse-hamclock-display",
    JSON.stringify({
      version: 3,
      state: { density: "desk", theme: "brass" },
    }),
  );
  await display.persist.rehydrate();
  expect(display.getState()).toMatchObject({
    density: "desk",
    theme: "brass",
    presets: [],
    autoPage: { enabled: true, dwellSeconds: 30 },
  });
  expect(railLayoutPageIds(display.getState().railLayout)).toEqual([
    "spots",
    "solar",
    "forecast",
    "weather",
    "sdr",
  ]);
});

it("migrates a v4 session still on the pre-B8 Spots rail to include the DX target tile", async () => {
  sessionStorage.setItem(
    "propulse-hamclock-display",
    JSON.stringify({
      version: 4,
      state: {
        railLayout: {
          left: [
            {
              pageId: "spots",
              tileIds: ["cluster", "bandActivity", "recentContacts"],
            },
            { pageId: "solar", tileIds: ["muf"] },
          ],
          right: [{ pageId: "spots", tileIds: ["bestBand"] }],
        },
      },
    }),
  );
  await display.persist.rehydrate();
  const layout = display.getState().railLayout;
  expect(layout.left[0]).toEqual({
    pageId: "spots",
    tileIds: ["cluster", "bandActivity", "recentContacts", "dxTarget"],
  });
  expect(layout.left[1]).toEqual({ pageId: "solar", tileIds: ["muf"] });
  expect(layout.right[0]).toEqual({ pageId: "spots", tileIds: ["bestBand"] });
});

it("leaves a customised Spots rail alone when migrating from v4", async () => {
  sessionStorage.setItem(
    "propulse-hamclock-display",
    JSON.stringify({
      version: 4,
      state: {
        railLayout: {
          left: [{ pageId: "spots", tileIds: ["cluster", "recentContacts"] }],
          right: [{ pageId: "spots", tileIds: ["bestBand"] }],
        },
      },
    }),
  );
  await display.persist.rehydrate();
  expect(display.getState().railLayout.left[0]).toEqual({
    pageId: "spots",
    tileIds: ["cluster", "recentContacts"],
  });
});


it.each([false, true])("migrates the former shipped activation slot while preserving custom rails (%s)", async (custom) => {
  const tiles = custom ? ["moon", "emcomm"] : ["bestBand", "greyLine", "muf", "reliability", "emcomm"];
  sessionStorage.setItem("propulse-hamclock-display", JSON.stringify({ version: 5, state: {
    railLayout: {
      left: [{ pageId: "spots", tileIds: ["cluster"] }],
      right: [{ pageId: "spots", tileIds: tiles }, { pageId: "weather", tileIds: ["emcomm"] }],
    },
  } }));
  await display.persist.rehydrate();
  const layout = display.getState().railLayout;
  expect(layout.right[0].tileIds).toEqual(custom ? tiles : ["bestBand", "greyLine", "muf", "reliability", "activations"]);
  expect(layout.right[1].tileIds).toEqual(["emcomm"]);
  expect(layout.left[0].tileIds).toEqual(["cluster"]);
});


it.each([false, true])("adopts WSJT-X on an unchanged v6 SDR rail while preserving customization (%s)", async (custom) => {
  const tiles = custom ? ["sdrScope", "moon"] : ["sdrScope", "sdrDecodes"];
  sessionStorage.setItem("propulse-hamclock-display", JSON.stringify({ version: 6, state: { railLayout: {
    left: [{ pageId: "sdr", tileIds: tiles }], right: [{ pageId: "sdr", tileIds: ["cluster"] }],
  } } }));
  await display.persist.rehydrate();
  expect(display.getState().railLayout.left[0].tileIds).toEqual(custom ? tiles : ["sdrScope", "sdrDecodes", "wsjtx"]);
  expect(display.getState().railLayout.right[0].tileIds).toEqual(["cluster"]);
});
