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
