/**
 * Starter pages (plan §5). Recipes are subordinate to pages: choosing one
 * seeds a new page with a widget set, and from that moment it is an
 * ordinary page the operator can edit. Two ship in this PR — C (Solar
 * watch) and D (Club session) queue behind #661 (tablet + recipes C/D).
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

export const RECIPES: readonly Recipe[] = [RECIPE_CHASE_DX, RECIPE_RUN_THE_PILEUP];

export function getRecipe(id: string): Recipe | undefined {
  return RECIPES.find((recipe) => recipe.id === id);
}
