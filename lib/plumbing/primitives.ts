/**
 * The Guided Pricing primitives the plumbing template binds to.
 *
 * PLUMBING DOES NOT INVENT A PRICING ENGINE. Every mechanism below already
 * exists on the platform and was built for Electrical Template V1; this file
 * is the plumbing-side DECLARATION of which ones plumbing uses and what each
 * one means in this trade. Sixty-three services share seven primitives — the
 * alternative, a bespoke rule per service, is the thing this file exists to
 * make impossible to write by accident.
 *
 * The architecture the declarations preserve, unchanged:
 *
 *   Visual Assist / manual answer
 *     -> validated canonical Guided Pricing input   (visualAssist.ts)
 *     -> plumbing scope logic                       (families.ts, gates.ts)
 *     -> deterministic Price2Book pricing engine    (lib/pricing.ts)
 *
 * `platformBinding` names the real schema or module surface each primitive
 * resolves to. It is not decoration: scripts/verify-plumbing-template.ts reads
 * it, and a primitive that claims a binding the platform does not have is a
 * failure rather than a comment nobody re-read.
 *
 * WHAT IS NOT HERE
 *
 * No price, no labor hour, no material cost, no allowance, no boundary value.
 * Those are contractor economics and contractor configuration, and the whole
 * separation (ADR-014, docs/decisions/TEMPLATE-CLASSIFICATION-RULES.md) exists
 * to keep them out of a canonical template. A number in this directory is a
 * bug unless it is a count, an order, or a version.
 */

/** Where a primitive lands in the existing platform. */
export type PlatformBinding =
  | "AnswerOption.accessClassification"
  | "TemplatePolicyDefinition:HEIGHT_BREAKPOINTS|DISTANCE_BREAKPOINTS"
  | "TemplatePolicyDefinition:SUPPLY_ARRANGEMENT"
  | "TemplateAnswerOptionComponent -> ContractorComponent.approvedPriceCents"
  | "TemplateServiceMaterial -> CanonicalMaterial role cost"
  | "TemplateAnswerOptionPhotoGroup + AnswerOption.photosBlockBooking"
  | "ConditionalDisclaimer / QuestionDisclaimer";

export type PlumbingPrimitiveKey =
  | "access_classification"
  | "band_policy"
  | "supply_arrangement"
  | "component_increment"
  | "material_role"
  | "photo_gate"
  | "conditional_disclaimer";

export type PlumbingPrimitive = {
  key: PlumbingPrimitiveKey;
  /** What it means in THIS trade, in one sentence. */
  meaning: string;
  platformBinding: PlatformBinding;
  /**
   * What happens when the primitive is unresolved for a contractor.
   *
   * Every value is a refusal. There is no primitive whose unresolved state
   * produces a number, because "unresolved" and "zero" are different facts and
   * only one of them is a decision somebody made.
   */
  failsClosedAs: "REVIEW" | "BLOCK_PUBLICATION";
};

/**
 * Seven, and seven is the whole set.
 *
 * A plumbing service that needs an eighth mechanism is telling us the platform
 * is missing something — that is a platform change with its own review, not a
 * local exception authored inside the plumbing catalog.
 */
export const PLUMBING_PRIMITIVES: readonly PlumbingPrimitive[] = [
  {
    key: "access_classification",
    meaning:
      "Whether there is an open route to the pipe, drain or connection — an unfinished basement or accessible ceiling, versus finished surfaces that have to be opened. The same three-term vocabulary electrical uses, because the pricing engine already reasons in it and teaching it a fourth term per trade is how the synonym bug came back.",
    platformBinding: "AnswerOption.accessClassification",
    failsClosedAs: "REVIEW",
  },
  {
    key: "band_policy",
    meaning:
      "A distance or height boundary the CONTRACTOR chose — how much pipe run is included as standard, how far a gas line extension goes before it is an extended run. The template holds the question and the band shape; the numbers never ship.",
    platformBinding: "TemplatePolicyDefinition:HEIGHT_BREAKPOINTS|DISTANCE_BREAKPOINTS",
    failsClosedAs: "BLOCK_PUBLICATION",
  },
  {
    key: "supply_arrangement",
    meaning:
      "Who provides the fixture or appliance — the plumber or the homeowner. Decisive in plumbing far more often than in electrical: a faucet, a toilet and a water heater are all things a homeowner may already have bought, and a service that silently assumes one answer misprices the other.",
    platformBinding: "TemplatePolicyDefinition:SUPPLY_ARRANGEMENT",
    failsClosedAs: "BLOCK_PUBLICATION",
  },
  {
    key: "component_increment",
    meaning:
      "A named, reusable unit of extra work an answer attaches — an added shutoff valve, a transition fitting, a second fixture on the same visit. Identity is canonical and shared; the approved customer-facing increment is the contractor's.",
    platformBinding: "TemplateAnswerOptionComponent -> ContractorComponent.approvedPriceCents",
    failsClosedAs: "REVIEW",
  },
  {
    key: "material_role",
    meaning:
      "What the job physically consumes, named by ROLE rather than by part number — 'water heater flex connector', not a specific manufacturer's item. The contractor's own cost for that role is what prices it.",
    platformBinding: "TemplateServiceMaterial -> CanonicalMaterial role cost",
    failsClosedAs: "REVIEW",
  },
  {
    key: "photo_gate",
    meaning:
      "Photos that either prepare the technician or gate the price. Plumbing leans on this harder than electrical because the deciding facts — vent type, pipe material, valve condition — are visible and are exactly what Visual Assist reads.",
    platformBinding: "TemplateAnswerOptionPhotoGroup + AnswerOption.photosBlockBooking",
    failsClosedAs: "REVIEW",
  },
  {
    key: "conditional_disclaimer",
    meaning:
      "A sentence that is true only on some routes — an access opening is a fact of fishing a line through a finished wall and nonsense in an open basement. Attached to the answer, evaluated against the access class established so far.",
    platformBinding: "ConditionalDisclaimer / QuestionDisclaimer",
    failsClosedAs: "REVIEW",
  },
] as const;

export const PLUMBING_PRIMITIVE_KEYS: readonly PlumbingPrimitiveKey[] =
  PLUMBING_PRIMITIVES.map((p) => p.key);

export function primitive(key: PlumbingPrimitiveKey): PlumbingPrimitive {
  const found = PLUMBING_PRIMITIVES.find((p) => p.key === key);
  // Unreachable through the type, reachable through a JSON round-trip. A
  // missing primitive must not degrade to undefined and price something.
  if (!found) throw new Error(`Unknown plumbing primitive "${key}".`);
  return found;
}
