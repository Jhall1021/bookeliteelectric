/**
 * Nine reusable question families. Sixty-three services, nine question sets.
 *
 * The handoff scoped eight. The ninth — `existing_condition` — was added when a
 * composition audit found that `condition_gate` and `capacity_gate` had nothing
 * to read: thirty-five services declared a gate whose fact no question in the
 * template could establish, so in a live flow every one of them would have
 * refused forever. Capacity joined the appliance family it belongs to; condition
 * needed a family of its own, because it is the only fact that can take a
 * customer out of the catalog entirely.
 *
 * A family is a MANIFEST, not a tree: it names the questions, the answer
 * vocabulary, which canonical fact each answer establishes, and which gate
 * consumes it. Provisioning composes families into a contractor's real
 * Question/AnswerOption rows; nothing here is a live row and nothing here is
 * per-contractor.
 *
 * WHY FAMILIES RATHER THAN PER-SERVICE TREES
 *
 * Sixty-three hand-authored trees would ask "what is the pipe made of" in
 * sixty-three slightly different ways, and the electrical catalog has already
 * demonstrated what that costs: six access questions, three answer
 * vocabularies, and a component condition that silently matched none of them.
 * A family is asked once, worded once, and means one thing.
 *
 * WHAT A FAMILY MAY NOT CONTAIN
 *
 * A price, a labor hour, a material cost, or a boundary number. Where a
 * boundary is genuinely the question — how long a run is included — the family
 * carries a `labelPattern` with the hole still in it and names the policy that
 * fills it. Shipping Elite's numbers, or anyone's, as a starting point is the
 * exact failure ADR-014 exists to prevent, and a rendered "{b1}" in front of a
 * customer is worse than a wrong number because nobody notices it until
 * somebody is mid-booking.
 */

import type { RouteAction } from "../flow-types";
import type { AccessClass, PlumbingGateKey } from "./gates";
import type { PlumbingPrimitiveKey } from "./primitives";

export type FamilyOption = {
  value: string;
  /** Customer-ready wording. Absent exactly when `labelPattern` is present. */
  label?: string;
  /** Wording with the contractor's boundaries left as holes: "{b1} feet or less". */
  labelPattern?: string;
  routeAction: RouteAction;
  nextQuestionKey?: string;
  /** Set only on answers to a route-access question. */
  accessClassification?: AccessClass;
  /**
   * The canonical fact this answer establishes, in the SAME vocabulary Visual
   * Assist is validated into. One vocabulary, two ways of reaching it — see
   * visualAssist.ts. Nothing downstream can tell which was used, and nothing
   * downstream should be able to.
   */
  establishes?: { factKey: string; value: string };
  requiredPhotoLabels?: string[];
  /** false = the price is already locked and photos are prep for the tech. */
  photosBlockBooking?: boolean;
};

export type FamilyQuestion = {
  key: string;
  prompt: string;
  helpText?: string;
  inputType: "SINGLE_SELECT" | "MULTI_SELECT" | "NUMBER" | "PHOTO_UPLOAD" | "TEXT";
  order: number;
  /** Set when this question's labels come from a contractor policy. */
  policyKey?: string;
  options: FamilyOption[];
};

export type PlumbingFamilyKey =
  | "fixture_access"
  | "shutoff_condition"
  | "supply_arrangement"
  | "pipe_material"
  | "existing_condition"
  | "run_distance"
  | "venting_and_combustion"
  | "drain_route"
  | "finish_disruption_ack";

export type PlumbingFamily = {
  key: PlumbingFamilyKey;
  title: string;
  /** Why this family exists as a family, in one sentence. */
  purpose: string;
  primitives: readonly PlumbingPrimitiveKey[];
  /** The gate that consumes what this family establishes, if any. */
  gate?: PlumbingGateKey;
  questions: readonly FamilyQuestion[];
};

// ---------------------------------------------------------------------------

