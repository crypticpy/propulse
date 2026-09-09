/**
 * Starter pages (plan §5). Recipes are subordinate to pages: choosing one
 * seeds a new page with a widget set, and from that moment it is an
 * ordinary page the operator can edit. Four ship across #655/#661: A (Chase
 * DX) and B (Run the pile-up) shipped in #655; C (Solar watch) and D (Club
 * session) ship here (#661). D's gap (no multi-operator session object yet)
 * is documented on `RECIPE_CLUB_SESSION` below.
 *
 * Each recipe supplies an ordered widget id list per canvas type; wall,
 * workstation and tablet lists feed `autoDock` directly, which decides the
 * exact space/rail placement. Phone supplies an ordered list of *pages*
 * (plan §6: the operator flips through several), each 1-3 widget ids within
 * the phone weight budget (`canvasRules.ts` `PHONE_SIZE_WEIGHT`).
 *
 * Every id referenced below exists in `WIDGET_REGISTRY` (`registry.ts`);
 * `workspace.test.ts` asserts this so a typo or a renamed entry fails here,
 * not in a later PR.
 */

import type { Recipe } from "./types";

export const RECIPE_CHASE_DX: Recipe = {
  id: "chaseDx",
  title: "Chase DX",
  layouts: {
    // Space: 2D flat map, spot arcs on. Rail left: DX spot list. Rail
    // bottom: heat map, transposed. Rail right: empty ("+ ADD WIDGET").
    workstation: ["mapHero", "cluster", "heatMap"],
    wall: ["cluster", "heatMap"],
    tablet: ["cluster", "heatMap"],
    phone: [
      ["cluster"],
      ["heatMap"],
      ["bestBand", "activations", "xray"],
    ],
  },
};

export const RECIPE_RUN_THE_PILEUP: Recipe = {
  id: "runThePileup",
  title: "Run the pile-up",
  layouts: {
    // Space: DX spot list, promoted (hero = none). Rail right: heat map,
    // natural orientation. Rail bottom: logger. Rail left: empty.
    workstation: ["cluster", "heatMap", "recentContacts"],
    wall: ["cluster", "heatMap", "recentContacts"],
    tablet: ["cluster", "heatMap"],
    phone: [
      ["recentContacts"],
      ["cluster"],
      ["bandActivity", "greyLine"],
    ],
  },
};

export const RECIPE_SOLAR_WATCH: Recipe = {
  id: "solarWatch",
  title: "Solar watch",
  layouts: {
    // Space: none of these three take the hero (none declare `canSpace`),
    // so the space stays empty and the operator can add one; all three dock
    // into rails. Rail: x-ray + solar wind (square, cheap), then the 24h
    // forecast matrix (wide, weight 2).
    workstation: ["xray", "solarWind", "forecastMatrix"],
    wall: ["xray", "solarWind", "forecastMatrix"],
    tablet: ["xray", "solarWind", "forecastMatrix"],
    phone: [["forecastMatrix"], ["xray", "solarWind"]],
  },
};

/**
 * Club session (Recipe D, #661). The plan calls for a page anchored on a
 * shared *operating session* — several ops working one contact log together
 * — but that object (#633's `operatingStateStore` covers a single operator's
 * `sessionId` scope; a multi-operator session record is not built yet) does
 * not exist. This recipe ships with what exists today: `recentContacts`
 * (already `sessionId`-scoped, `bindings: ["sessionId", ...]` in the
 * registry) as the hero, plus the DX cluster and band activity so the crew
 * can see what to work next. When a real operating-session object ships,
 * this recipe should gain a session-roster/session-stats widget; tracked as
 * a handoff gap, not silently worked around.
 */
export const RECIPE_CLUB_SESSION: Recipe = {
  id: "clubSession",
  title: "Club session",
  layouts: {
    // Space: recentContacts (canSpace, work density) is the hero. Rail:
    // cluster (tall), then band activity (wide).
    workstation: ["recentContacts", "cluster", "bandActivity"],
    wall: ["recentContacts", "cluster", "bandActivity"],
    tablet: ["recentContacts", "cluster", "bandActivity"],
    phone: [["recentContacts"], ["cluster"], ["bandActivity", "bestBand"]],
  },
};

export const RECIPES: readonly Recipe[] = [
  RECIPE_CHASE_DX,
  RECIPE_RUN_THE_PILEUP,
  RECIPE_SOLAR_WATCH,
  RECIPE_CLUB_SESSION,
];

export function getRecipe(id: string): Recipe | undefined {
  return RECIPES.find((recipe) => recipe.id === id);
}
