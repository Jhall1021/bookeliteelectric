/**
 * HVAC Template V1 — the canonical catalog. H1 — catalog/domain foundation.
 *
 * AUTHORITY. Every fact below is taken from, in order of precedence:
 *
 *   1. docs/design/hvac-v0-catalog-review.md, Part 7 ("Service decisions from
 *      the trade pass") — the latest applied layer. It renames several
 *      services and moves two dispositions from FIXED to CONDITIONAL_FIXED
 *      relative to Part 5's own "approved" table, and says so explicitly
 *      ("FIXED → CONDITIONAL_FIXED"). Part 7 is later and applied; it wins.
 *   2. Part 5 ("The HVAC V1 catalog") for anything Part 7 does not touch —
 *      the seven categories, the 22-service membership, dispositions Part 7
 *      leaves alone.
 *   3. Part 3 ("The proposed catalog") for canonical keys and alias/intent
 *      vocabulary — Part 5 and Part 7 never redefine a key or an alias list,
 *      only names and dispositions.
 *
 * docs/design/hvac-v0-architecture.md and hvac-architecture-inspection.md are
 * NOT authoritative over the catalog review where they differ (instruction,
 * H1) — see the HVAC H1 return report for exactly where this mattered.
 *
 * WHAT THIS FILE DOES NOT DO — H1 IS CATALOG STRUCTURE ONLY
 *
 * No question, no gate, no material, no price, no `locationScope`/access-slot
 * requirement, no credential requirement, no permit/photo metadata. Those are
 * ADR-014 contractor-economics and Guided-Pricing-primitive concerns that
 * need the question-tree layer this slice deliberately does not build —
 * assigning any of them now would be guessing at tree mechanics nobody has
 * designed yet, not encoding something already approved. What IS approved
 * and IS encoded: identity (key, name, category), commercial disposition,
 * trade identity, WWT-only posture, and search vocabulary the review already
 * names.
 *
 * `disposition` IS NOT `BookingType`. The catalog review's own four-way
 * vocabulary (FIXED / CONDITIONAL_FIXED / REMOTE_QUOTE / APPOINTMENT_ONLY)
 * describes a COMMERCIAL OUTCOME the review approved; Prisma's `BookingType`
 * (INSTANT / ADJUSTED / REMOTE_QUOTE / TROUBLESHOOT_ONLY) describes how the
 * PLATFORM'S question-tree engine resolves a service, which depends on tree
 * mechanics that do not exist for 21 of these 22 services yet. Collapsing the
 * two now would be assigning FIXED → INSTANT or CONDITIONAL_FIXED → ADJUSTED
 * by inference rather than by design — exactly the kind of invented Guided
 * Pricing decision H1 is scoped to avoid. The one exception is
 * `hvac-service-call`, whose `bookingType: "TROUBLESHOOT_ONLY"` is not
 * inferred — it is the literal, already-designed G2/G3 mechanism this
 * service exists to use, the same value plumbing-service-call declares.
 *
 * TRADE-AUTHORED, PLATFORM-SHAPED — mirrors lib/plumbing/catalog.ts's
 * organization where that organization is generic (categories, a service
 * table, lookup helpers). Deliberately does NOT mirror `families`, `gates`,
 * `requires`, `metadata` or `requiresTechCount` — those encode Plumbing's own
 * business rules (fixture access, requirement kinds, permit/photo posture),
 * and copying their SHAPE here would invent HVAC equivalents nobody has
 * designed, which is exactly what "without copying Plumbing-specific
 * business rules" forbids.
 */

export type HvacCategoryKey =
  | "thermostats"
  | "heating-cooling-systems"
  | "ductless-mini-splits"
  | "indoor-air-quality"
  | "ducts-vents"
  | "maintenance-tune-ups"
  | "service-visit";

export type HvacCategory = {
  key: HvacCategoryKey;
  /** Platform default; ADR-006 lets a contractor rename it for display. */
  name: string;
};

