/**
 * Structural vocabulary for storefront variants — ADR-015 Phase 3.
 *
 * A variant that only swaps colours is a skin. Two contractors on the same
 * template have to be able to look UNRELATED, and colour is the first thing a
 * homeowner stops noticing. So a variant chooses COMPOSITION: what the header
 * is shaped like, whether the hero reads as one column or two, whether
 * services are tiles or rows, what separates one section from the next.
 *
 * The test this vocabulary has to pass: remove colour and logo, and the
 * variants are still obviously different pages.
 *
 * Every axis is closed. Contractors do not get knobs — they choose among
 * designs Price2Book has approved, and these are the moves those designs are
 * allowed to make.
 */

export type ThemeStructure = {
  /**
   * Header composition.
   *   inline   logo left, links right, one row
   *   stacked  logo centred, links on a second row beneath a rule
   *   split    logo centred between two groups of links
   */
  nav: "inline" | "stacked" | "split";

  /**
   * Hero composition.
   *   split     two columns — copy beside a panel
   *   centered  one column, centred, the booking entry as the focal point
   *   banner    full-bleed statement with the entry point below it
   */
  hero: "split" | "centered" | "banner";

  /**
   * How the hero's supporting same-visit information is presented.
   *   panel  a bordered card beside the copy, reading as a distinct object
   *   strip  a full-width row of rungs beneath the booking entry
   */
  heroAside: "panel" | "strip";

  /**
   * How a set of services is laid out.
   *   grid  tiles in columns
   *   rows  full-width rows, one service per line
   */
  serviceList: "grid" | "rows";

  /**
   * What separates one section from the next.
   *   hairline  a rule
   *   space     whitespace only
   *   band      alternating grounds
   */
  sectionBreak: "hairline" | "space" | "band";

  /**
   * How a card sits on the page.
   *   outlined  hairline border, no shadow
   *   raised    shadow, no border
   */
  card: "outlined" | "raised";

  /** Vertical rhythm. */
  density: "compact" | "comfortable" | "spacious";

  /** Headline weight and case. */
  headline: "bold" | "light-caps";
};

/**
 * Every axis, so a proof can enumerate them without being edited each time one
 * is added. A variant pair that differs on too few of these is not a variant
 * pair, and the structure verifier says so.
 */
export const STRUCTURE_AXES = [
  "nav", "hero", "heroAside", "serviceList", "sectionBreak", "card", "density", "headline",
] as const satisfies readonly (keyof ThemeStructure)[];

/**
 * The value each axis falls back to when a component tests for the others.
 *
 * Components implement most values with an explicit branch and one value as
 * the else. That is fine, but it has to be DECLARED: otherwise a value nobody
 * implemented is indistinguishable from the intended fallback, and a
 * contractor who picks "banner" silently gets "split" with nothing reporting
 * it. The structure verifier holds every other value to having a real branch.
 */
export const STRUCTURE_DEFAULTS: { [K in keyof ThemeStructure]: ThemeStructure[K] } = {
  nav: "inline",
  hero: "split",
  heroAside: "panel",
  serviceList: "grid",
  sectionBreak: "space",
  card: "outlined",
  density: "comfortable",
  headline: "bold",
};

/** How many axes two variants of the same family must differ on. */
export const MIN_VARIANT_DISTANCE = 4;

export function structureDistance(a: ThemeStructure, b: ThemeStructure): (keyof ThemeStructure)[] {
  return STRUCTURE_AXES.filter((k) => a[k] !== b[k]);
}

/** Elite's composition as it ships. The parity anchor for Phase 1's proof. */
export const ELITE_V1_STRUCTURE: ThemeStructure = {
  nav: "inline",
  hero: "split",
  heroAside: "panel",
  serviceList: "grid",
  sectionBreak: "hairline",
  card: "outlined",
  density: "comfortable",
  headline: "bold",
};