const FIXTURE_ACCESS: PlumbingFamily = {
  key: "fixture_access",
  title: "Route to the connection",
  purpose:
    "Whether there is an open path to the supply and drain, or whether finished surfaces have to be opened. Asked once, in one vocabulary, and answered into the platform's three access classes.",
  primitives: ["access_classification", "conditional_disclaimer"],
  gate: "access_gate",
  questions: [
    {
      key: "plumbing_access",
      prompt: "What is underneath or behind where the work happens?",
      helpText:
        "An unfinished basement, crawl space or accessible ceiling usually means the pipe can be reached without opening anything. A finished ceiling or a slab floor usually means it cannot.",
      inputType: "SINGLE_SELECT",
      order: 10,
      options: [
        {
          value: "unfinished_basement",
          label: "An unfinished basement or utility space",
          routeAction: "CONTINUE",
          accessClassification: "ACCESSIBLE",
          establishes: { factKey: "access_class", value: "ACCESSIBLE" },
        },
        {
          value: "crawl_space",
          label: "A crawl space I can get into",
          routeAction: "CONTINUE",
          accessClassification: "ACCESSIBLE",
          establishes: { factKey: "access_class", value: "ACCESSIBLE" },
        },
        {
          value: "finished_ceiling",
          label: "A finished ceiling or finished room",
          routeAction: "CONTINUE",
          accessClassification: "FINISHED",
          establishes: { factKey: "access_class", value: "FINISHED" },
        },
        {
          value: "slab",
          label: "Concrete slab — there is nothing underneath",
          routeAction: "CONTINUE",
          accessClassification: "FINISHED",
          establishes: { factKey: "access_class", value: "FINISHED" },
        },
        {
          value: "not_sure",
          label: "I am not sure",
          // Not a cheaper branch and not a more expensive one. It is an
          // unanswered question, and the gate treats it as one.
          routeAction: "PHOTO_REVIEW",
          accessClassification: "UNKNOWN",
          establishes: { factKey: "access_class", value: "UNKNOWN" },
          requiredPhotoLabels: [
            "The area under or behind the fixture",
            "The room the fixture is in, from the doorway",
          ],
        },
      ],
    },
  ],
};

const SHUTOFF_CONDITION: PlumbingFamily = {
  key: "shutoff_condition",
  title: "The local shutoff",
  purpose:
    "Whether the water can be stopped at the fixture. Decides the size of the job rather than adding to it — a failed stop means shutting the building down and replacing the valve, which is scope, not a surcharge.",
  primitives: ["component_increment", "conditional_disclaimer"],
  gate: "shutoff_gate",
  questions: [
    {
      key: "fixture_shutoff",
      prompt: "Is there a shutoff valve at the fixture, and does it work?",
      helpText:
        "The small valve on the wall or under the sink where the supply line connects. If you can turn it and the water stops, it works.",
      inputType: "SINGLE_SELECT",
      order: 20,
      options: [
        {
          value: "present_working",
          label: "Yes, and it shuts the water off",
          routeAction: "CONTINUE",
          establishes: { factKey: "shutoff_condition", value: "PRESENT_WORKING" },
        },
        {
          value: "present_failed",
          label: "There is one, but it does not stop the water",
          routeAction: "CONTINUE",
          establishes: { factKey: "shutoff_condition", value: "PRESENT_FAILED" },
        },
        {
          value: "absent",
          label: "There is no valve at the fixture",
          routeAction: "CONTINUE",
          establishes: { factKey: "shutoff_condition", value: "ABSENT" },
        },
        {
          value: "not_sure",
          label: "I have not checked",
          routeAction: "PHOTO_REVIEW",
          establishes: { factKey: "shutoff_condition", value: "UNKNOWN" },
          requiredPhotoLabels: ["The supply connection under or behind the fixture"],
        },
      ],
    },
  ],
};

