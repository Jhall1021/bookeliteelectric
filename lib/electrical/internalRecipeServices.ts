/** Service-shaped recipe fixtures retained for reusable scope, never sold as
 * standalone homeowner services. */
export const INTERNAL_RECIPE_ONLY_SERVICE_SLUGS = [
  // Sold through New 120V Outlet's own surface-raceway branch. Keeping the
  // prepared row gives pricing/material tooling a reusable recipe, but it
  // must not appear as a second homeowner service.
  "surface-mounted-outlet",
  "surface-mounted-switch",
  "surface-mounted-fixture-box",
  // The one exterior-GFCI card qualifies back-to-back power first, then
  // hands longer runs to this prepared destination behind the scenes.
  "exterior-gfci-other-routing",
] as const;
