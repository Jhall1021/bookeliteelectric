/**
 * How a contractor finds a material in a list of a hundred.
 *
 * PRESENTATION TAXONOMY, NOT IDENTITY. A category never participates in
 * pricing, routing, recipes or the approval fingerprint. It is not encoded in
 * the role key, because a key is what the platform means by the role and a
 * category is how a person likes to browse — and the two change for different
 * reasons.
 *
 * The friendly NAME is `CanonicalMaterial.name`, which already reads as
 * English ("Surface raceway internal elbow"). A second naming system would be
 * another thing to keep in step with the first, so there is not one: the admin
 * shows `nameOverride ?? name`, and the key is never displayed.
 */
export const MATERIAL_CATEGORIES = [
  "Wire & Cable",
  "Individual Conductors",
  "Devices",
  "Boxes & Covers",
  "Surface Raceway",
  "EMT & Fittings",
  "Lighting",
  "Fans",
  "Outdoor",
  "Fasteners & Supports",
  "Other",
] as const;

export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

/**
 * Key pattern to category. First match wins, so order is meaningful:
 * CONDUCTOR_ before WIRE_, because an individual conductor is not NM cable and
 * the whole point of the Stage C split was that they are different things.
 */
const RULES: { test: RegExp; category: MaterialCategory }[] = [
  { test: /^CONDUCTOR_/, category: "Individual Conductors" },
  { test: /^WIRE_|^CABLE_|_NM_|^SER_|^UF_/, category: "Wire & Cable" },
  { test: /^SURFACE_RACEWAY_/, category: "Surface Raceway" },
  { test: /^EMT_|^CONDUIT_|^BUSHING_|^LOCKNUT_/, category: "EMT & Fittings" },
  { test: /BOX|COVER|PLATE|MUD_RING|RING$/, category: "Boxes & Covers" },
  { test: /RECEPTACLE|SWITCH|DIMMER|GFCI|AFCI|BREAKER|DEVICE/, category: "Devices" },
  { test: /FIXTURE|LIGHT|LAMP|LED|CANLESS|RECESSED|TRIM/, category: "Lighting" },
  { test: /FAN/, category: "Fans" },
  { test: /EXTERIOR|OUTDOOR|WEATHERPROOF|IN_USE_COVER|PHOTOCELL/, category: "Outdoor" },
  { test: /STRAP|CLIP|ANCHOR|SCREW|STAPLE|SUPPORT/, category: "Fasteners & Supports" },
];

/**
 * Null-safe and total: every key gets a category, and "Other" is a real
 * answer rather than a failure. An uncategorised material must still appear in
 * the list — hiding it would be the one outcome worse than mis-grouping it.
 */
export function categoryForKey(key: string): MaterialCategory {
  for (const r of RULES) if (r.test.test(key)) return r.category;
  return "Other";
}