/**
 * The seven approved V1 categories, Part 5's own order.
 *
 * No `defaultNavGroup` — that is Plumbing's own presentation grouping
 * (11 categories folded into 5 nav groups), never proposed or approved for
 * HVAC anywhere in the review. Adding one here would be inventing a Plumbing
 * business rule HVAC was never asked to have.
 */
export const HVAC_CATEGORIES: readonly HvacCategory[] = [
  { key: "thermostats", name: "Thermostats" },
  { key: "heating-cooling-systems", name: "Heating & Cooling Systems" },
  { key: "ductless-mini-splits", name: "Ductless & Mini-Splits" },
  { key: "indoor-air-quality", name: "Indoor Air Quality" },
  { key: "ducts-vents", name: "Ducts & Vents" },
  { key: "maintenance-tune-ups", name: "Maintenance & Tune-Ups" },
  { key: "service-visit", name: "Service Visit" },
] as const;

export const HVAC_CATEGORY_KEYS: readonly HvacCategoryKey[] = HVAC_CATEGORIES.map((c) => c.key);

/**
 * The catalog review's own commercial-outcome vocabulary — not BookingType.
 * See the file header for why the two are kept apart in H1.
 */
export type HvacDisposition = "FIXED" | "CONDITIONAL_FIXED" | "REMOTE_QUOTE" | "APPOINTMENT_ONLY";

export type HvacService = {
  /** Stable identity across template versions. Never renamed once seeded. */
  key: string;
  name: string;
  category: HvacCategoryKey;
  disposition: HvacDisposition;
  /**
   * Required trade identity — every HVAC service, no exceptions. A literal
   * per entry, not merely a module-level fact, so a future backfill/publish
   * script (G2's own precedent) can read it directly off each row rather
   * than assuming every row in this file shares one value.
   */
  tradeKey: "hvac";
  /**
   * Search vocabulary already approved in the review's "Aliases / overlapping
   * intents" column (Part 3), carried forward under Part 7's renames. Absent
   * (not merely empty) where the review's own aliases are flagged with a
   * caution the platform cannot honor yet — see lib/hvac/intents.ts, which is
   * where these are actually consumed, and its header for the two omissions.
   */
  aliases?: readonly string[];
  /**
   * True only for the three services Part 4/5/7 name as While-We're-There
   * only — real work, never a reason to send a van by itself.
   */
  whileWeThereOnly?: boolean;
  /**
   * False only for `vent-cover-replacement` — Part 7: "Canonical but not a
   * default V1 slot; contractors who sell the work enable it later." Every
   * other shipping service defaults true. This is a canonical FACT from the
   * review, not a provisioning action — H1 provisions nothing.
   */
  defaultOffered?: boolean;
  /**
   * Set ONLY on the one service-call shell — the literal G2/G3 mechanism,
   * not a disposition→bookingType inference. See the file header.
   */
  bookingType?: "TROUBLESHOOT_ONLY";
};

/**
 * The 22 V1 shipping services — Part 5's membership, Part 7's names and
 * dispositions, Part 3's keys and aliases.
 *
 * NOT HERE: the 7 canonical-but-deferred services (zoning-installation,
 * oil-furnace-replacement, boiler-replacement, condenser-relocation,
 * whole-house-dehumidifier-installation, energy-recovery-ventilator-
 * installation, boiler-tune-up) and none of the 26 rejected/merged
 * candidates from the original 55. scripts/verify-hvac-template.ts asserts
 * both absences by name.
 */
