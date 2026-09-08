/**
 * The Guided Pricing primitives the HVAC template binds to — H2.
 *
 * HVAC DOES NOT INVENT A PRICING ENGINE, same as Plumbing before it. Every
 * mechanism below already exists on the platform; this file is HVAC's own
 * DECLARATION of which of the seven it uses and what each one means in this
 * trade. Mirrors lib/plumbing/primitives.ts's shape exactly — declaration
 * only, no HVAC business logic copied, because a primitive's PLATFORM
 * BINDING is shared infrastructure and its MEANING is trade-owned.
 *
 * SEVEN, AND SEVEN IS THE WHOLE SET — locked, H2 audit.
 *
 * A service that needs an eighth mechanism is telling us the platform is
 * missing something — a platform change with its own review, never a local
 * exception authored inside the HVAC catalog. `cooling_tons` and
 * `heating_input_btu` are NOT this primitive set: they are HVAC trade-owned
 * structured facts consumed by `capacity_gate` (lib/hvac/gates.ts), a
 * trade-owned gate, not a shared primitive. `component_increment` stays
 * reserved for genuinely additive units a homeowner's answer attaches — a
 * C-wire adapter, a second thermostat, an added safety switch, an extra
 * mini-split head — never a capacity rating.
 *
 * WHAT IS NOT HERE
 *
 * No price, no labor hour, no material cost, no allowance, no boundary
 * value. ADR-014 / TEMPLATE-CLASSIFICATION-RULES.md's separation applies
 * here exactly as it does to Plumbing. A number in this file is a bug unless
 * it is a count, an order, or a version.
 */

/** Where a primitive lands in the existing platform — identical to Plumbing's. */
export type PlatformBinding =
  | "AnswerOption.accessClassification"
  | "TemplatePolicyDefinition:HEIGHT_BREAKPOINTS|DISTANCE_BREAKPOINTS"
  | "TemplatePolicyDefinition:SUPPLY_ARRANGEMENT"
  | "TemplateAnswerOptionComponent -> ContractorComponent.approvedPriceCents"
  | "TemplateServiceMaterial -> CanonicalMaterial role cost"
  | "TemplateAnswerOptionPhotoGroup + AnswerOption.photosBlockBooking"
  | "ConditionalDisclaimer / QuestionDisclaimer";

export type HvacPrimitiveKey =
  | "access_classification"
  | "band_policy"
  | "supply_arrangement"
  | "component_increment"
  | "material_role"
  | "photo_gate"
  | "conditional_disclaimer";

export type HvacPrimitive = {
  key: HvacPrimitiveKey;
  /** What it means in THIS trade, in one sentence. */
  meaning: string;
  platformBinding: PlatformBinding;
  /**
   * What happens when the primitive is unresolved for a contractor.
   *
   * Every value is a refusal, same rule as Plumbing: "unresolved" and "zero"
   * are different facts, and only one of them is a decision somebody made.
   */
  failsClosedAs: "REVIEW" | "BLOCK_PUBLICATION";
};

export const HVAC_PRIMITIVES: readonly HvacPrimitive[] = [
  {
    key: "access_classification",
    meaning:
      "Reaching the equipment — a basement furnace versus an attic air handler over a finished ceiling; a ground-level condenser versus a roof unit. The same three-term vocabulary Electrical and Plumbing use; HVAC changes the NUMBER of slots it composes (G1), never the vocabulary itself.",
    platformBinding: "AnswerOption.accessClassification",
    failsClosedAs: "REVIEW",
  },
  {
    key: "band_policy",
    meaning:
      "A distance or height boundary the CONTRACTOR chose — line-set length, a control-wire run, a condensate run, how far a replacement unit may move from where the old one stood. HVAC has more band questions than Plumbing, not different ones; the template holds the question and the band shape, the numbers never ship.",
    platformBinding: "TemplatePolicyDefinition:HEIGHT_BREAKPOINTS|DISTANCE_BREAKPOINTS",
    failsClosedAs: "BLOCK_PUBLICATION",
  },
  {
    key: "supply_arrangement",
    meaning:
      "Who provides the equipment — the contractor or the homeowner. Decisive more often than in either other trade: a homeowner-bought smart thermostat is the single commonest customer-supplied item in residential trades, and equipment, accessories and thermostats are three separate policies (Q5) because a contractor who fits a customer's thermostat may not fit a customer's condenser.",
    platformBinding: "TemplatePolicyDefinition:SUPPLY_ARRANGEMENT",
    failsClosedAs: "BLOCK_PUBLICATION",
  },
  {
    key: "component_increment",
    meaning:
      "A named, reusable unit of ADDITIVE work an answer attaches — a C-wire adapter, a second thermostat, an added condensate safety switch, an extra mini-split head. Never a capacity rating: cooling tons and heating BTU are HVAC structured facts feeding capacity_gate, not increments a homeowner's answer adds to the job.",
    platformBinding: "TemplateAnswerOptionComponent -> ContractorComponent.approvedPriceCents",
    failsClosedAs: "REVIEW",
  },
  {
    key: "material_role",
    meaning:
      "What the job physically consumes, named by ROLE rather than by part number — line_set, condensate_pump, vent_termination_kit, flue_connector, humidifier_pad, filter_media, thermostat_wire, refrigerant_line_insulation. The contractor's own cost for that role is what prices it.",
    platformBinding: "TemplateServiceMaterial -> CanonicalMaterial role cost",
    failsClosedAs: "REVIEW",
  },
  {
    key: "photo_gate",
    meaning:
      "Photos that either prepare the technician or gate the price. HVAC leans on this hardest of the three trades — nameplate, vent arrangement, thermostat sub-base wiring, filter slot, line-set path are all visible, and are exactly what Visual Assist reads.",
    platformBinding: "TemplateAnswerOptionPhotoGroup + AnswerOption.photosBlockBooking",
    failsClosedAs: "REVIEW",
  },
  {
    key: "conditional_disclaimer",
    meaning:
      "A sentence true only on some routes — an access opening is a fact of fishing a line through a finished wall and nonsense in an open basement. Attached to the answer, evaluated against the access class established so far. HVAC's first confirmed use: a new thermostat run through finished construction (thermostat-installation's absent/new-location branch).",
    platformBinding: "ConditionalDisclaimer / QuestionDisclaimer",
    failsClosedAs: "REVIEW",
  },
] as const;

export const HVAC_PRIMITIVE_KEYS: readonly HvacPrimitiveKey[] = HVAC_PRIMITIVES.map((p) => p.key);

export function primitive(key: HvacPrimitiveKey): HvacPrimitive {
  const found = HVAC_PRIMITIVES.find((p) => p.key === key);
  // Unreachable through the type, reachable through a JSON round-trip. A
  // missing primitive must not degrade to undefined and price something.
  if (!found) throw new Error(`Unknown HVAC primitive "${key}".`);
  return found;
}
