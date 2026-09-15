/**
 * What a surface-raceway route is KNOWN to require — the class audit.
 *
 * This file exists because of a specific failure. Stage C seeded
 * SURFACE_RACEWAY_SUPPORT_CLIP, SURFACE_RACEWAY_END and
 * SURFACE_RACEWAY_TRANSITION as canonical roles, and Stage E's recipes consumed
 * none of them. Nothing was wrong with either half; the takeoff simply never
 * mentioned supports or end fittings, and reported itself complete. A material
 * class with no recipe line is invisible, and invisible is indistinguishable
 * from not required.
 *
 * So the required classes are declared HERE, deliberately apart from the
 * recipes, and the takeoff must discharge every one. A class that cannot be
 * quantified yet says so with a reason. The list is meant to be argued with —
 * that is the point of writing it down.
 *
 * WHAT A SURFACE RACEWAY ROUTE NEEDS, AND WHERE EACH STANDS
 *
 *   channel              RESOLVED from route feet.
 *   inside/outside/flat  RESOLVED from the three corner counts, when non-zero.
 *   straight joints      Derived from the purchased piece count. Exact on a
 *                        straight run, unresolved once turns split the run.
 *   device box           RESOLVED — one, at the new outlet.
 *   end / entrance       UNRESOLVED. The run terminates at an existing device
 *                        at one end and the new box at the other, and which
 *                        fitting each termination takes depends on what is
 *                        being entered. No policy establishes it.
 *   support clips        UNRESOLVED. Certainly required — raceway is strapped
 *                        at intervals — but the interval is a product and
 *                        jurisdiction fact nobody has established, so a clip
 *                        count cannot be derived from 31 feet.
 *   conductors           See the conductor note below.
 */
import type {
  ConductorRequirement, Divisibility, RequiredClass, SelectedComponent,
} from "./materialTakeoff";

export const SURFACE_ROLES = {
  channel: "SURFACE_RACEWAY_CHANNEL",
  joint: "SURFACE_RACEWAY_JOINT",
  insideElbow: "SURFACE_RACEWAY_ELBOW_INSIDE",
  outsideElbow: "SURFACE_RACEWAY_ELBOW_OUTSIDE",
  flatElbow: "SURFACE_RACEWAY_ELBOW_FLAT",
  end: "SURFACE_RACEWAY_END",
  transition: "SURFACE_RACEWAY_TRANSITION",
  supportClip: "SURFACE_RACEWAY_SUPPORT_CLIP",
  deviceBox: "SURFACE_DEVICE_BOX_1G",
} as const;

/**
 * Divisibility per role.
 *
 * This belongs on CanonicalMaterial eventually — it is a physical property of
 * the material, not of this service. It lives here for now because adding a
 * schema column is not part of a correction pass, and stating it in code beats
 * letting the takeoff default to DISCRETE, which is exactly the assumption that
 * turned 31 feet into an exact seven sticks.
 */
export const SURFACE_ROLE_DIVISIBILITY: { role: string; divisibility: Divisibility }[] = [
  // Rigid stock. Every turn ends a leg and starts a new one.
  { role: SURFACE_ROLES.channel, divisibility: "SEGMENTED_BY_TURNS" },
  // Fittings and boxes: bought whole, counted whole.
  { role: SURFACE_ROLES.joint, divisibility: "DISCRETE" },
  { role: SURFACE_ROLES.insideElbow, divisibility: "DISCRETE" },
  { role: SURFACE_ROLES.outsideElbow, divisibility: "DISCRETE" },
  { role: SURFACE_ROLES.flatElbow, divisibility: "DISCRETE" },
  { role: SURFACE_ROLES.end, divisibility: "DISCRETE" },
  { role: SURFACE_ROLES.transition, divisibility: "DISCRETE" },
  { role: SURFACE_ROLES.supportClip, divisibility: "DISCRETE" },
  { role: SURFACE_ROLES.deviceBox, divisibility: "DISCRETE" },
];

/**
 * Conductor divisibility is CONTINUOUS, and that distinction is the whole
 * reason Divisibility is not a boolean. Wire and channel are both bought by
 * length and both cut on site, but a corner BENDS wire and CUTS channel. So a
 * turned route leaves the channel's piece count unresolved while the
 * conductor's spool count stays exact.
 */
export const conductorDivisibility = (roles: string[]): { role: string; divisibility: Divisibility }[] =>
  roles.map((role) => ({ role, divisibility: "CONTINUOUS" as const }));

/**
 * The conductor specification gap, framed correctly.
 *
 * The obvious framing is "we do not know whether the circuit is 15A or 20A, so
 * ask the homeowner". The service's own routing says that is the wrong seam.
 * `outlet_load_type` continues ONLY for `everyday` — motor, heating, shop and
 * EV loads all reroute to other services — and `outlet_power_source` continues
 * ONLY for `tap_existing`, with a dedicated circuit rerouting too. So every job
 * that can reach this takeoff is one everyday load tapped off an existing
 * general-purpose branch circuit.
 *
 * Across that whole envelope a single conductor specification can be valid, so
 * the missing fact is not the homeowner's to supply — it is one configuration
 * the contractor makes once for the service. Asking every homeowner to read an
 * unfamiliar breaker would add a question, add a wrong-answer failure mode, and
 * still land on the spec the contractor would have chosen anyway.
 *
 * Which specification is valid is a licensed judgement about a real
 * jurisdiction, so the platform records the contractor's, and states that it is
 * missing until they make it. It does not pick a gauge.
 */
