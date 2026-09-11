/**
 * Turning a contractor's declarations into requirements — or into named gaps.
 *
 * THREE AUTHORITIES, AND THIS FILE IS THE SEAM BETWEEN THEM
 *
 *   Routing V2         job geometry: 31 feet, three corners, one endpoint.
 *   the material system  physical facts of the family the contractor installs:
 *                      whether it grounds, how far apart it wants supports,
 *                      what each terminus takes.
 *   contractor policy  work-practice choices: how much slack they cut, which
 *                      conductor specification they work to.
 *
 * No layer invents another's facts. Routing V2 never learns a stock length;
 * the system never decides how much slack to cut; the platform never picks a
 * gauge. This file reads all three and refuses, by name, where one is silent.
 *
 * EVERY GAP IS SPECIFIC. "Materials incomplete" is not an answer a contractor
 * can act on. Each unresolved code below names the one declaration that would
 * close it.
 *
 * PURE. Takes plain records, returns plain records. No Prisma, no I/O.
 */
import type {
  ConductorRequirement, Divisibility, PhysicalRequirement, RequiredClass,
  UnresolvedRequirement,
} from "./materialTakeoff";
import { SURFACE_ROLES } from "./surfaceRacewayTakeoff";

export const SURFACE_RACEWAY_SYSTEM_KEY = "SURFACE_RACEWAY";

/** Policy keys this service depends on. Stable across template versions. */
export const POLICY_KEYS = {
  conductorSpec: "surface_outlet.branch_conductor_spec",
  terminationSlack: "surface_raceway.conductor_slack_per_termination",
  offcutReuse: "surface_raceway.offcut_reuse",
} as const;

/** The gauges the template offers. Trade knowledge; the CHOICE is not. */
export const CONDUCTOR_SPEC_CHOICES = ["14", "12", "10"] as const;
export type ConductorGauge = (typeof CONDUCTOR_SPEC_CHOICES)[number];

export type GroundingStrategy =
  | "SEPARATE_EQUIPMENT_GROUNDING_CONDUCTOR"
  | "SYSTEM_PROVIDES_GROUNDING_PATH";

export type TerminationRequirement = "FITTING_REQUIRED" | "DIRECT_ENTRY";

/** Exactly the shape of a ContractorMaterialSystem row, with nothing added. */
export type DeclaredSystem = {
  systemKey: string;
  declaredSystemLabel: string | null;
  groundingStrategy: GroundingStrategy | null;
  supportSpacingFt: number | null;
  supportAtEachTerminus: boolean | null;
  sourceTermination: TerminationRequirement | null;
  sourceTerminationRole: string | null;
  destinationTermination: TerminationRequirement | null;
  destinationTerminationRole: string | null;
  declaredAt: Date | null;
};

/** One contractor policy value, resolved or not. */
export type DeclaredPolicy = {
  key: string;
  choice: string | null;
  measurement: number | null;
  resolvedAt: Date | null;
};

export type SystemDerivation = {
  derivedRequirements: PhysicalRequirement[];
  extraDivisibility: { role: string; divisibility: Divisibility }[];
  /** Gaps found while deriving. Merged into the takeoff's own unresolved set. */
  gaps: UnresolvedRequirement[];
  conductors: ConductorRequirement;
  /** Classes the derivation established, replacing the unquantifiable stubs. */
  resolvedClasses: RequiredClass[];
};

const policy = (policies: DeclaredPolicy[], key: string): DeclaredPolicy | undefined =>
  policies.find((p) => p.key === key && p.resolvedAt !== null);

/**
 * Support count from a declared rule, never from a guessed one.
 *
 * Intermediate supports fall at the declared interval along the run; a support
 * at each terminus is added only when the contractor declared that separately.
 * Both halves come from the declaration — this function does the arithmetic
 * and none of the deciding, which is why `ceil(feet / spacing)` does not
 * appear: it silently folds the terminus question into the interval.
 */
export const supportCount = (feet: number, spacingFt: number, atEachTerminus: boolean): number =>
  Math.floor(feet / spacingFt) + (atEachTerminus ? 2 : 0);

