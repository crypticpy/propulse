import { describe, expect, it } from "vitest";
import { applyRailWidth, CANVAS_RULES, defaultRailStates, PHONE_SIZE_WEIGHT, railOrientation } from "./canvasRules";
import { getRegistryEntry, HOME_ONLY_IDS, WALL_SEEDED_IDS, WIDGET_REGISTRY } from "./registry";
import { autoDock } from "./autoDock";
import { RECIPE_RUN_THE_PILEUP, RECIPES } from "./recipes";
import type { CanvasRules, WidgetRegistryEntry } from "./types";

describe("canvasRules", () => {
  it("wall: 4 left / 5 right, view-only, hero-only pages allowed", () => {
    const wall = CANVAS_RULES.wall;
    expect(wall.rails).toEqual([
      { side: "left", weightBudget: 4 },
      { side: "right", weightBudget: 5 },
      { side: "top", weightBudget: 6 },
    ]);
    expect(wall.heroAllowed).toBe(false);
    expect(wall.heroOnly).toBe(true);
    expect(wall.railWidthPolicy).toBe("fixed");
    expect(wall.scaleRange).toEqual([0.7, 1.4]);
    expect(wall.tapTargetPt).toBeNull();
  });

  it("workstation: 5 left / 6 right / 6 bottom / 6 top, opposite-collapses", () => {
    const workstation = CANVAS_RULES.workstation;
    expect(workstation.rails).toEqual([
      { side: "left", weightBudget: 5 },
      { side: "right", weightBudget: 6 },
      { side: "bottom", weightBudget: 6 },
      { side: "top", weightBudget: 6 },
    ]);
    expect(workstation.heroAllowed).toBe(true);
    expect(workstation.railWidthPolicy).toBe("opposite-collapses");
    expect(workstation.scaleRange).toEqual([0.55, 0.85]);
  });

  it("tablet: right + top rails, fixed rail width policy", () => {
    const tablet = CANVAS_RULES.tablet;
    expect(tablet.rails).toEqual([
      { side: "right", weightBudget: 6 },
      { side: "top", weightBudget: 6 },
    ]);
    expect(tablet.railWidthPolicy).toBe("fixed");
    expect(tablet.scaleRange).toEqual([0.6, 0.95]);
  });

  it("phone: no rails, no hero, fixed-width canvas with a page budget", () => {
    const phone = CANVAS_RULES.phone;
    expect(phone.rails).toEqual([]);
    expect(phone.heroAllowed).toBe(false);
    expect(phone.scaleRange).toBeNull();
    expect(phone.fixedWidthPt).toBe(390);
    expect(phone.phone).toEqual({ maxWidgetsPerPage: 3, weightBudget: 3 });
  });

  it("PHONE_SIZE_WEIGHT: full=3, half=1.5, third=1, none=unplaceable", () => {
    expect(PHONE_SIZE_WEIGHT.full).toBe(3);
    expect(PHONE_SIZE_WEIGHT.half).toBe(1.5);
    expect(PHONE_SIZE_WEIGHT.third).toBe(1);
    expect(PHONE_SIZE_WEIGHT.none).toBe(Infinity);
  });

  describe("applyRailWidth", () => {
    it("workstation: setting left to wide collapses right, leaves top and bottom alone", () => {
      const rules = CANVAS_RULES.workstation;
      const initial = defaultRailStates(rules);
      const next = applyRailWidth(rules, initial, "left", "wide");
      expect(next.find((r) => r.side === "left")).toEqual({ side: "left", collapsed: false, width: "wide" });
      expect(next.find((r) => r.side === "right")).toEqual({ side: "right", collapsed: true, width: "normal" });
      expect(next.find((r) => r.side === "bottom")).toEqual({ side: "bottom", collapsed: false, width: "normal" });
      expect(next.find((r) => r.side === "top")).toEqual({ side: "top", collapsed: false, width: "normal" });
    });

    it("workstation: setting top to wide collapses bottom, leaves left and right alone", () => {
      const rules = CANVAS_RULES.workstation;
      const next = applyRailWidth(rules, defaultRailStates(rules), "top", "wide");
      expect(next.find((r) => r.side === "top")).toEqual({ side: "top", collapsed: false, width: "wide" });
      expect(next.find((r) => r.side === "bottom")).toEqual({ side: "bottom", collapsed: true, width: "normal" });
      expect(next.find((r) => r.side === "left")?.collapsed).toBe(false);
      expect(next.find((r) => r.side === "right")?.collapsed).toBe(false);
    });

    it("workstation: setting bottom to wide collapses top", () => {
      const rules = CANVAS_RULES.workstation;
      const next = applyRailWidth(rules, defaultRailStates(rules), "bottom", "wide");
      expect(next.find((r) => r.side === "bottom")?.width).toBe("wide");
      expect(next.find((r) => r.side === "top")?.collapsed).toBe(true);
      expect(next.find((r) => r.side === "left")?.collapsed).toBe(false);
    });

    it("workstation: returning left to normal un-collapses right", () => {
      const rules = CANVAS_RULES.workstation;
      const wide = applyRailWidth(rules, defaultRailStates(rules), "left", "wide");
      const back = applyRailWidth(rules, wide, "left", "normal");
      expect(back.find((r) => r.side === "right")?.collapsed).toBe(false);
    });

    it("wall: view-only — setting a rail wide is a no-op", () => {
      const rules = CANVAS_RULES.wall;
      const initial = defaultRailStates(rules);
      const next = applyRailWidth(rules, initial, "left", "wide");
      expect(next.find((r) => r.side === "left")).toEqual({ side: "left", collapsed: false, width: "normal" });
      expect(next.find((r) => r.side === "right")).toEqual({ side: "right", collapsed: false, width: "normal" });
      expect(next.find((r) => r.side === "top")).toEqual({ side: "top", collapsed: false, width: "normal" });
    });
  });

  it("railOrientation: left/right are vertical; top and bottom are horizontal", () => {
    expect(railOrientation("left")).toBe("vertical");
    expect(railOrientation("right")).toBe("vertical");
    expect(railOrientation("top")).toBe("horizontal");
    expect(railOrientation("bottom")).toBe("horizontal");
  });
});

