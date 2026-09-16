/**
 * Contractor-facing material grouping — presentation only.
 *
 * Neither `CanonicalMaterial` nor `ContractorMaterial` persists a category,
 * group or trade field (confirmed against prisma/schema.prisma — the only
 * `categoryPath` in the material domain lives on `MaterialSupplierLink` and is
 * a supplier's own product breadcrumb, not a Price2Book grouping concept).
 * Adding one would be a schema migration, which this slice deliberately
 * avoids.
 *
 * So a material's catalog group is DERIVED, deterministically, from its
 * canonical key's naming convention — the same convention the seed files
 * already use in their section comments (`// --- breakers ---`, etc.), just
 * read by code instead of by a human skimming the file. Nothing here is
 * stored; recategorizing later means changing this function, not a backfill.
 *
 * Ordered rules, first match wins. Order matters: a key can contain more than
 * one plausible signal (SPA_PANEL_GFCI_50A has both "PANEL" and "GFCI"), so
 * the more specific, more useful-to-a-contractor grouping is tested first.
 */

export const MATERIAL_CATEGORIES = [
  "Breakers & Protection",
  "Wire & Cable",
  "Devices",
  "Boxes & Fittings",
  "Conduit & Raceway",
  "Lighting",
  "Fans & Ventilation",
  "Service Equipment",
  "Low Voltage / Media",
  "Consumables",
  "Other",
] as const;

export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

const RULES: { test: (key: string) => boolean; category: MaterialCategory }[] = [
  // Panel, meter, service-entrance and grounding hardware reads as its own
  // system to a contractor, distinct from generic wire or boxes — and it must
  // be tested first, because "SPA_PANEL_GFCI_50A" and "WIRE_GROUND_6" would
  // otherwise fall into Devices and Wire & Cable respectively.
  {
    category: "Service Equipment",
    test: (k) =>
      k.includes("PANEL") ||
      k.includes("METER_SOCKET") ||
      k.includes("SERVICE_ENTRANCE") ||
      k.includes("GENERATOR_INLET") ||
      k.includes("GROUND"),
  },
  {
    category: "Breakers & Protection",
    test: (k) => k.includes("BREAKER") || k.includes("SURGE") || k.includes("INTERLOCK"),
  },
  { category: "Conduit & Raceway", test: (k) => k.includes("CONDUIT") },
  // Low-voltage signal/data/comms, ahead of the generic wire/cable rule so
  // CABLE_CAT6, CABLE_RG6 and WIRE_BELL_18_2 land here instead.
  {
    category: "Low Voltage / Media",
    test: (k) =>
      k.includes("BELL") ||
      k.includes("CAT6") ||
      k.includes("RG6") ||
      k.startsWith("JACK_") ||
      k.startsWith("LOW_VOLTAGE") ||
      k.includes("DOORBELL"),
  },
  { category: "Wire & Cable", test: (k) => k.startsWith("WIRE_") || k.startsWith("CABLE_") },
  {
    category: "Devices",
    test: (k) =>
      k.includes("RECEPTACLE") ||
      k.includes("OUTLET") ||
      k.includes("SWITCH") ||
      k.includes("DIMMER") ||
      k.includes("GFCI") ||
      k.includes("SMOKE"),
  },
  {
    category: "Boxes & Fittings",
    test: (k) => k.startsWith("BOX_") || k.includes("WALL_PLATE") || k.includes("COVER_"),
  },
  { category: "Lighting", test: (k) => k.includes("RECESSED") || k.startsWith("LED_") },
  { category: "Fans & Ventilation", test: (k) => k.includes("FAN") || k.includes("DUCT") },
  {
    category: "Consumables",
    test: (k) => k.includes("CONSUMABLE") || k.includes("CORD_CLIP"),
  },
];

export function categorizeMaterial(canonicalKey: string): MaterialCategory {
  const key = canonicalKey.toUpperCase();
  for (const rule of RULES) {
    if (rule.test(key)) return rule.category;
  }
  return "Other";
}