const SUPPLY_ARRANGEMENT: PlumbingFamily = {
  key: "supply_arrangement",
  title: "Who supplies the fixture",
  purpose:
    "Whether the plumber provides the fixture or the homeowner already has one. Decisive far more often in plumbing than in electrical, because a faucet, a toilet and a water heater are all things people buy before they call anybody.",
  primitives: ["supply_arrangement", "material_role"],
  questions: [
    {
      key: "fixture_supply",
      prompt: "Do you already have the fixture, or should it be supplied for you?",
      // No labels are authored here for the two arrangements a contractor may
      // not offer. The POLICY answers whether they supply at all; a service
      // whose policy is unresolved cannot publish, which is the honest state
      // for "we have not been told whether this contractor stocks these".
      helpText:
        "If you have already bought it, it will be installed as supplied. Nothing about your choice changes the labor.",
      inputType: "SINGLE_SELECT",
      order: 5,
      policyKey: "fixture.supply_arrangement",
      options: [
        {
          value: "customer_supplied",
          label: "I already have it",
          routeAction: "CONTINUE",
          establishes: { factKey: "supply_arrangement", value: "CUSTOMER_SUPPLIED" },
        },
        {
          value: "contractor_supplied",
          label: "Please supply it",
          routeAction: "CONTINUE",
          establishes: { factKey: "supply_arrangement", value: "CONTRACTOR_SUPPLIED" },
        },
      ],
    },
  ],
};

const PIPE_MATERIAL: PlumbingFamily = {
  key: "pipe_material",
  title: "What the existing pipe is",
  purpose:
    "Which material the new work has to join to. A transition between two materials is real, nameable extra work; guessing it is how a price quoted before anyone arrives becomes wrong on every house built before a certain decade.",
  primitives: ["component_increment", "material_role", "photo_gate"],
  questions: [
    {
      key: "existing_pipe_material",
      prompt: "What are the existing pipes made of?",
      helpText:
        "Copper is a dull orange-brown metal. PEX is flexible plastic tubing, usually red, blue or white. Galvanized steel is dull gray and threaded. If you cannot tell, a photograph settles it.",
      inputType: "SINGLE_SELECT",
      order: 30,
      options: [
        { value: "copper", label: "Copper", routeAction: "CONTINUE", establishes: { factKey: "pipe_material", value: "COPPER" } },
        { value: "pex", label: "PEX (flexible plastic)", routeAction: "CONTINUE", establishes: { factKey: "pipe_material", value: "PEX" } },
        { value: "cpvc", label: "CPVC (rigid cream-colored plastic)", routeAction: "CONTINUE", establishes: { factKey: "pipe_material", value: "CPVC" } },
        {
          value: "galvanized",
          label: "Galvanized steel",
          // Galvanized is not merely another material. It corrodes from the
          // inside, and cutting into it routinely turns a fixture job into a
          // repipe conversation. It leaves automated pricing deliberately.
          routeAction: "REMOTE_QUOTE",
          establishes: { factKey: "pipe_material", value: "GALVANIZED" },
          requiredPhotoLabels: ["The existing pipe where the new work connects"],
        },
        {
          value: "not_sure",
          label: "I am not sure",
          routeAction: "PHOTO_REVIEW",
          establishes: { factKey: "pipe_material", value: "UNKNOWN" },
          requiredPhotoLabels: ["The existing pipe where the new work connects"],
        },
      ],
    },
  ],
};

const RUN_DISTANCE: PlumbingFamily = {
  key: "run_distance",
  title: "How far the run is",
  purpose:
    "How much pipe or gas line the work covers. The QUESTION is universal; the included length is the contractor's allowance and never ships with the template.",
  primitives: ["band_policy", "access_classification"],
  questions: [
    {
      key: "run_distance",
      prompt: "Roughly how far is it from the existing line to where the new connection goes?",
      helpText:
        "Measure the path the pipe would take, not the straight line — around corners and along joists, the way it would actually be run.",
      inputType: "SINGLE_SELECT",
      order: 40,
      // Filled from the contractor's ContractorPolicyValue. The holes are the
      // point: a rendered "{b1}" is caught by verify-policy-resolution.ts, and
      // a seeded default would never be caught by anything.
      policyKey: "plumbing_run.breakpoints",
      options: [
        { value: "under_b1", labelPattern: "{b1} feet or less", routeAction: "CONTINUE", establishes: { factKey: "run_band", value: "STANDARD" } },
        { value: "b1_to_b2", labelPattern: "{b1+1} to {b2} feet", routeAction: "CONTINUE", establishes: { factKey: "run_band", value: "EXTENDED" } },
        { value: "over_b2", labelPattern: "More than {b2} feet", routeAction: "REMOTE_QUOTE", establishes: { factKey: "run_band", value: "OVER_BAND" } },
      ],
    },
  ],
};

