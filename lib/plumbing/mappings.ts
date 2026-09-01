/**
 * Deterministic mappings: canonical fact in, scope consequence out.
 *
 * TOTAL FUNCTIONS OVER CLOSED VOCABULARIES. Every member of every enum has an
 * entry, including UNKNOWN, and the verifier proves it. A lookup that returned
 * undefined for one member would be a silent no-op — no material role, no
 * component, no disclaimer — and a job priced as if the missing work did not
 * exist. That is worse than a crash, because it produces a plausible number.
 *
 * NO PRICES AND NO QUANTITIES-BY-POLICY. A mapping names WHAT the job consumes
 * and WHAT extra work it implies, by canonical role and canonical component
 * key. What a role costs and what an increment sells for are the contractor's,
 * resolved by lib/materialCost.ts and ContractorComponent at pricing time.
 * Where a quantity is a contractor allowance rather than a property of the job,
 * the mapping names the role and supplies no number — the same rule
 * TemplateServiceMaterial.quantity already follows.
 */

import type { CombustionClass, FixtureCondition, ShutoffCondition } from "./gates";

export type ScopeConsequence = {
  /** Canonical material roles this fact makes the job consume. */
  materialRoles: readonly string[];
  /** Canonical components this fact attaches. Priced by the contractor. */
  components: readonly string[];
  /**
   * A prerequisite the job needs that plumbing does not provide.
   *
   * Named rather than assumed. A power vent heater needs a receptacle within
   * reach; if there is not one, that is electrical work, and pricing the
   * plumbing as though it were present is how a job arrives and stops.
   */
  prerequisites: readonly string[];
  /** Why, in one sentence, for the job sheet and the scope summary. */
  note: string;
};

const NOTHING: ScopeConsequence = {
  materialRoles: [],
  components: [],
  prerequisites: [],
  note: "",
};

/**
 * How an appliance vents decides the vent material, the terminations and
 * whether electrical work is a prerequisite.
 *
 * This is the mapping the whole Visual Assist integration exists to feed, and
 * the one where a guess is most expensive. UNKNOWN maps to nothing — not to
 * the common case — because combustionGate has already refused the route by
 * the time anything reads this, and a fallback here would be a second opinion
 * quietly overriding that refusal.
 */
export const COMBUSTION_SCOPE: Readonly<Record<CombustionClass, ScopeConsequence>> = {
  GAS_ATMOSPHERIC: {
    materialRoles: ["vent_connector_metal", "vent_storm_collar", "gas_flex_connector", "gas_shutoff_valve"],
    components: ["draft_hood_connection"],
    prerequisites: [],
    note: "Vents by natural draft through a metal flue, so the existing chimney or B-vent connection is reused.",
  },
  GAS_POWER_VENT: {
    materialRoles: ["vent_pipe_pvc", "vent_termination_kit", "condensate_tubing", "gas_flex_connector", "gas_shutoff_valve"],
    components: ["power_vent_termination"],
    // Named, not assumed. The blower needs power, and whether a receptacle is
    // within reach is not a plumbing fact.
    prerequisites: ["120v_receptacle_within_reach"],
    note: "Fan-assisted venting through plastic pipe to a side wall, and the blower needs a receptacle.",
  },
  GAS_DIRECT_VENT: {
    materialRoles: ["vent_pipe_concentric", "vent_termination_kit", "condensate_tubing", "gas_flex_connector", "gas_shutoff_valve"],
    components: ["direct_vent_termination"],
    prerequisites: ["120v_receptacle_within_reach"],
    note: "Sealed combustion drawing air from outside, so both pipes run to a single termination.",
  },
  ELECTRIC: {
    materialRoles: [],
    components: [],
    prerequisites: ["dedicated_circuit_present"],
    note: "No combustion and no vent; the existing circuit is reused.",
  },
  // Deliberately empty. The gate has already stopped the route.
  UNKNOWN: NOTHING,
};

/**
 * What the existing pipe is decides the transition, and nothing else.
 *
 * A transition between two materials is real, nameable work — a dielectric
 * union, a push-fit adapter, a threaded conversion — and it is a COMPONENT
 * because its price is the contractor's. It is not a surcharge invented per
 * service, which is how the same fitting came to cost three different amounts
 * in the electrical catalog before components existed.
 */
export type PipeMaterial = "COPPER" | "PEX" | "CPVC" | "GALVANIZED" | "CAST_IRON" | "UNKNOWN";

export const PIPE_MATERIAL_SCOPE: Readonly<Record<PipeMaterial, ScopeConsequence>> = {
  COPPER: {
    materialRoles: ["copper_fitting", "solder_or_press_consumable"],
    components: [],
    prerequisites: [],
    note: "Joined in copper, as found.",
  },
  PEX: {
    materialRoles: ["pex_fitting", "pex_ring"],
    components: [],
    prerequisites: [],
    note: "Joined in PEX, as found.",
  },
  CPVC: {
    materialRoles: ["cpvc_fitting", "cpvc_solvent"],
    components: ["cpvc_transition"],
    prerequisites: [],
    note: "CPVC is brittle with age, so the joint is made back to sound pipe.",
  },
  GALVANIZED: {
    materialRoles: ["dielectric_union", "threaded_adapter"],
    components: ["galvanized_transition"],
    // Not a prerequisite the contractor supplies — a disclosure. Galvanized
    // corrodes from the inside and cutting into it routinely turns a fixture
    // job into a repipe conversation, which is why the family routes it out of
    // automated pricing before this mapping is ever read.
    prerequisites: ["galvanized_condition_disclosed"],
    note: "Transitioning off galvanized steel, which may not be sound where it is cut.",
  },
  CAST_IRON: {
    materialRoles: ["shielded_coupling"],
    components: ["cast_iron_transition"],
    prerequisites: ["cast_iron_condition_disclosed"],
    note: "Transitioning off cast iron waste pipe with a shielded coupling.",
  },
  UNKNOWN: NOTHING,
};