export const HVAC_SERVICES: readonly HvacService[] = [
  // ── 1 · Thermostats ──────────────────────────────────────────────────────
  {
    key: "thermostat-installation",
    name: "Install or Replace a Thermostat", // Part 7 rename
    category: "thermostats",
    disposition: "CONDITIONAL_FIXED",
    tradeKey: "hvac",
    aliases: ["replace thermostat", "install nest", "smart thermostat", "ecobee", "honeywell", "wifi thermostat", "new thermostat"],
  },

  // ── 2 · Heating & Cooling Systems ────────────────────────────────────────
  {
    key: "furnace-replacement",
    name: "Furnace Replacement",
    category: "heating-cooling-systems",
    disposition: "REMOTE_QUOTE",
    tradeKey: "hvac",
    aliases: ["new furnace", "replace my furnace", "gas furnace", "electric furnace", "high efficiency furnace"],
  },
  {
    key: "ac-replacement",
    name: "Central Air Conditioner Replacement", // Part 7 rename
    category: "heating-cooling-systems",
    disposition: "REMOTE_QUOTE",
    tradeKey: "hvac",
    aliases: ["new ac", "replace air conditioner", "new condenser", "outside unit", "new ac unit"],
  },
  {
    key: "heat-pump-replacement",
    name: "Heat Pump Replacement",
    category: "heating-cooling-systems",
    disposition: "REMOTE_QUOTE",
    tradeKey: "hvac",
    aliases: ["new heat pump", "replace heat pump", "heat pump unit"],
  },
  {
    key: "whole-system-replacement",
    name: "Replace My Heating and Cooling System",
    category: "heating-cooling-systems",
    disposition: "REMOTE_QUOTE",
    tradeKey: "hvac",
    aliases: ["new system", "full system", "furnace and ac together", "complete system", "matched system", "dual fuel"],
  },
  {
    key: "condensate-pump-installation",
    name: "Condensate Pump",
    category: "heating-cooling-systems",
    disposition: "CONDITIONAL_FIXED",
    tradeKey: "hvac",
    aliases: ["condensate pump", "ac pump", "furnace pump", "little pump by the furnace"],
  },
  {
    key: "condensate-safety-switch-installation",
    name: "Condensate Overflow Safety Switch", // Part 7 rename
    category: "heating-cooling-systems",
    disposition: "FIXED",
    tradeKey: "hvac",
    aliases: ["float switch", "overflow switch", "prevent ac leak damage"],
    whileWeThereOnly: true,
  },
  {
    key: "condenser-pad-replacement",
    name: "Outdoor Unit Pad Replacement",
    category: "heating-cooling-systems",
    // Part 7: "FIXED → CONDITIONAL_FIXED" — a real change from Part 5's own
    // "approved" table. See the H1 return report's discrepancy note.
    disposition: "CONDITIONAL_FIXED",
    tradeKey: "hvac",
    aliases: ["ac pad", "unit is sinking", "unit is tilting"],
    whileWeThereOnly: true,
  },

  // ── 3 · Ductless & Mini-Splits ───────────────────────────────────────────
  {
    key: "mini-split-installation",
    name: "Mini-Split Installation",
    category: "ductless-mini-splits",
    disposition: "REMOTE_QUOTE",
    tradeKey: "hvac",
    aliases: ["mini split", "ductless", "split system", "sunroom ac", "garage ac", "one head", "multi head"],
  },
  {
    key: "mini-split-head-cleaning",
    name: "Mini-Split Deep Cleaning",
    category: "ductless-mini-splits",
    // Part 7: "FIXED → CONDITIONAL_FIXED" — a real change from Part 5.
    disposition: "CONDITIONAL_FIXED",
    tradeKey: "hvac",
    // "mold smell from mini split" deliberately excluded — Part 3 flags it
    // "⚠️ odor is a symptom — screen first". A symptom phrase belongs to the
    // emergency/symptom layer (HVAC_EMERGENCY_PATTERNS, or a future
    // symptom-screen), never to a repair service's own alias list — that is
    // exactly the "symptom resolves directly to a component" shape this
    // slice's verifier refuses.
    aliases: ["mini split cleaning", "head cleaning"],
  },

  // ── 4 · Indoor Air Quality ───────────────────────────────────────────────
  {
    key: "whole-house-humidifier",
    name: "Whole-House Humidifier",
    category: "indoor-air-quality",
    disposition: "CONDITIONAL_FIXED",
    tradeKey: "hvac",
    aliases: ["humidifier", "aprilaire", "dry air", "static shocks", "humidifier replacement"],
  },
  {
    key: "air-cleaner-cabinet-installation",
    name: "Whole-Home Filter Cabinet", // Part 7 rename
    category: "indoor-air-quality",
    disposition: "CONDITIONAL_FIXED",
    tradeKey: "hvac",
    aliases: ["media cabinet", "media air cleaner", "4 inch filter", "5 inch filter", "whole house filter", "better filtration"],
  },
  {
    key: "duct-air-treatment-installation",
    name: "UV Light / In-Duct Air Treatment", // Part 7 rename
    category: "indoor-air-quality",
    disposition: "CONDITIONAL_FIXED",
    tradeKey: "hvac",
    aliases: ["uv light", "uv lamp", "air purifier", "air scrubber", "ionizer", "kill mold in ducts"],
  },
  {
    key: "accessory-consumable-replacement",
    name: "Humidifier Pad, Media Filter or UV Bulb Replacement", // Part 7 rename
    category: "indoor-air-quality",
    disposition: "FIXED",
    tradeKey: "hvac",
    aliases: ["humidifier pad", "water panel", "uv bulb", "media filter", "replace the media"],
  },
  {
    key: "air-filter-replacement",
    name: "Standard Air Filter Replacement", // Part 7 rename
    category: "indoor-air-quality",
    disposition: "FIXED",
    tradeKey: "hvac",
    aliases: ["change my filter", "furnace filter", "16x25 filter"],
    whileWeThereOnly: true,
  },

  // ── 5 · Ducts & Vents ────────────────────────────────────────────────────
  {
    key: "vent-cover-replacement",
    name: "Replace Vent Covers and Grilles",
    category: "ducts-vents",
    disposition: "FIXED",
    tradeKey: "hvac",
    aliases: ["registers", "grilles", "vent covers", "rusty vents"],
    // Part 7: "Canonical but not a default V1 slot; contractors who sell the
    // work enable it later." Still one of the 22 — this is NOT one of the 7
    // deferred-from-V1 canonical services, which do not appear in this file
    // at all. See scripts/verify-hvac-template.ts for the distinction proven.
    defaultOffered: false,
  },
  {
    key: "duct-assessment",
    name: "Ductwork Inspection & Assessment", // Part 7 rename
    category: "ducts-vents",
    disposition: "APPOINTMENT_ONLY",
    tradeKey: "hvac",
    // No aliases. Part 3 flags every candidate alias for this service
    // ("duct sealing", "add a return", "duct modification", "leaky ducts",
    // "rooms don't get air") "⚠️ airflow is a symptom — screen first" — none
    // are safe to encode as a plain keyword match yet. See the H1 return
    // report.
  },

  // ── 6 · Maintenance & Tune-Ups ───────────────────────────────────────────
  {
    key: "ac-tune-up",
    name: "Air Conditioner Tune-Up",
    category: "maintenance-tune-ups",
    disposition: "FIXED",
    tradeKey: "hvac",
    aliases: ["ac tune up", "ac service", "summer checkup", "spring maintenance", "clean my ac", "clear the drain line"],
  },
  {
    key: "furnace-tune-up",
    name: "Furnace Tune-Up",
    category: "maintenance-tune-ups",
    disposition: "FIXED",
    tradeKey: "hvac",
    aliases: ["furnace tune up", "heating service", "fall checkup", "winter maintenance"],
  },
  {
    key: "heat-pump-tune-up",
    name: "Heat Pump Tune-Up",
    category: "maintenance-tune-ups",
    disposition: "FIXED",
    tradeKey: "hvac",
    aliases: ["heat pump service", "heat pump maintenance"],
  },
  {
    key: "mini-split-tune-up",
    name: "Mini-Split Tune-Up",
    category: "maintenance-tune-ups",
    disposition: "FIXED",
    tradeKey: "hvac",
    aliases: ["mini split service", "ductless maintenance"],
  },

  // ── 7 · Service Visit ────────────────────────────────────────────────────
  {
    key: "hvac-service-call",
    name: "HVAC Service Visit",
    category: "service-visit",
    disposition: "APPOINTMENT_ONLY",
    tradeKey: "hvac",
    // The thirteen (the review's own count; the list it gives has fourteen
    // phrases — see the H1 return report) symptom reports. Context ONLY: see
    // lib/hvac/intents.ts and scripts/verify-hvac-template.ts, which both
    // assert none of these words appear in any OTHER service's aliases.
    aliases: [
      "not cooling", "no heat", "won't turn on", "won't start", "weak airflow",
      "leaking water", "strange noise", "short cycling",
      "thermostat not responding", "frozen", "smells", "too humid",
      "uncomfortable", "intermittent",
    ],
    // The literal G2/G3 mechanism — see lib/hvac/appointments.ts and the file
    // header. Not inferred from `disposition: "APPOINTMENT_ONLY"`.
    bookingType: "TROUBLESHOOT_ONLY",
  },
] as const;

