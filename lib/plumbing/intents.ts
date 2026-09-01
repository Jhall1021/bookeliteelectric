/**
 * Storefront intents — what people actually type, and where it should go.
 *
 * Nobody searches for "Temperature & Pressure Relief Valve Replacement". They
 * type "water coming out of a pipe on my water heater". lib/serviceMatch.ts
 * already handles the general case, and this file supplies the two things it
 * cannot derive from a plumbing catalog it has never seen: the trade's own
 * vocabulary, and the trade's own emergencies.
 *
 * THE EMERGENCY SCREEN IS THE POINT OF THIS FILE
 *
 * lib/serviceMatch.ts's EMERGENCY_PATTERNS are electrical: burning, sparking,
 * shock, a hot outlet. Not one of them fires on "sewage backing up into my
 * bathtub" or "I smell gas", and a plumbing storefront running the electrical
 * screen would take an online booking, three days out, for a gas leak.
 *
 * Deliberately over-inclusive, on the same reasoning the electrical screen
 * gives: a false positive costs one phone call that might have been a booking;
 * a false negative is somebody scheduling next Tuesday for water pouring
 * through a ceiling. Those are not comparable.
 *
 * NOT WIRED IN YET. lib/serviceMatch.ts is a heavily shared file and is not
 * modified by this slice — see docs/design/plumbing-shared-integrations.md for
 * the exact change required. Until that lands, this screen is exercised by the
 * verifier and by nothing else, and a plumbing storefront would run the
 * electrical screen. That is a gap, and it is recorded rather than papered
 * over by a local copy of the matcher.
 */

