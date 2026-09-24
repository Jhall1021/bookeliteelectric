export type ElectricalRecipeGapBaseline = {
  key: string;
  canonicalName: string;
  canonicalNotes: string;
  unit: "each";
  unitCostCents: number;
  sourceLabel: string;
  sourceUrl: string;
  specNote: string;
  sourcedAt: Date;
};

/**
 * Dated platform references for the three discrete items whose canonical
 * service recipes existed in source but were absent from the older rehearsal
 * snapshot. These are retail references, never values borrowed from a
 * contractor. Each recipe consumes one complete item.
 */
export const ELECTRICAL_RECIPE_GAP_BASELINES: readonly ElectricalRecipeGapBaseline[] = [
  {
    key: "BOX_EXTERIOR_FIXTURE",
    canonicalName: "Exterior fixture box",
    canonicalNotes: "Ordinary fixture-rated exterior box for a bounded one-light package.",
    unit: "each",
    unitCostCents: 798,
    sourceLabel: "Commercial Electric WRB550W 4-in. round metallic weatherproof box, The Home Depot",
    sourceUrl: "https://www.homedepot.com/p/Commercial-Electric-4-in-Round-Metallic-Weatherproof-Outlet-Box-with-5-1-2-in-Holes-White-WRB550W/300847176",
    specNote: "One 4-in. round metallic weatherproof fixture box with five 1/2-in. threaded holes, closure plugs and mounting hardware",
    sourcedAt: new Date("2026-09-24T00:00:00.000Z"),
  },
  {
    key: "TV_MOUNT_TILT_STANDARD",
    canonicalName: "Tilting TV wall mount, standard",
    canonicalNotes: "Contractor-supplied standard tilting mount; exact TV size, weight and VESA compatibility must be confirmed.",
    unit: "each",
    unitCostCents: 3997,
    sourceLabel: "Commercial Electric MB-50901 tilting TV wall mount, The Home Depot",
    sourceUrl: "https://www.homedepot.com/p/311842875",
    specNote: "One standard tilting steel wall mount for compatible 37-in. to 90-in. TVs up to 100 lb; mounting hardware included",
    sourcedAt: new Date("2026-09-24T00:00:00.000Z"),
  },
  {
    key: "TV_MOUNT_FULL_MOTION_STANDARD",
    canonicalName: "Full-motion articulating TV wall mount, standard",
    canonicalNotes: "Contractor-supplied standard full-motion mount; exact TV size, weight and VESA compatibility must be confirmed.",
    unit: "each",
    unitCostCents: 8997,
    sourceLabel: "Commercial Electric XD2616-L full-motion TV wall mount, The Home Depot",
    sourceUrl: "https://www.homedepot.com/p/Commercial-Electric-Full-Motion-TV-Wall-Mount-for-32-in-to-90-in-TVs-XD2616-L/328180253",
    specNote: "One heavy-gauge full-motion wall mount for compatible 32-in. to 90-in. TVs up to 132 lb; mounting hardware included",
    sourcedAt: new Date("2026-09-24T00:00:00.000Z"),
  },
];