const VENTING_AND_COMBUSTION: PlumbingFamily = {
  key: "venting_and_combustion",
  title: "The appliance's type and size",
  purpose:
    "Atmospheric, power vent, direct vent or electric, and how big the tank is. Different vent material, different terminations, and a power vent needs a receptacle an atmospheric heater never had. Both facts are read off the same appliance in the same photograph — which is why they are one family and not two — and both are ones Visual Assist is useful for and unsafe to guess.",
  primitives: ["photo_gate", "material_role", "component_increment"],
  gate: "combustion_gate",
  questions: [
    {
      key: "appliance_venting",
      prompt: "How does the existing water heater vent?",
      helpText:
        "Atmospheric heaters have a metal pipe rising from a hood on top and no fan. Power vent heaters have a fan on top, a plug, and a white plastic pipe leaving through a side wall.",
      inputType: "SINGLE_SELECT",
      order: 15,
      options: [
        {
          value: "atmospheric",
          label: "A metal flue rising from a hood on top, no fan",
          routeAction: "CONTINUE",
          establishes: { factKey: "combustion_class", value: "GAS_ATMOSPHERIC" },
        },
        {
          value: "power_vent",
          label: "A fan on top and a white plastic pipe out through the wall",
          routeAction: "CONTINUE",
          establishes: { factKey: "combustion_class", value: "GAS_POWER_VENT" },
        },
        {
          value: "direct_vent",
          label: "Two pipes to the outside, sealed at the appliance",
          routeAction: "CONTINUE",
          establishes: { factKey: "combustion_class", value: "GAS_DIRECT_VENT" },
        },
        {
          value: "electric",
          label: "No vent at all — it is electric",
          routeAction: "CONTINUE",
          establishes: { factKey: "combustion_class", value: "ELECTRIC" },
        },
        {
          value: "not_sure",
          label: "I am not sure",
          routeAction: "PHOTO_REVIEW",
          establishes: { factKey: "combustion_class", value: "UNKNOWN" },
          requiredPhotoLabels: [
            "The top of the water heater, including any pipe leaving it",
            "The rating plate on the side of the tank",
            "The wall or ceiling where the vent pipe leaves the room",
          ],
        },
      ],
    },
    {
      // Standard manufactured sizes. Nobody chose 40 or 50 — a manufacturer
      // did, and every plumber meets the same numbers — so these are trade
      // knowledge and stay in the template as ordinary labels. Contrast the
      // run-length bands, where the number is somebody's allowance and the
      // template ships a hole instead.
      key: "appliance_capacity",
      prompt: "How big is the existing tank?",
      helpText:
        "The capacity is printed on the label on the front or side of the tank, usually near the top.",
      inputType: "SINGLE_SELECT",
      order: 16,
      options: [
        { value: "30", label: "30 gallons", routeAction: "CONTINUE", establishes: { factKey: "capacity", value: "30" } },
        { value: "40", label: "40 gallons", routeAction: "CONTINUE", establishes: { factKey: "capacity", value: "40" } },
        { value: "50", label: "50 gallons", routeAction: "CONTINUE", establishes: { factKey: "capacity", value: "50" } },
        { value: "55", label: "55 gallons", routeAction: "CONTINUE", establishes: { factKey: "capacity", value: "55" } },
        { value: "65", label: "65 gallons", routeAction: "CONTINUE", establishes: { factKey: "capacity", value: "65" } },
        { value: "75", label: "75 gallons", routeAction: "CONTINUE", establishes: { factKey: "capacity", value: "75" } },
        { value: "80", label: "80 gallons", routeAction: "CONTINUE", establishes: { factKey: "capacity", value: "80" } },
        {
          value: "not_sure",
          label: "I cannot read the label",
          routeAction: "PHOTO_REVIEW",
          establishes: { factKey: "capacity", value: "UNKNOWN" },
          requiredPhotoLabels: ["The rating plate on the side of the tank"],
        },
      ],
    },
  ],
};