/**
 * A failed or absent stop changes the SIZE of the job, so it maps to a
 * component and a prerequisite rather than to a modifier.
 *
 * PRESENT_FAILED and ABSENT both add a valve; only ABSENT requires the
 * building supply to be shut, because there is nothing else to close.
 */
export const SHUTOFF_SCOPE: Readonly<Record<ShutoffCondition, ScopeConsequence>> = {
  PRESENT_WORKING: {
    materialRoles: ["supply_line_flex"],
    components: [],
    prerequisites: [],
    note: "Isolated at the fixture.",
  },
  PRESENT_FAILED: {
    materialRoles: ["supply_line_flex", "fixture_stop_valve"],
    components: ["stop_valve_replacement"],
    prerequisites: ["building_supply_shutoff_available"],
    note: "The existing stop does not hold, so it is replaced as part of the work.",
  },
  ABSENT: {
    materialRoles: ["supply_line_flex", "fixture_stop_valve"],
    components: ["stop_valve_new"],
    prerequisites: ["building_supply_shutoff_available"],
    note: "No stop exists at the fixture, so one is added and the building supply is shut to do it.",
  },
  UNKNOWN: NOTHING,
};

/**
 * Condition contributes CONTEXT and nothing else. No role, no component, ever.
 *
 * This mapping used to attach a repair coupling and a rework component to
 * DEGRADED, and that was the no-self-diagnosis boundary being crossed: an
 * observation of corrosion was choosing a specific repair, which is a
 * conclusion about a cause dressed up as a line item.
 *
 * Every entry is now effect-free, and the verifier asserts it. A condition that
 * matters takes the route out of automated pricing (conditionGate) and arrives
 * at review carrying what was observed; a person decides what the work is.
 *
 * The empty arrays are deliberate rather than an oversight — they are what
 * makes "an observation cannot select work" a property of the data instead of
 * a rule in a comment.
 */
export const CONDITION_SCOPE: Readonly<Record<FixtureCondition, ScopeConsequence>> = {
  SERVICEABLE: {
    materialRoles: [],
    components: [],
    prerequisites: [],
    note: "Nothing unusual was reported about the existing installation.",
  },
  DEGRADED: {
    materialRoles: [],
    components: [],
    prerequisites: [],
    note: "A visible condition was reported on the existing installation.",
  },
  ACTIVE_FAILURE: NOTHING,
  UNKNOWN: NOTHING,
};

/**
 * Merge the consequences of several facts into one scope.
 *
 * De-duplicated, because the same role legitimately arrives from two facts —
 * a gas connector is named by the combustion mapping and again by the shutoff
 * mapping on a gas appliance — and counting it twice would put two of them on
 * the job sheet and two of them in the material cost.
 *
 * Order is preserved so the job sheet reads in the order the facts were
 * established rather than alphabetically, which is how a technician reads it.
 */
export function mergeScope(consequences: readonly ScopeConsequence[]): ScopeConsequence {
  const roles: string[] = [];
  const components: string[] = [];
  const prerequisites: string[] = [];
  const notes: string[] = [];
  for (const c of consequences) {
    for (const r of c.materialRoles) if (!roles.includes(r)) roles.push(r);
    for (const k of c.components) if (!components.includes(k)) components.push(k);
    for (const p of c.prerequisites) if (!prerequisites.includes(p)) prerequisites.push(p);
    if (c.note && !notes.includes(c.note)) notes.push(c.note);
  }
  return { materialRoles: roles, components, prerequisites, note: notes.join(" ") };
}


/**
 * What a single ANSWER selects, by the canonical fact it establishes.
 *
 * The publisher uses this to emit TemplateAnswerOptionComponent rows, so the
 * relationship the scope layer already reasons about becomes a real row the
 * shared readiness and pricing authorities can see. Identity only — which
 * canonical component an answer selects. What it costs and what it sells for
 * stay contractor-owned.
 *
 * `fixture_condition` returns nothing for every value, and that is load-bearing
 * rather than incidental: an observation may not select work, so the condition
 * family must never acquire components through this door.
 */
export function componentsForAnswer(factKey: string, value: string): readonly string[] {
  switch (factKey) {
    case "combustion_class": return COMBUSTION_SCOPE[value as CombustionClass]?.components ?? [];
    case "shutoff_condition": return SHUTOFF_SCOPE[value as ShutoffCondition]?.components ?? [];
    case "pipe_material": return PIPE_MATERIAL_SCOPE[value as PipeMaterial]?.components ?? [];
    // Effect-free, permanently. See CONDITION_SCOPE.
    case "fixture_condition": return [];
    default: return [];
  }
}

/**
 * Roles a service consumes NO MATTER WHICH ANSWER is given.
 *
 * The intersection across every value the service permits, not the union. A
 * union would declare a gas heater requires both metal flue and PVC vent pipe,
 * which is never true of one job — and the contractor would be asked to cost
 * materials that job will not use.
 *
 * What varies by answer is carried by the component attached to that answer
 * instead, which is exactly the split TemplateServiceMaterial and
 * TemplateAnswerOptionComponent already draw.
 */
export function requiredRolesAcross(
  table: Record<string, ScopeConsequence>,
  values: readonly string[]
): string[] {
  const usable = values.filter((v) => v !== "UNKNOWN" && table[v]);
  if (usable.length === 0) return [];
  let acc = [...table[usable[0]].materialRoles];
  for (const v of usable.slice(1)) {
    const roles = table[v].materialRoles;
    acc = acc.filter((r) => roles.includes(r));
  }
  return acc;
}
