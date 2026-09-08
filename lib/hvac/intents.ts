/**
 * HVAC's own contribution to the shared emergency screen — G5.
 *
 * NARROWLY SCOPED ON PURPOSE. Gas odor, a sounding CO alarm, and smoke or
 * burning are already caught by Plumbing's and Electrical's existing
 * vocabulary once unioned (lib/serviceMatch.ts) — none of that is
 * re-declared here, because HVAC saying the same thing twice is exactly the
 * kind of second copy this architecture exists to avoid.
 *
 * The one thing nothing else catches: an explosion or boom AT IGNITION OR
 * STARTUP. A gas furnace that has failed to light on a prior attempt and
 * accumulated unburned gas can ignite that accumulation all at once when it
 * finally lights — a homeowner-observable bang or thump specifically tied to
 * the furnace or heat turning on or starting up. That is not the same report
 * as an ordinary operating noise.
 *
 * WHAT THIS IS DELIBERATELY NOT
 *
 * "Bang", "pop", "strange noise", "furnace won't start", "no heat" and "AC
 * not cooling" are NOT emergency patterns, and none of them appear here
 * un-narrowed. Furnaces and ducts click, pop and tick constantly as metal
 * heats and cools — that is normal operation, not a hazard, and screening it
 * out would refuse an ordinary $200 tune-up into a phone call. "No heat" and
 * "AC not cooling" are ordinary service urgency, not observable danger; they
 * already have the correct destination — an appointment — and screening them
 * here would misfile routine bookings as safety refusals.
 *
 * So every pattern below requires the EXPLOSION/IGNITION language and a
 * furnace/heating-startup anchor together. Neither word alone is enough.
 */

export const HVAC_EMERGENCY_PATTERNS: readonly { pattern: RegExp; why: string }[] = [
  // Both word orders — "furnace exploded" and "explosion when the furnace
  // started" are the same report, and only anchoring one order would miss
  // the other, the same lesson the electrical screen learned with "hot
  // outlet" / "outlet is hot".
  {
    pattern:
      /\b(furnace|heater|heat(ing)?\s*system|boiler)\b[^.]{0,25}\b(explo(d(ed|ing)?|sion)|boom(ed|ing)?)\b/i,
    why: "an explosion or boom from the heating system",
  },
  {
    pattern:
      /\b(explo(d(ed|ing)?|sion)|boom(ed|ing)?)\b[^.]{0,25}\b(furnace|heater|heat(ing)?\s*system|boiler|start(ed|ing|s)?\s*up|ignit(e|ed|ing|ion))\b/i,
    why: "an explosion or boom from the heating system",
  },
];

/**
 * HVAC's catalog search vocabulary — H1.
 *
 * Same role as PLUMBING_INTENTS in lib/plumbing/intents.ts, which is exactly
 * why it lives here rather than in a new file: this file is already
 * "HVAC's storefront intents", and Plumbing's own equivalent carries both
 * its emergency screen and its catalog vocabulary in one place. This section
 * is additive — HVAC_EMERGENCY_PATTERNS above is unchanged.
 *
 * Every phrase here is taken verbatim from
 * docs/design/hvac-v0-catalog-review.md Part 3's "Aliases / overlapping
 * intents" column, for the 22 services that ship. Two omissions, both
 * deliberate and both named where lib/hvac/catalog.ts declares the service:
 *
 *   mini-split-head-cleaning  — "mold smell from mini split" dropped; Part 3
 *                               itself flags it "odor is a symptom — screen
 *                               first".
 *   duct-assessment           — every candidate alias Part 3 offers is
 *                               flagged "airflow is a symptom — screen
 *                               first"; none are included.
 *
 * `hvac-service-call`'s phrases are the thirteen (Part 3's count; the actual
 * list it gives has fourteen — see the H1 return report) symptom reports.
 * They are exactly the phrases this file's job is normally to resolve AWAY
 * from a symptom — here they are the destination, which is correct: routing
 * a symptom to the one service call is the invariant, not a violation of it.
 */
