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
  "dedicated-120v-circuit-outlet": {
    serviceSlug: "dedicated-120v-circuit-outlet",
    label: "Standard 20A dedicated circuit with up to 50 feet of accessible routing",
    scope: "One 20A dedicated circuit and receptacle through an accessible attic, basement, crawlspace or drop ceiling.",
    answers: {
      dedicated_equipment: "knows_size", dedicated_amperage: "20a_120v",
      dedicated_route_access: "unfinished_basement", dedicated_distance: "25_to_50",
      dedicated_finish_ack: "accepted",
    },
  },
  "electric-fireplace-circuit": {
    serviceSlug: "electric-fireplace-circuit",
    label: "Standard 20A plug-in fireplace circuit with up to 50 feet of accessible routing",
    scope: "One 20A 120V receptacle for a standard plug-in fireplace on ordinary drywall.",
    answers: {
      fireplace_connection: "standard_plug", fireplace_amperage: "20a",
      fireplace_wall: "ordinary_drywall", fireplace_route_access: "unfinished_basement",
      fireplace_distance: "25_to_50",
    },
  },
  "new-240v-appliance-circuit": {
    serviceSlug: "new-240v-appliance-circuit",
    label: "Standard 30A dryer circuit with up to 50 feet of accessible routing",
    scope: "One modern four-wire dryer circuit with a surface-mounted receptacle box.",
    answers: {
      appliance_240v_type: "dryer", appliance_240v_connection: "four_prong_plug",
      appliance_240v_endpoint: "surface_box", appliance_240v_route_access: "unfinished_basement",
      appliance_240v_distance: "25_to_50",
    },
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