export const HVAC_SERVICE_KEYS: readonly string[] = HVAC_SERVICES.map((s) => s.key);

export function serviceInCategory(category: HvacCategoryKey): readonly HvacService[] {
  return HVAC_SERVICES.filter((s) => s.category === category);
}

export function service(key: string): HvacService {
  const found = HVAC_SERVICES.find((s) => s.key === key);
  if (!found) throw new Error(`Unknown HVAC service "${key}".`);
  return found;
}

/** The one service-call shell — see lib/hvac/appointments.ts. */
export function hvacServiceCall(): HvacService {
  return service("hvac-service-call");
}

/**
 * Canonical but deferred from V1 — named so a verifier can assert they never
 * resurrect as catalog entries, without this file needing to import or model
 * them. Not encoded as HvacService rows: H1 ships 22, not 29.
 *
 * docs/design/hvac-v0-catalog-review.md Part 3.
 */
export const HVAC_DEFERRED_CANONICAL_KEYS: readonly string[] = [
  "zoning-installation",
  "oil-furnace-replacement",
  "boiler-replacement",
  "condenser-relocation",
  "whole-house-dehumidifier-installation",
  "energy-recovery-ventilator-installation",
  "boiler-tune-up",
] as const;

/**
 * REAL candidate keys from the 55, verbatim from Part 1 — never invented or
 * paraphrased, because a plausible-sounding but fictional key would prove
 * nothing about resurrection and would itself be a fabricated canonical
 * fact. Chosen for REMOVE verdicts naming a component or a symptom target
 * (§22/audit 3's exact risk), plus one MERGE→ survivor pair, so the verifier
 * can assert both "never resurrected as a service" and "the merge target,
 * not the merged-away name, is what's canonical."
 *
 * Not exhaustive by design: the verifier's real protection is structural
 * (HVAC_SERVICE_KEYS.length === 22, no component-named entry among them),
 * not this list — see docs/design/hvac-v0-catalog-review.md Part 1 for the
 * full 55.
 */
export const HVAC_REJECTED_OR_MERGED_SAMPLE: readonly string[] = [
  "condensate-drain-clearing", // REMOVE, folded into ac-tune-up's scope — Part 1 §42
  "zone-damper-replacement", // REMOVE, component-named — Part 1 §6
  "evaporator-coil-replacement", // REMOVE, component-named — Part 1 §14
  "lineset-replacement", // REMOVE, a trade judgment decision 5 forbids inferring — Part 1 §17
  "electronic-air-cleaner-installation", // REMOVE — Part 1 §28
  "filter-rack-conversion", // REMOVE, technician language — Part 1 §39
  "secondary-drain-pan-installation", // REMOVE, never homeowner-selected — Part 1 §44
  "multi-system-seasonal-maintenance", // REMOVE, a quantity is not a service — Part 1 §54
  "media-cabinet-installation", // MERGE→ air-cleaner-cabinet-installation — Part 1 §29
] as const;