export type HvacIntent = {
  serviceKey: string;
  phrases: readonly string[];
};

export const HVAC_INTENTS: readonly HvacIntent[] = [
  { serviceKey: "thermostat-installation", phrases: ["replace thermostat", "install nest", "smart thermostat", "ecobee", "honeywell", "wifi thermostat", "new thermostat"] },
  { serviceKey: "furnace-replacement", phrases: ["new furnace", "replace my furnace", "gas furnace", "electric furnace", "high efficiency furnace"] },
  { serviceKey: "ac-replacement", phrases: ["new ac", "replace air conditioner", "new condenser", "outside unit", "new ac unit"] },
  { serviceKey: "heat-pump-replacement", phrases: ["new heat pump", "replace heat pump", "heat pump unit"] },
  { serviceKey: "whole-system-replacement", phrases: ["new system", "full system", "furnace and ac together", "complete system", "matched system", "dual fuel"] },
  { serviceKey: "condensate-pump-installation", phrases: ["condensate pump", "ac pump", "furnace pump", "little pump by the furnace"] },
  { serviceKey: "condensate-safety-switch-installation", phrases: ["float switch", "overflow switch", "prevent ac leak damage"] },
  { serviceKey: "condenser-pad-replacement", phrases: ["ac pad", "unit is sinking", "unit is tilting"] },
  { serviceKey: "mini-split-installation", phrases: ["mini split", "ductless", "split system", "sunroom ac", "garage ac", "one head", "multi head"] },
  { serviceKey: "mini-split-head-cleaning", phrases: ["mini split cleaning", "head cleaning"] },
  { serviceKey: "whole-house-humidifier", phrases: ["humidifier", "aprilaire", "dry air", "static shocks", "humidifier replacement"] },
  { serviceKey: "air-cleaner-cabinet-installation", phrases: ["media cabinet", "media air cleaner", "4 inch filter", "5 inch filter", "whole house filter", "better filtration"] },
  { serviceKey: "duct-air-treatment-installation", phrases: ["uv light", "uv lamp", "air purifier", "air scrubber", "ionizer", "kill mold in ducts"] },
  { serviceKey: "accessory-consumable-replacement", phrases: ["humidifier pad", "water panel", "uv bulb", "media filter", "replace the media"] },
  { serviceKey: "air-filter-replacement", phrases: ["change my filter", "furnace filter", "16x25 filter"] },
  { serviceKey: "vent-cover-replacement", phrases: ["registers", "grilles", "vent covers", "rusty vents"] },
  // duct-assessment: deliberately no phrases — see the header above.
  { serviceKey: "ac-tune-up", phrases: ["ac tune up", "ac service", "summer checkup", "spring maintenance", "clean my ac", "clear the drain line"] },
  { serviceKey: "furnace-tune-up", phrases: ["furnace tune up", "heating service", "fall checkup", "winter maintenance"] },
  { serviceKey: "heat-pump-tune-up", phrases: ["heat pump service", "heat pump maintenance"] },
  { serviceKey: "mini-split-tune-up", phrases: ["mini split service", "ductless maintenance"] },
  {
    serviceKey: "hvac-service-call",
    phrases: [
      "not cooling", "no heat", "won't turn on", "won't start", "weak airflow",
      "leaking water", "strange noise", "short cycling",
      "thermostat not responding", "frozen", "smells", "too humid",
      "uncomfortable", "intermittent",
    ],
  },
] as const;

/** Every phrase, flattened — mirrors lib/plumbing/intents.ts's helper. */
export function allHvacIntentPhrases(): { phrase: string; serviceKey: string }[] {
  return HVAC_INTENTS.flatMap((i) => i.phrases.map((phrase) => ({ phrase, serviceKey: i.serviceKey })));
}