export function deriveFromSystem(args: {
  routeFeet: number;
  system: DeclaredSystem | null;
  policies: DeclaredPolicy[];
}): SystemDerivation {
  const { routeFeet, system, policies } = args;
  const derivedRequirements: PhysicalRequirement[] = [];
  const extraDivisibility: { role: string; divisibility: Divisibility }[] = [];
  const gaps: UnresolvedRequirement[] = [];
  const resolvedClasses: RequiredClass[] = [];

  // ── the system must be selected at all ────────────────────────────────────
  if (!system || system.declaredAt === null) {
    gaps.push({
      code: "MATERIAL_SYSTEM_NOT_SELECTED", role: null,
      reason: `No surface raceway system has been selected and declared for this contractor. Grounding behaviour, support spacing and termination assembly are all properties of the selected family, so none of them can be established until one is chosen. Price2Book does not pick a family.`,
    });
  }

  // ── grounding: decides whether an equipment ground conductor is pulled ────
  const grounding = system?.groundingStrategy ?? null;
  if (grounding === null) {
    gaps.push({
      code: "GROUNDING_STRATEGY_NOT_ESTABLISHED", role: null,
      reason: `The selected system has not declared whether it establishes an equipment grounding path. That decides whether a separate equipment grounding conductor is pulled, so the conductor count itself is unknown until it is declared. Assuming either answer would make Price2Book assert a code conclusion about a product and a jurisdiction it cannot see.`,
    });
  }

  // ── supports: a system property, applied to a Routing V2 length ───────────
  if (system) {
    const spacing = system.supportSpacingFt;
    const atEnds = system.supportAtEachTerminus;
    if (spacing === null) {
      gaps.push({
        code: "SUPPORT_SPACING_NOT_ESTABLISHED", role: SURFACE_ROLES.supportClip,
        reason: `The selected system has not declared its support interval, so ${routeFeet} ft of run cannot produce a clip count. Routing V2 knows the length; the system determines how often it is strapped.`,
      });
    } else if (atEnds === null) {
      gaps.push({
        code: "SUPPORT_TERMINUS_RULE_NOT_ESTABLISHED", role: SURFACE_ROLES.supportClip,
        reason: `The support interval is declared at ${spacing} ft, but whether the system also wants a support at each terminus is not. That changes the count by two, so it is asked separately rather than folded into a rounding rule.`,
      });
    } else {
      const clips = supportCount(routeFeet, spacing, atEnds);
      derivedRequirements.push({
        role: SURFACE_ROLES.supportClip, quantity: clips, unit: "each",
        fromComponent: `${routeFeet} ft at the declared ${spacing} ft interval${atEnds ? ", plus one at each terminus" : ""}`,
      });
      resolvedClasses.push({
        classKey: "RACEWAY_SUPPORT", roles: [SURFACE_ROLES.supportClip],
        because: "Raceway is strapped to the wall at intervals along its length.",
      });
    }
  }

  // ── terminations: what each end of the run takes ──────────────────────────
  const termini: { end: "source" | "destination"; req: TerminationRequirement | null; role: string | null }[] = [
    { end: "source", req: system?.sourceTermination ?? null, role: system?.sourceTerminationRole ?? null },
    { end: "destination", req: system?.destinationTermination ?? null, role: system?.destinationTerminationRole ?? null },
  ];
  const terminationRoles: string[] = [];
  let terminationsEstablished = true;
  for (const t of termini) {
    if (t.req === null) {
      terminationsEstablished = false;
      gaps.push({
        code: "TERMINATION_ASSEMBLY_NOT_ESTABLISHED", role: null,
        reason: `The ${t.end} terminus has not declared what it requires. Whether the enclosure accepts the raceway directly or takes a fitting is a property of the selected family, and "no fitting listed" must not stand in for "nobody has said".`,
      });
      continue;
    }
    if (t.req === "DIRECT_ENTRY") continue; // a declared none, not a silent one
    if (!t.role) {
      terminationsEstablished = false;
      gaps.push({
        code: "TERMINATION_ASSEMBLY_NOT_ESTABLISHED", role: null,
        reason: `The ${t.end} terminus is declared as requiring a fitting, but no canonical role names which. A requirement with no role cannot be purchased and must not be dropped.`,
      });
      continue;
    }
    terminationRoles.push(t.role);
    derivedRequirements.push({
      role: t.role, quantity: 1, unit: "each",
      fromComponent: `${t.end} terminus, declared as requiring a fitting`,
    });
  }
  if (terminationsEstablished) {
    // Deduplicated: one role serving both ends is one class with one purchase.
    const unique = [...new Set(terminationRoles)];
    resolvedClasses.push({
      classKey: "RACEWAY_TERMINATION", roles: unique,
      because: "Both ends of the run terminate — into the existing device at the source and the new box at the outlet.",
    });
  }

  // ── conductors: specification is policy, count is grounding ───────────────
  const spec = policy(policies, POLICY_KEYS.conductorSpec);
  const slack = policy(policies, POLICY_KEYS.terminationSlack);
  let conductors: ConductorRequirement;

  if (!spec?.choice) {
    conductors = {
      known: false, code: "CONDUCTOR_SPECIFICATION_NOT_ESTABLISHED",
      reason: `The contractor has not declared the branch-extension conductor specification for this service. Every route reaching this takeoff is an everyday load tapped from an existing general-purpose branch circuit — the tree reroutes every other load type and every dedicated circuit — so one specification can cover the whole envelope, but it is the contractor's to declare and none is declared. No gauge is inferred from the service name, from the load answer, or from what another contractor selected.`,
    };
  } else if (grounding === null) {
    conductors = {
      known: false, code: "GROUNDING_STRATEGY_NOT_ESTABLISHED",
      reason: `The conductor specification is declared as #${spec.choice}, but how many conductors are pulled depends on whether the selected system establishes the grounding path, and that is not declared.`,
    };
  } else if (slack === undefined || slack.measurement === null) {
    conductors = {
      known: false, code: "TERMINATION_SLACK_NOT_ESTABLISHED",
      reason: `The conductor specification is declared as #${spec.choice}, but conductors are cut long at each termination and the contractor has not established that allowance. Null is not zero: an unstated allowance is unknown, and a contractor who deliberately models none says so with an explicit 0.`,
    };
  } else {
    const gauge = spec.choice;
    // Route length plus the DECLARED allowance at each of the two terminations.
    const footPerConductor = routeFeet + 2 * slack.measurement;
    const functions = [
      { function: "ungrounded", role: `CONDUCTOR_THHN_${gauge}_UNGROUNDED` },
      { function: "grounded", role: `CONDUCTOR_THHN_${gauge}_GROUNDED` },
    ];
    if (grounding === "SEPARATE_EQUIPMENT_GROUNDING_CONDUCTOR") {
      functions.push({ function: "equipment ground", role: `CONDUCTOR_THHN_${gauge}_EQUIPMENT_GROUND` });
    }
    conductors = { known: true, functions, footPerConductor };
    for (const f of functions) extraDivisibility.push({ role: f.role, divisibility: "CONTINUOUS" });
  }

  return { derivedRequirements, extraDivisibility, gaps, conductors, resolvedClasses };
}