/** Phrases that mean "stop, phone us". Same contract as the electrical screen. */
export const PLUMBING_EMERGENCY_PATTERNS: readonly { pattern: RegExp; why: string }[] = [
  // Fuel gas. First, and the broadest, because it is the only one on this list
  // where the wrong answer is not a damaged house.
  // "odour" and "sulphur" are INPUT alternates, not copy. People type what they
  // type, and a screen that only matched the American spelling would miss a
  // gas report from anyone who learned to write the other one.
  { pattern: /\b(smell|smells|smelling|odor|odour)\b[^.]{0,20}\b(gas|propane|sulfur|sulphur|rotten egg)\b/i, why: "a smell of gas" },
  { pattern: /\bgas\b[^.]{0,15}\b(leak|leaking|hiss|hissing)\b/i, why: "a gas leak" },
  { pattern: /\b(carbon monoxide|co detector|co alarm)\b/i, why: "a carbon monoxide alarm" },

  // Sewage. A health hazard rather than an inconvenience.
  { pattern: /\b(sewage|sewer|waste|raw waste)\b[^.]{0,25}\b(back(ing|ed)?\s*up|backup|overflow(ing)?|coming up)\b/i, why: "sewage backing up" },
  { pattern: /\b(toilet|tub|shower|drain)s?\b[^.]{0,25}\b(sewage|raw waste)\b/i, why: "sewage at a fixture" },

  // Uncontrolled water. Both orders, because people say it both ways and the
  // electrical screen learned that lesson the expensive way with hot outlets.
  { pattern: /\b(burst|ruptured|split)\b[^.]{0,15}\b(pipe|line|main)\b/i, why: "a burst pipe" },
  { pattern: /\b(pipe|line|main)\b[^.]{0,15}\b(burst|ruptured|split)\b/i, why: "a burst pipe" },
  { pattern: /\b(flood(ing|ed)?|gushing|pouring|spraying)\b[^.]{0,25}\b(water|basement|ceiling|wall)\b/i, why: "water flooding" },
  { pattern: /\b(water)\b[^.]{0,25}\b(pouring|gushing|coming through)\b[^.]{0,15}\b(ceiling|wall|light)\b/i, why: "water coming through a ceiling" },
  { pattern: /\bcan'?t\s+(shut|turn)\s+(the\s+)?water\s+off\b/i, why: "the water cannot be shut off" },
  { pattern: /\bno\s+(water|running water)\b[^.]{0,20}\b(whole|entire|any)\b/i, why: "no water at all" },

  // Water where electricity is. Either trade's emergency, and neither screen
  // should be the only one that catches it.
  { pattern: /\bwater\b[^.]{0,30}\b(panel|breaker|outlet|electrical)\b/i, why: "water near electrical equipment" },

  // Scalding and pressure. A relief valve discharging is the heater telling
  // somebody it is over pressure.
  { pattern: /\b(relief valve|t&p|tpr)\b[^.]{0,20}\b(discharg|releas|blow|spray|leak)/i, why: "a relief valve discharging" },
  { pattern: /\bwater\b[^.]{0,15}\b(scalding|far too hot|dangerously hot)\b/i, why: "scalding water" },
];

export const PLUMBING_EMERGENCY_MESSAGE =
  "What you're describing isn't something to book online for later. Please call us now and we'll talk it through. If you can reach the main water shutoff safely, turning it off will limit the damage while we're on the way. If you smell gas, leave the building first and call your gas utility from outside, then call us.";

/** Runs before anything else. No network, no model, no dependencies. */
export function screenPlumbingEmergency(text: string): { isEmergency: boolean; matched: string[] } {
  const matched = PLUMBING_EMERGENCY_PATTERNS.filter((p) => p.pattern.test(text)).map((p) => p.why);
  return { isEmergency: matched.length > 0, matched: [...new Set(matched)] };
}

/**
 * Trade vocabulary for the keyword fallback.
 *
 * lib/serviceMatch.ts's keywordFallback scores a query against the words in a
 * service NAME. That works when the customer uses the name and fails silently
 * when they use the trade's real vocabulary — "sillcock", "closet flange",
 * "hose bib" and "spigot" are four words for two things, and the service names
 * contain two of them.
 *
 * `phrases` are therefore synonyms and symptoms, not a second name. They are
 * evidence for the matcher, and they never appear in front of a customer.
 */
export type PlumbingIntent = {
  serviceKey: string;
  phrases: readonly string[];
};

export const PLUMBING_INTENTS: readonly PlumbingIntent[] = [
  { serviceKey: "tank-water-heater-replacement-gas", phrases: ["no hot water", "water heater leaking", "hot water heater", "boiler for hot water", "40 gallon heater", "50 gallon heater"] },
  { serviceKey: "tank-water-heater-replacement-electric", phrases: ["electric hot water tank", "no hot water electric", "element burnt out"] },
  { serviceKey: "tankless-water-heater-replacement", phrases: ["on demand water heater", "instant hot water unit", "combi unit"] },
  { serviceKey: "tank-to-tankless-conversion", phrases: ["switch to tankless", "get rid of the tank", "go tankless"] },
  { serviceKey: "water-heater-flush", phrases: ["heater making banging noise", "sediment in hot water", "rumbling water heater", "flush the tank"] },
  { serviceKey: "water-heater-expansion-tank", phrases: ["expansion tank", "pressure building up hot water"] },
  { serviceKey: "water-heater-tpr-valve-replacement", phrases: ["relief valve dripping", "t and p valve", "pop off valve"] },
  { serviceKey: "toilet-replacement", phrases: ["new toilet", "replace the loo", "cracked toilet", "toilet is old"] },
  { serviceKey: "toilet-reset-wax-ring", phrases: ["toilet rocking", "toilet leaking at the base", "wax ring", "water around the bottom of the toilet"] },
  { serviceKey: "toilet-internals-repair", phrases: ["toilet keeps running", "toilet wont stop filling", "flapper", "fill valve", "phantom flush"] },
  { serviceKey: "toilet-flange-repair", phrases: ["closet flange", "flange broken", "toilet bolts wont tighten"] },
  { serviceKey: "kitchen-faucet-replacement", phrases: ["kitchen tap", "sink faucet dripping", "new kitchen faucet", "pull down sprayer"] },
  { serviceKey: "bathroom-faucet-replacement", phrases: ["bathroom tap", "vanity faucet", "lavatory faucet"] },
  { serviceKey: "shower-valve-cartridge-replacement", phrases: ["shower dripping", "shower wont get hot", "shower handle spins", "cartridge"] },
  { serviceKey: "shower-valve-body-replacement", phrases: ["shower valve behind the wall", "mixing valve", "shower valve leaking in the wall"] },
  { serviceKey: "shower-valve-trim-replacement", phrases: ["shower handle and plate", "shower trim kit", "escutcheon"] },
  { serviceKey: "tub-spout-diverter-replacement", phrases: ["tub spout", "water comes out the spout and the shower", "diverter"] },
  { serviceKey: "hose-bib-replacement", phrases: ["outside tap", "spigot", "sillcock", "garden tap leaking", "outdoor faucet"] },
  { serviceKey: "frost-free-sillcock-installation", phrases: ["frost free tap", "outside tap froze", "burst outside faucet"] },
  { serviceKey: "garbage-disposal-replacement", phrases: ["disposal humming", "garbage disposal jammed", "insinkerator", "waste disposal unit"] },
  { serviceKey: "garbage-disposal-new-installation", phrases: ["add a disposal", "put in a garbage disposal"] },
  { serviceKey: "kitchen-sink-replacement", phrases: ["new kitchen sink", "sink basin", "undermount sink"] },
  { serviceKey: "bathroom-sink-replacement", phrases: ["vanity basin", "bathroom sink cracked", "pedestal sink"] },
  { serviceKey: "p-trap-replacement", phrases: ["p trap", "u bend under the sink", "trap leaking under sink"] },
  { serviceKey: "sink-drain-assembly-replacement", phrases: ["basket strainer", "pop up drain", "sink drain leaking"] },
  { serviceKey: "drain-clearing-single-fixture", phrases: ["sink wont drain", "slow drain", "clogged shower drain", "blocked basin"] },
  { serviceKey: "main-line-drain-clearing", phrases: ["all the drains are slow", "main line clog", "whole house backing up", "snake the main"] },
  { serviceKey: "sewer-camera-inspection", phrases: ["camera the sewer", "scope the line", "roots in the sewer"] },
  { serviceKey: "hydro-jetting-main-line", phrases: ["jet the line", "hydro jetting", "grease in the drain"] },
  { serviceKey: "drain-line-repair-accessible", phrases: ["broken drain pipe", "waste pipe cracked", "leaking drain in the basement"] },
  { serviceKey: "sewer-line-replacement-assessment", phrases: ["sewer collapsed", "replace the sewer line", "lateral is broken"] },
  { serviceKey: "sump-pump-replacement", phrases: ["sump pump not working", "sump pump replacement", "pit pump failed"] },
  { serviceKey: "sump-pump-new-installation", phrases: ["basement takes water", "need a sump pit", "install a sump pump"] },
  { serviceKey: "sump-pump-battery-backup-installation", phrases: ["backup sump pump", "battery backup pump", "pump when the power goes out"] },
  { serviceKey: "sewage-ejector-pump-replacement", phrases: ["ejector pump", "basement bathroom pump", "grinder pump"] },
  { serviceKey: "main-water-shutoff-valve-replacement", phrases: ["main shutoff wont close", "main valve stuck", "cant turn the water off at the main"] },
  { serviceKey: "fixture-shutoff-valve-replacement", phrases: ["angle stop", "shut off valve under the sink", "stop valve seized"] },
  { serviceKey: "pressure-reducing-valve-replacement", phrases: ["water pressure too high", "prv", "pressure regulator"] },
  { serviceKey: "backflow-preventer-installation", phrases: ["backflow test", "rpz", "double check valve", "backflow device"] },
  { serviceKey: "pipe-section-repair", phrases: ["pinhole leak", "pipe leaking in the basement", "patch a pipe", "copper leaking"] },
  { serviceKey: "water-service-line-assessment", phrases: ["water line from the street", "service line leak", "lead service line"] },
  { serviceKey: "whole-home-repipe-assessment", phrases: ["repipe the house", "all the pipes are bad", "galvanized pipes throughout"] },
  { serviceKey: "water-softener-replacement", phrases: ["softener not working", "replace the softener", "hard water"] },
  { serviceKey: "water-softener-new-installation", phrases: ["install a softener", "hard water treatment", "scale everywhere"] },
  { serviceKey: "whole-home-water-filter-installation", phrases: ["whole house filter", "sediment filter", "filter the whole house"] },
  { serviceKey: "under-sink-reverse-osmosis-installation", phrases: ["reverse osmosis", "ro system", "drinking water filter"] },
  { serviceKey: "gas-shutoff-valve-replacement", phrases: ["gas valve wont turn", "appliance gas valve"] },
  { serviceKey: "gas-line-extension-appliance", phrases: ["run a gas line", "gas line for a range", "gas for the grill", "gas to the dryer"] },
  { serviceKey: "gas-appliance-reconnection", phrases: ["hook up the gas stove", "connect the gas dryer", "new range needs connecting"] },
  { serviceKey: "gas-leak-locate", phrases: ["find the gas leak", "gas company shut me off", "leak on the gas line"] },
  { serviceKey: "gas-line-pressure-test", phrases: ["pressure test the gas", "gas test for the inspector"] },
  { serviceKey: "dishwasher-water-connection", phrases: ["hook up the dishwasher", "dishwasher not draining", "air gap"] },
  { serviceKey: "refrigerator-water-line-installation", phrases: ["ice maker line", "water to the fridge", "fridge water line"] },
  { serviceKey: "washing-machine-outlet-box-replacement", phrases: ["washer box", "laundry valves leaking", "washing machine valves"] },
  { serviceKey: "water-hammer-arrestor-installation", phrases: ["pipes banging", "water hammer", "knocking in the walls"] },
  { serviceKey: "heat-pump-water-heater-replacement", phrases: ["heat pump water heater", "hybrid water heater", "heat pump hot water"] },
  // No "rotten egg" phrasing here, deliberately: the emergency screen matches
  // that against fuel gas, and it should keep doing so. A smell someone cannot
  // place is worth one phone call.
  { serviceKey: "water-heater-anode-rod-replacement", phrases: ["anode rod", "sacrificial anode", "tank rusting from inside"] },
  { serviceKey: "water-heater-element-thermostat-replacement", phrases: ["heating element", "upper element", "water heater not heating", "thermostat on the water heater"] },
  { serviceKey: "water-heater-gas-control-valve-replacement", phrases: ["pilot wont stay lit", "thermocouple", "gas valve on the water heater"] },
  { serviceKey: "bidet-seat-installation", phrases: ["bidet", "washlet", "bidet attachment"] },
  { serviceKey: "toilet-supply-line-replacement", phrases: ["toilet supply line", "braided line to the toilet"] },
  { serviceKey: "laundry-faucet-replacement", phrases: ["utility sink faucet", "laundry tub faucet", "basement sink tap"] },
  { serviceKey: "plumbing-service-call", phrases: ["not sure what is wrong", "something is leaking somewhere", "need someone to look at it"] },
];

/** Every phrase, flattened, for the matcher and the duplicate check. */
export function allIntentPhrases(): { phrase: string; serviceKey: string }[] {
  return PLUMBING_INTENTS.flatMap((i) => i.phrases.map((phrase) => ({ phrase, serviceKey: i.serviceKey })));
}