const DRAIN_ROUTE: PlumbingFamily = {
  key: "drain_route",
  title: "The drain and its cleanout",
  purpose:
    "Where the waste line goes and whether there is a cleanout to work through. Clearing a line through an accessible cleanout and clearing one by pulling a fixture are different jobs with the same customer complaint.",
  primitives: ["access_classification", "photo_gate", "conditional_disclaimer"],
  gate: "access_gate",
  questions: [
    {
      key: "cleanout_access",
      prompt: "Is there a drain cleanout you can get to?",
      helpText:
        "A capped fitting on the waste line, usually in a basement, crawl space, garage or just outside the house near the foundation.",
      inputType: "SINGLE_SELECT",
      order: 25,
      options: [
        {
          value: "interior_cleanout",
          label: "Yes, inside — a basement, crawl space or garage",
          routeAction: "CONTINUE",
          accessClassification: "ACCESSIBLE",
          establishes: { factKey: "access_class", value: "ACCESSIBLE" },
        },
        {
          value: "exterior_cleanout",
          label: "Yes, outside near the foundation",
          routeAction: "CONTINUE",
          accessClassification: "ACCESSIBLE",
          establishes: { factKey: "access_class", value: "ACCESSIBLE" },
        },
        {
          value: "no_cleanout",
          label: "There is no cleanout I can find",
          // Without a cleanout the line is reached by pulling a fixture, which
          // is different work and sometimes no work at all until one is cut in.
          routeAction: "CONTINUE",
          accessClassification: "FINISHED",
          establishes: { factKey: "access_class", value: "FINISHED" },
        },
        {
          value: "not_sure",
          label: "I do not know what to look for",
          routeAction: "PHOTO_REVIEW",
          accessClassification: "UNKNOWN",
          establishes: { factKey: "access_class", value: "UNKNOWN" },
          requiredPhotoLabels: [
            "Where the main waste line leaves the building",
            "The outside wall of the house nearest the affected fixture",
          ],
        },
      ],
    },
  ],
};

const FINISH_DISRUPTION_ACK: PlumbingFamily = {
  key: "finish_disruption_ack",
  title: "Access openings",
  purpose:
    "That reaching a pipe inside a finished wall or ceiling requires an opening is a fact of the work whoever performs it. What is or is not put back afterwards is the contractor's terms and lives on their own disclaimer, never here.",
  primitives: ["conditional_disclaimer", "photo_gate"],
  questions: [
    {
      key: "plumbing_finish_ack",
      prompt: "Reaching this pipe may mean opening a finished surface. How would you like to proceed?",
      helpText:
        "With no basement, crawl space or accessible ceiling on the route, the pipe has to be reached through the finished wall or ceiling. Openings are kept small and put where they are least visible, but on a finished surface they usually cannot be avoided.",
      inputType: "SINGLE_SELECT",
      order: 90,
      options: [
        {
          value: "understood",
          label: "Understood — go ahead",
          routeAction: "CONTINUE",
          establishes: { factKey: "finish_ack", value: "ACKNOWLEDGED" },
        },
        {
          value: "review_first",
          label: "I'd rather someone take a look first",
          routeAction: "REMOTE_QUOTE",
          establishes: { factKey: "finish_ack", value: "REVIEW_FIRST" },
          requiredPhotoLabels: ["The wall or ceiling the work would go through"],
        },
      ],
    },
  ],
};