describe("registry", () => {
  it("seeds every wall tile id and every home-only id", () => {
    for (const id of WALL_SEEDED_IDS) expect(getRegistryEntry(id), id).toBeDefined();
    for (const id of HOME_ONLY_IDS) expect(getRegistryEntry(id), id).toBeDefined();
  });

  it("includes the additive map-hero and heat-map families as pickable", () => {
    expect(getRegistryEntry("mapHero")).toBeDefined();
    const heatMap = getRegistryEntry("heatMap");
    expect(heatMap).toBeDefined();
    expect(heatMap?.status).toBeUndefined();
  });

  it("every entry has an integer weight >= 1", () => {
    for (const [id, entry] of Object.entries(WIDGET_REGISTRY)) {
      expect(Number.isInteger(entry.weight), id).toBe(true);
      expect(entry.weight, id).toBeGreaterThanOrEqual(1);
    }
  });

  it("every entry declares a valid phoneSize and no widget is wall-interactive yet", () => {
    const validSizes = new Set(["full", "half", "third", "none"]);
    for (const [id, entry] of Object.entries(WIDGET_REGISTRY)) {
      expect(validSizes.has(entry.phoneSize), id).toBe(true);
      expect(entry.wallInteractive === true, id).toBe(false);
    }
  });

  it("the seven wall-only tiles have no phone form yet", () => {
    for (const id of ["pskStation", "wsjtx", "sdrScope", "sdrDecodes", "muf", "reliability", "emcomm"]) {
      expect(WIDGET_REGISTRY[id].densities).toEqual(["wall"]);
      expect(WIDGET_REGISTRY[id].phoneSize).toBe("none");
    }
  });
});

