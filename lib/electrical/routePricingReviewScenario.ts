import { SURFACE_KEYS } from "../../prisma/_surfaceRouteModule";

export type RoutePricingReviewScenario = {
  serviceSlug: string;
  label: string;
  scope: string;
  answers: Record<string, string>;
};

const straightSurfaceAnswers: Record<string, string> = {
  [SURFACE_KEYS.feet]: "10",
  [SURFACE_KEYS.inside]: "0",
  [SURFACE_KEYS.outside]: "0",
  [SURFACE_KEYS.flat]: "0",
  [SURFACE_KEYS.surface]: "drywall",
  [SURFACE_KEYS.obstacles]: "clear",
};

export const NEW_OUTLET_REVIEW_ROUTE = { feet: 31, inside: 0, outside: 0, flat: 0 } as const;
export const NEW_OUTLET_REVIEW_ANSWERS: Record<string, string> = {
  outlet_load_type: "everyday",
  outlet_power_source: "tap_existing",
  below_above_access: "no_access",
  outlet_install_method: "surface",
  [SURFACE_KEYS.feet]: String(NEW_OUTLET_REVIEW_ROUTE.feet),
  [SURFACE_KEYS.inside]: "0",
  [SURFACE_KEYS.outside]: "0",
  [SURFACE_KEYS.flat]: "0",
  [SURFACE_KEYS.surface]: "drywall",
  [SURFACE_KEYS.obstacles]: "clear",
};

const scenarios: Record<string, RoutePricingReviewScenario> = {
  "new-120v-outlet": {
    serviceSlug: "new-120v-outlet",
    label: `${NEW_OUTLET_REVIEW_ROUTE.feet}-foot straight surface route`,
    scope: "One ordinary new outlet from an existing suitable source, on clear drywall, with no corners.",
    answers: NEW_OUTLET_REVIEW_ANSWERS,
  },
  "surface-mounted-outlet": {
    serviceSlug: "surface-mounted-outlet",
    label: "10-foot straight surface-mounted outlet route",
    scope: "One outlet from an existing suitable source, on clear drywall, with no corners.",
    answers: straightSurfaceAnswers,
  },
  "surface-mounted-switch": {
    serviceSlug: "surface-mounted-switch",
    label: "10-foot straight surface-mounted switch route",
    scope: "One switch endpoint from an existing suitable source, on clear drywall, with no corners.",
    answers: straightSurfaceAnswers,
  },
  "surface-mounted-fixture-box": {
    serviceSlug: "surface-mounted-fixture-box",
    label: "10-foot straight powered fixture-box route",
    scope: "One powered fixture box from an existing suitable source, on clear drywall, with no decorative fixture installation and no corners.",
    answers: straightSurfaceAnswers,
  },
};

export function routePricingReviewScenario(serviceSlug: string): RoutePricingReviewScenario | null {
  return scenarios[serviceSlug] ?? null;
}

export const ROUTE_PRICING_REVIEW_SERVICE_SLUGS = Object.freeze(Object.keys(scenarios).sort());