export const CONDUCTOR_SPECIFICATION_UNESTABLISHED: ConductorRequirement = {
  known: false,
  code: "CONDUCTOR_SPECIFICATION_NOT_ESTABLISHED",
  reason:
    "Every route reaching this takeoff is an everyday load tapped from an existing general-purpose branch circuit — the tree reroutes every other load type and every dedicated circuit — so one conductor specification can cover the whole envelope. That specification is the contractor's to configure once for the service, and none is configured, so no gauge and no conductor count is claimed.",
};

/**
 * The three electrical functions a 120V branch extension needs, one of each
 * — count: 1 reproduces this fixture's behavior from before `count` existed.
 */
export const conductorFunctions = (gauge: "14" | "12" | "10") => [
  { function: "ungrounded", role: `CONDUCTOR_THHN_${gauge}_UNGROUNDED`, count: 1 },
  { function: "grounded", role: `CONDUCTOR_THHN_${gauge}_GROUNDED`, count: 1 },
  { function: "equipment ground", role: `CONDUCTOR_THHN_${gauge}_EQUIPMENT_GROUND`, count: 1 },
];

/**
 * Declare every class this route requires.
 *
 * Corner classes are declared only when the route actually has that corner, so
 * the declaration tracks the real job rather than asserting a fixed shopping
 * list. Everything else is unconditional: a surface route always has channel,
 * always terminates, always needs supporting, always needs conductors.
 */
export function surfaceRacewayRequiredClasses(args: {
  components: SelectedComponent[];
  conductors: ConductorRequirement;
  /**
   * Classes a declared material system has ESTABLISHED, replacing the
   * unquantifiable stub of the same key.
   *
   * Replacement, never addition: the stub and the resolved form are two states
   * of one class, and letting both stand would declare the class twice and
   * leave it permanently unresolved however completely it was configured.
   */
  resolvedClasses?: RequiredClass[];
}): RequiredClass[] {
  const qty = (key: string) =>
    args.components.find((c) => c.key === key)?.quantity ?? 0;

  const classes: RequiredClass[] = [
    { classKey: "RACEWAY_CHANNEL", roles: [SURFACE_ROLES.channel],
      because: "The route is run in surface raceway; the channel is the run." },
    { classKey: "RACEWAY_STRAIGHT_JOINT", roles: [SURFACE_ROLES.joint],
      because: "Stock pieces laid end to end are joined where they meet." },
    { classKey: "DEVICE_BOX", roles: [SURFACE_ROLES.deviceBox],
      because: "The new outlet needs a box to land in." },
  ];

  if (qty("SURFACE_ROUTE_INSIDE_CORNER") > 0) {
    classes.push({ classKey: "RACEWAY_INSIDE_CORNER", roles: [SURFACE_ROLES.insideElbow],
      because: "The route turns into an internal corner." });
  }
  if (qty("SURFACE_ROUTE_OUTSIDE_CORNER") > 0) {
    classes.push({ classKey: "RACEWAY_OUTSIDE_CORNER", roles: [SURFACE_ROLES.outsideElbow],
      because: "The route turns around an external corner." });
  }
  if (qty("SURFACE_ROUTE_FLAT_CORNER") > 0) {
    classes.push({ classKey: "RACEWAY_FLAT_CORNER", roles: [SURFACE_ROLES.flatElbow],
      because: "The route changes direction in the plane of the wall." });
  }

  classes.push({
    classKey: "RACEWAY_TERMINATION",
    roles: [SURFACE_ROLES.end, SURFACE_ROLES.transition],
    because: "Both ends of the run terminate — into the existing device at the source and the new box at the outlet.",
    unquantifiable: {
      code: "END_FITTING_POLICY_NOT_ESTABLISHED",
      reason:
        "The run terminates at both ends, but which fitting each termination takes — a blank end, an entrance fitting into an existing enclosure, or a transition — depends on what is being entered, and no policy establishes it. Two terminations is the count; the kinds are not known, so no fitting is listed rather than picking one.",
    },
  });

  classes.push({
    classKey: "RACEWAY_SUPPORT",
    roles: [SURFACE_ROLES.supportClip],
    because: "Raceway is strapped to the wall at intervals along its length.",
    unquantifiable: {
      code: "SUPPORT_SPACING_NOT_ESTABLISHED",
      reason:
        "Support clips are certainly required, but the spacing interval is a product and jurisdiction fact that nobody has established, so a clip count cannot be derived from the route length. Omitting supports silently would have made the takeoff look complete while missing a material the job genuinely needs.",
    },
  });

  classes.push(
    args.conductors.known
      ? {
          classKey: "CONDUCTOR",
          roles: args.conductors.functions.map((f) => f.role),
          because: "A branch extension carries an ungrounded, a grounded and an equipment grounding conductor.",
        }
      : {
          classKey: "CONDUCTOR",
          roles: [],
          because: "A branch extension carries an ungrounded, a grounded and an equipment grounding conductor.",
          unquantifiable: { code: args.conductors.code, reason: args.conductors.reason },
        },
  );

  const resolved = new Map((args.resolvedClasses ?? []).map((c) => [c.classKey, c]));
  return classes.map((c) => resolved.get(c.classKey) ?? c);
}