describe("autoDock", () => {
  it("fills the hero and a rail on workstation", () => {
    const result = autoDock(["mapHero", "cluster"], CANVAS_RULES.workstation);
    expect(result.refusals).toEqual([]);
    expect(result.placements).toEqual([
      { widgetId: "mapHero", slot: { kind: "space" } },
      { widgetId: "cluster", slot: { kind: "rail", side: "left" } },
    ]);
  });

  it("fills a wall rail with square-aspect widgets in order", () => {
    const result = autoDock(["bestBand", "sun"], CANVAS_RULES.wall);
    expect(result.refusals).toEqual([]);
    expect(result.placements).toEqual([
      { widgetId: "bestBand", slot: { kind: "rail", side: "left" } },
      { widgetId: "sun", slot: { kind: "rail", side: "left" } },
    ]);
  });

  it("refuses an unknown widget id", () => {
    const result = autoDock(["not-a-real-widget"], CANVAS_RULES.wall);
    expect(result.placements).toEqual([]);
    expect(result.refusals).toEqual([
      { widgetId: "not-a-real-widget", reason: '"not-a-real-widget" is not in the widget registry.' },
    ]);
  });

  it("falls back from a full rail to the other rail (left -> right)", () => {
    const rules: CanvasRules = {
      canvasType: "workstation",
      rails: [
        { side: "left", weightBudget: 3 },
        { side: "right", weightBudget: 3 },
      ],
      heroAllowed: false,
      heroDensity: null,
      minDensity: "work",
      railDensities: ["work"],
      railWidthPolicy: "fixed",
      tapTargetPt: 44,
      scaleRange: [0.55, 0.85],
    };
    const registry: Record<string, WidgetRegistryEntry> = {
      filler: mkEntry("filler", { aspect: "any", weight: 3 }),
      overflow: mkEntry("overflow", { aspect: "any", weight: 2 }),
    };
    const result = autoDock(["filler", "overflow"], rules, registry);
    expect(result.refusals).toEqual([]);
    expect(result.placements).toEqual([
      { widgetId: "filler", slot: { kind: "rail", side: "left" } },
      { widgetId: "overflow", slot: { kind: "rail", side: "right" } },
    ]);
  });

  it("refuses with a sentence naming both full rails, never evicting or spilling", () => {
    const rules: CanvasRules = {
      canvasType: "workstation",
      rails: [
        { side: "left", weightBudget: 5 },
        { side: "right", weightBudget: 6 },
      ],
      heroAllowed: false,
      heroDensity: null,
      minDensity: "work",
      railDensities: ["work"],
      railWidthPolicy: "fixed",
      tapTargetPt: 44,
      scaleRange: [0.55, 0.85],
    };
    const registry: Record<string, WidgetRegistryEntry> = {
      a: mkEntry("a", { aspect: "tall", weight: 5 }),
      b: mkEntry("b", { aspect: "tall", weight: 6 }),
      c: mkEntry("c", { aspect: "tall", weight: 1 }),
    };
    const result = autoDock(["a", "b", "c"], rules, registry);
    expect(result.placements).toEqual([
      { widgetId: "a", slot: { kind: "rail", side: "left" } },
      { widgetId: "b", slot: { kind: "rail", side: "right" } },
    ]);
    expect(result.refusals).toEqual([
      { widgetId: "c", reason: "Both rails are full (5 of 5 left, 6 of 6 right). Remove a widget first." },
    ]);
  });

  it("docks a hero and its single rail together on tablet", () => {
    const result = autoDock(["recentContacts", "cluster"], CANVAS_RULES.tablet);
    expect(result.refusals).toEqual([]);
    expect(result.placements).toEqual([
      { widgetId: "recentContacts", slot: { kind: "space" } },
      { widgetId: "cluster", slot: { kind: "rail", side: "right" } },
    ]);
  });

  it("refuses when both tablet rails are full (right then top fallback exhausted)", () => {
    const registry: Record<string, WidgetRegistryEntry> = {
      a: mkEntry("a", { aspect: "any", weight: 6, densities: ["work"] }),
      b: mkEntry("b", { aspect: "any", weight: 6, densities: ["work"] }),
      c: mkEntry("c", { aspect: "any", weight: 1, densities: ["work"] }),
    };
    const result = autoDock(["a", "b", "c"], CANVAS_RULES.tablet, registry);
    expect(result.placements).toEqual([
      { widgetId: "a", slot: { kind: "rail", side: "right" } },
      { widgetId: "b", slot: { kind: "rail", side: "top" } },
    ]);
    expect(result.refusals).toEqual([
      { widgetId: "c", reason: "Both rails are full (6 of 6 right, 6 of 6 top). Remove a widget first." },
    ]);
  });

  it("wide widgets prefer the top rail over a vertical fallback when both have room", () => {
    const rules: CanvasRules = {
      canvasType: "wall",
      rails: [
        { side: "left", weightBudget: 4 },
        { side: "top", weightBudget: 4 },
      ],
      heroAllowed: false,
      heroDensity: null,
      minDensity: "wall",
      railDensities: ["work"],
      railWidthPolicy: "fixed",
      tapTargetPt: 44,
      scaleRange: [0.7, 1.4],
    };
    const registry: Record<string, WidgetRegistryEntry> = {
      wide: mkEntry("wide", { aspect: "wide", weight: 1, transposable: false, densities: ["work"] }),
    };
    const result = autoDock(["wide"], rules, registry);
    expect(result.refusals).toEqual([]);
    expect(result.placements).toEqual([{ widgetId: "wide", slot: { kind: "rail", side: "top" } }]);
  });

  it("falls back from a full top rail onto a vertical rail", () => {
    const rules: CanvasRules = {
      canvasType: "workstation",
      rails: [
        { side: "left", weightBudget: 3 },
        { side: "top", weightBudget: 3 },
      ],
      heroAllowed: false,
      heroDensity: null,
      minDensity: "work",
      railDensities: ["work"],
      railWidthPolicy: "fixed",
      tapTargetPt: 44,
      scaleRange: [0.55, 0.85],
    };
    const registry: Record<string, WidgetRegistryEntry> = {
      filler: mkEntry("filler", { aspect: "wide", weight: 3 }),
      overflow: mkEntry("overflow", { aspect: "wide", weight: 1 }),
    };
    const result = autoDock(["filler", "overflow"], rules, registry);
    expect(result.refusals).toEqual([]);
    expect(result.placements).toEqual([
      { widgetId: "filler", slot: { kind: "rail", side: "top" } },
      { widgetId: "overflow", slot: { kind: "rail", side: "left" } },
    ]);
  });

  it("aspect prefers a matching-orientation rail over a mismatched one when both have room", () => {
    const rules: CanvasRules = {
      canvasType: "workstation",
      rails: [
        { side: "bottom", weightBudget: 5 },
        { side: "left", weightBudget: 5 },
      ],
      heroAllowed: false,
      heroDensity: null,
      minDensity: "work",
      railDensities: ["work"],
      railWidthPolicy: "fixed",
      tapTargetPt: 44,
      scaleRange: [0.55, 0.85],
    };
    const registry: Record<string, WidgetRegistryEntry> = {
      tall: mkEntry("tall", { aspect: "tall", weight: 2, transposable: false }),
    };
    // Left is vertical (matches "tall") and is listed second, bottom is
    // horizontal and is listed first: aspect preference wins the ordering.
    const result = autoDock(["tall"], rules, registry);
    expect(result.refusals).toEqual([]);
    expect(result.placements).toEqual([{ widgetId: "tall", slot: { kind: "rail", side: "left" } }]);
  });

  it("aspect is never a hard gate: a non-transposable widget docks on an orientation-mismatched rail when it's the only one available", () => {
    const rules: CanvasRules = {
      canvasType: "workstation",
      rails: [{ side: "bottom", weightBudget: 5 }],
      heroAllowed: false,
      heroDensity: null,
      minDensity: "work",
      railDensities: ["work"],
      railWidthPolicy: "fixed",
      tapTargetPt: 44,
      scaleRange: [0.55, 0.85],
    };
    const registry: Record<string, WidgetRegistryEntry> = {
      rigid: mkEntry("rigid", { aspect: "tall", weight: 2, transposable: false }),
    };
    const result = autoDock(["rigid"], rules, registry);
    expect(result.refusals).toEqual([]);
    expect(result.placements).toEqual([{ widgetId: "rigid", slot: { kind: "rail", side: "bottom" } }]);
  });

  it("refuses a widget only for density mismatch, never for aspect", () => {
    const registry: Record<string, WidgetRegistryEntry> = {
      wallOnly: mkEntry("wallOnly", { aspect: "any", weight: 1, densities: ["wall"] }),
    };
    const result = autoDock(["wallOnly"], CANVAS_RULES.workstation, registry);
    expect(result.placements).toEqual([]);
    expect(result.refusals).toEqual([
      { widgetId: "wallOnly", reason: '"WallOnly" has no workstation rail form.' },
    ]);
  });

  it("wall hero-only page places one widget and refuses the rest", () => {
    const result = autoDock(["cluster", "sun"], CANVAS_RULES.wall, WIDGET_REGISTRY, { heroOnly: true });
    expect(result.placements).toEqual([{ widgetId: "cluster", slot: { kind: "space" } }]);
    expect(result.refusals).toHaveLength(1);
    expect(result.refusals[0].reason).toMatch(/hero-only/);
  });

  it("wall hero-only refuses a widget that has no wall form, even as the sole widget", () => {
    const result = autoDock(["activity"], CANVAS_RULES.wall, WIDGET_REGISTRY, { heroOnly: true });
    expect(result.placements).toEqual([]);
    expect(result.refusals).toEqual([
      { widgetId: "activity", reason: '"Bands now" has no wall form.' },
    ]);
  });

  describe("phone", () => {
    it("stacks up to three widgets within the weight budget", () => {
      const result = autoDock(["bestBand", "activations", "xray"], CANVAS_RULES.phone);
      expect(result.refusals).toEqual([]);
      expect(result.placements).toEqual([
        { widgetId: "bestBand", slot: { kind: "stack", index: 0 } },
        { widgetId: "activations", slot: { kind: "stack", index: 1 } },
        { widgetId: "xray", slot: { kind: "stack", index: 2 } },
      ]);
    });

    it("refuses a fourth widget once the page is full", () => {
      const result = autoDock(["bestBand", "activations", "xray", "sun"], CANVAS_RULES.phone);
      expect(result.placements).toHaveLength(3);
      expect(result.refusals).toEqual([
        { widgetId: "sun", reason: "This phone page is full. Add a new page." },
      ]);
    });

    it("refuses a widget over budget by weight even under the count cap", () => {
      const result = autoDock(["cluster", "bestBand"], CANVAS_RULES.phone); // full(3) + third(1) > 3
      expect(result.placements).toEqual([{ widgetId: "cluster", slot: { kind: "stack", index: 0 } }]);
      expect(result.refusals).toEqual([
        { widgetId: "bestBand", reason: "This phone page is full. Add a new page." },
      ]);
    });

    it("refuses a phone-unavailable widget", () => {
      const result = autoDock(["mapHero"], CANVAS_RULES.phone);
      expect(result.placements).toEqual([]);
      expect(result.refusals).toEqual([
        { widgetId: "mapHero", reason: '"Map hero" is not available on the phone canvas.' },
      ]);
    });
  });
});

