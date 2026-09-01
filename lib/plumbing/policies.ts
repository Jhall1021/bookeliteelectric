/**
 * The decisions the plumbing template knows must be made, and refuses to make.
 *
 * Same rule as prisma/template/electrical.policies.json, same reason, expressed
 * in TypeScript because the plumbing template is AUTHORED rather than extracted
 * from a live catalog — there is no plumbing contractor to extract from, so
 * there is no extractor run to emit a manifest. See
 * docs/design/plumbing-shared-integrations.md.
 *
 * NO DEFAULTS ANYWHERE IN THIS FILE. Not a suggested value, not a "typical"
 * value, not a commented-out one. A default would ship one contractor's
 * allowance to every other contractor as their starting point, which is the
 * entire thing this separation exists to prevent, and a commented default is
 * just a default somebody will uncomment.
 */

export type PlumbingPolicyType =
  | "DISTANCE_BREAKPOINTS"
  | "HEIGHT_BREAKPOINTS"
  | "SUPPLY_ARRANGEMENT";

export type PlumbingPolicyDefinition = {
  /** Stable across template versions. */
  key: string;
  type: PlumbingPolicyType;
  /** "ft" for the breakpoint types; null for SUPPLY_ARRANGEMENT. */
  unit: string | null;
  /** How many numbers the contractor must supply. Three bands need two. */
  boundaryCount: number;
  /** What the contractor is asked, in their words rather than ours. */
  prompt: string;
  /** The record of why a human decided this was policy and not trade knowledge. */
  reason: string;
};

export const PLUMBING_POLICIES: readonly PlumbingPolicyDefinition[] = [
  {
    key: "plumbing_run.breakpoints",
    type: "DISTANCE_BREAKPOINTS",
    unit: "ft",
    boundaryCount: 2,
    prompt:
      "For a new water supply run to a fixture, what length do you include as standard, and above what length does it become an extended run?",
    reason:
      "Nothing physical changes at one length rather than another. This is an included-allowance decision and the boundary is where this contractor's price steps.",
  },
  {
    key: "gas_line_run.breakpoints",
    type: "DISTANCE_BREAKPOINTS",
    unit: "ft",
    boundaryCount: 2,
    prompt:
      "For a gas line extension to an appliance, what length do you include as standard, and above what length does it become an extended run?",
    reason:
      "Kept apart from the water run because gas pipe is sized by length and load together, so a contractor may reasonably include a different distance for it.",
  },
  {
    key: "drain_line_run.breakpoints",
    type: "DISTANCE_BREAKPOINTS",
    unit: "ft",
    boundaryCount: 1,
    prompt:
      "When clearing a drain, how far down the line do you go before it stops being a standard clearing?",
    reason:
      "How far a cable or jetter reaches before the job changes character is an allowance, not a property of drains. One boundary, because the step is single.",
  },
  {
    key: "water_heater_relocation.breakpoints",
    type: "DISTANCE_BREAKPOINTS",
    unit: "ft",
    boundaryCount: 1,
    prompt:
      "If a replacement heater has to move from where the old one stood, how far do you treat as a like-for-like swap?",
    reason:
      "That moving an appliance costs more is a fact of the work; how far counts as not-moving is this contractor's tolerance.",
  },
  {
    key: "fixture.supply_arrangement",
    type: "SUPPLY_ARRANGEMENT",
    unit: null,
    boundaryCount: 0,
    prompt:
      "For fixture replacements — faucets, toilets, disposals — do you supply the fixture, does the customer, or do you offer both?",
    reason:
      "A contractor who does not stock fixtures would otherwise inherit services that silently imply they do. The question is universal; the answer is theirs.",
  },
  {
    key: "water_heater.supply_arrangement",
    type: "SUPPLY_ARRANGEMENT",
    unit: null,
    boundaryCount: 0,
    prompt:
      "For water heater replacements, do you supply the heater, does the customer, or do you offer both?",
    reason:
      "Asked separately from fixtures because the answers genuinely differ: plenty of contractors will fit a customer's faucet and will not fit a customer's water heater.",
  },
  {
    key: "water_treatment.supply_arrangement",
    type: "SUPPLY_ARRANGEMENT",
    unit: null,
    boundaryCount: 0,
    prompt:
      "For softeners, filters and reverse-osmosis units, do you supply the equipment, does the customer, or do you offer both?",
    reason:
      "Water treatment equipment is bought online more often than any other category here, so the arrangement is asked rather than assumed.",
  },
] as const;

export const PLUMBING_POLICY_KEYS: readonly string[] = PLUMBING_POLICIES.map((p) => p.key);

export function policy(key: string): PlumbingPolicyDefinition {
  const found = PLUMBING_POLICIES.find((p) => p.key === key);
  if (!found) throw new Error(`Unknown plumbing policy "${key}".`);
  return found;
}