const EXISTING_CONDITION: PlumbingFamily = {
  key: "existing_condition",
  title: "The condition of what is there now",
  purpose:
    "What the customer can SEE about the existing installation, and nothing else. A ninth family rather than a question bolted onto another one: it has its own vocabulary, its own gate, its own routing, and it is the only fact that can take a customer out of the priceable catalog entirely.",
  primitives: ["conditional_disclaimer", "photo_gate"],
  gate: "condition_gate",
  questions: [
    {
      key: "existing_condition",
      prompt: "Looking at the existing installation, which of these describes it?",
      // Asks what it LOOKS LIKE. Never what is wrong with it.
      //
      // Every option below is something a person can see standing in front of
      // it, or an honest admission that they cannot. None of them names a
      // cause: "visibly corroded" is an observation, "failed cartridge" is a
      // diagnosis, and a booking flow that offered the second would be
      // diagnosing from a web form and then quoting the repair it picked.
      //
      // Several options collapse to one canonical condition on purpose. The
      // RAW ANSWER KEEPS ITS DETAIL — a snapshot still records
      // "visibly_corroded" and the job sheet still says so — while the pricing
      // layer works in three coarse terms. That is the same split
      // AccessClassification already makes, and for the same reason: the
      // engine should not learn a new word every time a question is reworded.
      helpText:
        "Just what you can see. If you cannot tell, say so — nobody expects you to work out what is wrong, and a technician will look.",
      inputType: "SINGLE_SELECT",
      order: 35,
      options: [
        {
          value: "no_visible_issue",
          // An objective observation, not an assessment. "It looks fine" asks
          // the customer for a verdict on the installation; this asks only
          // what they can and cannot see, which is all they can honestly give.
          label: "No visible leaking, corrosion, or damage",
          routeAction: "CONTINUE",
          establishes: { factKey: "fixture_condition", value: "SERVICEABLE" },
        },
        {
          value: "visibly_corroded",
          label: "There is visible corrosion, rust or mineral buildup",
          routeAction: "PHOTO_REVIEW",
          establishes: { factKey: "fixture_condition", value: "DEGRADED" },
          requiredPhotoLabels: ["The existing installation, close enough to see its condition"],
        },
        {
          value: "visibly_damaged",
          label: "Something is visibly cracked, broken or damaged",
          routeAction: "PHOTO_REVIEW",
          establishes: { factKey: "fixture_condition", value: "DEGRADED" },
          requiredPhotoLabels: ["The damage, and the area around it"],
        },
        {
          value: "will_not_move",
          label: "A handle or valve will not move",
          // An observation of behavior, not a cause. Whether that is a seized
          // stem, scale, or something else is a technician's finding.
          routeAction: "PHOTO_REVIEW",
          establishes: { factKey: "fixture_condition", value: "DEGRADED" },
          requiredPhotoLabels: ["The handle or valve that will not move"],
        },
        {
          value: "visibly_leaking",
          label: "Water is visibly leaking or dripping now",
          // The PLATFORM enum, which is shared and unchanged. Plumbing's own
          // name for where this goes is ON_SITE_SERVICE (see gates.ts); the
          // customer is never shown either word.
          routeAction: "REROUTE_TROUBLESHOOTING",
          establishes: { factKey: "fixture_condition", value: "ACTIVE_FAILURE" },
        },
        {
          value: "concealed",
          label: "I cannot see it — it is boxed in or behind a finished surface",
          // NOT a photo request. Asking for a photograph of something the
          // customer has just said is concealed sends them back to the camera
          // to fail, which is the retake loop in its purest form.
          routeAction: "REMOTE_QUOTE",
          establishes: { factKey: "fixture_condition", value: "UNKNOWN" },
        },
        {
          value: "cannot_determine",
          label: "I am not sure",
          routeAction: "PHOTO_REVIEW",
          establishes: { factKey: "fixture_condition", value: "UNKNOWN" },
          requiredPhotoLabels: ["The existing installation, close enough to see its condition"],
        },
      ],
    },
  ],
};

/**
 * The nine, in the order a service normally composes them.
 *
 * Order is a default rather than a rule — a water heater asks about venting
 * before anything else, a sink asks about the shutoff first. Each family
 * carries its own `order` per question so a service can interleave without
 * rewording anything.
 */
export const PLUMBING_FAMILIES: readonly PlumbingFamily[] = [
  SUPPLY_ARRANGEMENT,
  VENTING_AND_COMBUSTION,
  FIXTURE_ACCESS,
  SHUTOFF_CONDITION,
  DRAIN_ROUTE,
  PIPE_MATERIAL,
  EXISTING_CONDITION,
  RUN_DISTANCE,
  FINISH_DISRUPTION_ACK,
] as const;

export const PLUMBING_FAMILY_KEYS: readonly PlumbingFamilyKey[] =
  PLUMBING_FAMILIES.map((f) => f.key);

export function family(key: PlumbingFamilyKey): PlumbingFamily {
  const found = PLUMBING_FAMILIES.find((f) => f.key === key);
  if (!found) throw new Error(`Unknown plumbing family "${key}".`);
  return found;
}