describe("recipes", () => {
  const flatCanvases = ["wall", "workstation", "tablet"] as const;

  it("every wall/workstation/tablet widget id exists in the registry", () => {
    for (const recipe of RECIPES) {
      for (const canvas of flatCanvases) {
        for (const id of recipe.layouts[canvas]) {
          expect(getRegistryEntry(id), `${recipe.id}.${canvas}.${id}`).toBeDefined();
        }
      }
    }
  });

  it("every phone page has 1-3 real, phone-available widgets within the weight budget", () => {
    for (const recipe of RECIPES) {
      for (const page of recipe.layouts.phone) {
        expect(page.length, recipe.id).toBeGreaterThanOrEqual(1);
        expect(page.length, recipe.id).toBeLessThanOrEqual(3);
        let weight = 0;
        for (const id of page) {
          const entry = getRegistryEntry(id);
          expect(entry, `${recipe.id}.${id}`).toBeDefined();
          expect(entry?.phoneSize, `${recipe.id}.${id}`).not.toBe("none");
          weight += entry ? PHONE_SIZE_WEIGHT[entry.phoneSize] : 0;
        }
        expect(weight, recipe.id).toBeLessThanOrEqual(3);
      }
    }
  });

  it("docks with zero refusals on every recipe x canvas combination (the invariant recipes must satisfy)", () => {
    for (const recipe of RECIPES) {
      for (const canvas of flatCanvases) {
        const result = autoDock(recipe.layouts[canvas], CANVAS_RULES[canvas]);
        expect(result.refusals, `${recipe.id}.${canvas}`).toEqual([]);
      }
    }
  });

  it("runThePileup docks on the wall with zero refusals (wide, non-transposable tiles included)", () => {
    const result = autoDock(RECIPE_RUN_THE_PILEUP.layouts.wall, CANVAS_RULES.wall);
    expect(result.refusals).toEqual([]);
    expect(result.placements).toHaveLength(RECIPE_RUN_THE_PILEUP.layouts.wall.length);
  });
});

function mkEntry(
  id: string,
  overrides: Partial<WidgetRegistryEntry> & Pick<WidgetRegistryEntry, "aspect" | "weight">,
): WidgetRegistryEntry {
  return {
    id,
    title: id.charAt(0).toUpperCase() + id.slice(1),
    densities: ["work"],
    canSpace: false,
    transposable: false,
    phoneSize: "third",
    scope: "global",
    bindings: [],
    ...overrides,
  };
}
