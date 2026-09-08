/**
 * DS-14 section accents.
 *
 * One tone per container, so the same kind of content wears the same hue on
 * every page: a container declares `data-accent`, and the `su-section-*` /
 * `su-widget-*` classes in `src/styles/globals.css` paint the rule, the
 * header hover and the widget-header wash from it. Nothing here emits a
 * colour — the tone names resolve to the existing station tokens, so the
 * palettes and colour-blind mode keep working.
 *
 * See docs/designs/design-system/README.md § Section accents.
 */

/** The station tone roles a container may wear. */
export type SectionAccent = "accent" | "info" | "success" | "warning" | "danger";

/**
 * Content families. `danger` is deliberately not reachable from a family:
 * it is reserved for alert states, never for a section's identity.
 */
export type SectionFamily =
  | "propagation"
  | "spaceWeather"
  | "localEnvironment"
  | "reference";

const FAMILY_ACCENT: Record<SectionFamily, SectionAccent> = {
  propagation: "accent",
  spaceWeather: "warning",
  localEnvironment: "success",
  reference: "info",
};

/** The tone a content family wears, on every page. */
export function accentForFamily(family: SectionFamily): SectionAccent {
  return FAMILY_ACCENT[family];
}

/**
 * Family per Home dashboard item id (see `HOME_LAYOUT_ITEMS` in
 * src/lib/home/layout.ts). Anything not listed is reference material, which
 * is the quietest tone and the right default for a new catalogue panel.
 */
const HOME_ITEM_FAMILY: Record<string, SectionFamily> = {
  activity: "propagation",
  forecast: "propagation",
  solar: "spaceWeather",
  weather: "localEnvironment",
  daylight: "localEnvironment",
  tides: "localEnvironment",
  environment: "localEnvironment",
  metar: "localEnvironment",
};

/** The tone a Home dashboard item's container wears. */
export function accentForHomeItem(id: string): SectionAccent {
  return accentForFamily(HOME_ITEM_FAMILY[id] ?? "reference");
}
