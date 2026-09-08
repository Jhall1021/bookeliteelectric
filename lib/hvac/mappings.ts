/**
 * Deterministic mappings: canonical fact in, scope consequence out — H2.
 *
 * Mirrors lib/plumbing/mappings.ts's shape. TOTAL FUNCTIONS OVER CLOSED
 * VOCABULARIES: every member of every mapped enum has an entry, including
 * UNKNOWN, and the verifier proves it. A lookup returning undefined for one
 * member would be a silent no-op — no material role, no component, no
 * disclaimer — pricing a job as if the missing work did not exist, which is
 * worse than a crash because it produces a plausible number.
 *
 * NO PRICES AND NO QUANTITIES-BY-POLICY, same rule as Plumbing. A mapping
 * names WHAT the job consumes and WHAT extra work it implies, by canonical
 * role and canonical component key — never a cost, never a quantity a
 * contractor should instead set as an allowance.
 *
 * THE H2 BOUNDARY, STRUCTURALLY
 *
 * A mapping may bind an observation to a material role, a component, or a
 * prerequisite — never to a repair, a component FAILURE, a replacement
 * recommendation, or a priced service. Nothing in this file names a
 * technician's conclusion; every consequence below is a role or a named
 * prerequisite, exactly the shape Visual Assist is already restricted to
 * (lib/visual-assist/invariants.ts's own word-bans apply independently of
 * this file and are not re-implemented here).
 *
 * ONLY ONE MAPPING POPULATED IN H2, DELIBERATELY
 *
 * `EXISTING_CONDITION_SCOPE` is required now because the H2 audit's safety
 * invariant — existing_condition is effect-free — has to be a property of
 * data, not a claim in a comment. Every OTHER fact this file could map
 * (venting_class, refrigerant_lineset, and so on) is deferred to H3,
 * alongside the tree that would actually consume it. Populating those
 * mappings now, with nothing to read them, would be exactly the
 * scaffolding-ahead-of-need the H2 audit already declined for
 * composition/publish — a mapping with no consumer is untested by
 * definition, and untested is not the same as correct.
 */

import type { EquipmentCondition } from "./gates";

export type ScopeConsequence = {
  /** Canonical material roles this fact makes the job consume. */
  materialRoles: readonly string[];
  /** Canonical components this fact attaches. Priced by the contractor. */
  components: readonly string[];
  /** A prerequisite the job needs that HVAC does not itself provide. */
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
 * EFFECT-FREE, PERMANENTLY — the H2 safety invariant as data.
 *
 * All four members map to nothing: no material role, no component, no
 * prerequisite. `existing_condition` may take a job OUT of automated pricing
 * (via condition_gate's ON_SITE_SERVICE / PHOTO_REVIEW routes); it may never
 * SELECT what the job then consumes. Attaching a role or component to
 * DEGRADED would be exactly the mistake Plumbing shipped once and removed —
 * an observation choosing a repair.
 */
export const EXISTING_CONDITION_SCOPE: Readonly<Record<EquipmentCondition, ScopeConsequence>> = {
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
 * Merge the consequences of several facts into one scope — mirrors
 * lib/plumbing/mappings.ts's mergeScope. De-duplicated, because the same
 * role can legitimately arrive from two facts; order preserved so the job
 * sheet reads in the order the facts were established.
 */
export function mergeScope(consequences: readonly ScopeConsequence[]): ScopeConsequence {
  const roles: string[] = [];
  const components: string[] = [];
  const prerequisites: string[] = [];
  const notes: string[] = [];
  for (const c of consequences) {
    for (const r of c.materialRoles) if (!roles.includes(r)) roles.push(r);
    for (const c2 of c.components) if (!components.includes(c2)) components.push(c2);
    for (const p of c.prerequisites) if (!prerequisites.includes(p)) prerequisites.push(p);
    if (c.note) notes.push(c.note);
  }
  return { materialRoles: roles, components, prerequisites, note: notes.join(" ") };
}

/**
 * Evidence-only facts — named so a verifier can assert they never appear as
 * a mapping key or a gate factKey anywhere in this directory. See §G.4 and
 * §E.6: manufacturer, model, serial and manufacture_date sit in the facts
 * record with no gate, no mapping and no consumer. That is what makes
 * "evidence only" a property of the code rather than a rule in a comment.
 *
 * `reported_symptom`'s thirteen (documented as fourteen; see H1's return
 * report) members are listed separately, below — they are context on the
 * hvac-service-call booking, never a mapping key either, and never resolve
 * to a service other than the shell itself.
 */
export const EVIDENCE_ONLY_FACTS: readonly string[] = [
  "manufacturer",
  "model",
  "serial",
  "manufacture_date",
] as const;

/**
 * The closed reported_symptom vocabulary — carried as structured intake
 * context on hvac-service-call. Appearances, not causes: ICE_OBSERVED, not
 * FROZEN_COIL; WATER_OBSERVED, not CONDENSATE_BLOCKAGE; CONTROL_NOT_
 * RESPONDING, not THERMOSTAT_FAILED. No SYMPTOM_SCOPE table exists — there
 * is no structure a repair could arrive through, which is why this is
 * architecture rather than discipline (§G.1).
 */
export const REPORTED_SYMPTOMS: readonly string[] = [
  "NO_COOLING",
  "NO_HEAT",
  "WILL_NOT_START",
  "WEAK_AIRFLOW",
  "WATER_OBSERVED",
  "UNUSUAL_NOISE",
  "CYCLING_FREQUENTLY",
  "CONTROL_NOT_RESPONDING",
  "ICE_OBSERVED",
  "ODOR_OBSERVED",
  "HUMIDITY_COMPLAINT",
  "COMFORT_COMPLAINT",
  "INTERMITTENT",
] as const;
