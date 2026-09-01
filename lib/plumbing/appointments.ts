/**
 * Three appointment shells, and one of them does not exist yet.
 *
 * A shell is what plumbing needs the Appointment model to CARRY, declared
 * separately from whether the platform can carry it today. Two of the three
 * map onto the existing AppointmentKind enum unchanged. The third does not,
 * and says so rather than being folded into the nearest existing value — a
 * service call recorded as PRE_WORK would make every "was the scope
 * verified" query wrong, and it would be wrong quietly.
 *
 * `platformKind: null` is therefore a deliberate refusal, not an omission. It
 * fails closed: nothing may schedule a shell that has no platform kind, and
 * scripts/verify-plumbing-template.ts asserts that no service depends on one.
 */

/** The values prisma/schema.prisma actually has today. */
export type PlatformAppointmentKind = "PRE_WORK" | "INSTALLATION";

export type PlumbingAppointmentShell = {
  key: "verification" | "installation" | "on_site_service";
  title: string;
  purpose: string;
  /** Null when the platform has no kind for this yet. See requiresSchemaChange. */
  platformKind: PlatformAppointmentKind | null;
  /** What must land in the shared schema before this shell can be scheduled. */
  requiresSchemaChange: string | null;
  /** What the shell blocks while it is outstanding. */
  blocks: "INSTALLATION" | "PRICING" | "NOTHING";
};

export const PLUMBING_APPOINTMENT_SHELLS: readonly PlumbingAppointmentShell[] = [
  {
    key: "verification",
    title: "Pre-work verification visit",
    purpose:
      "Confirms the house matches the bounded scope that was sold, before a water heater, gas line or repipe is executed. The visit never changes the price; reaching OUT_OF_SCOPE_REVIEW is what opens a change-approval conversation.",
    platformKind: "PRE_WORK",
    requiresSchemaChange: null,
    blocks: "INSTALLATION",
  },
  {
    key: "installation",
    title: "The work itself",
    purpose:
      "The installation appointment. Price2Book does not own second-stage scheduling in V1 — for a Jobber-connected contractor this is coordinated in their normal Jobber workflow — but the shell exists so the model does not have to change later.",
    platformKind: "INSTALLATION",
    requiresSchemaChange: null,
    blocks: "NOTHING",
  },
  {
    key: "on_site_service",
    title: "On-site service call",
    // Named for what happens — somebody attends — rather than for a conclusion
    // about why. "Diagnostic" would assert there is a fault to be found, which
    // is exactly what nobody has established yet.
    purpose:
      "Where an observed active failure is routed. Plumbing needs this as its own kind because a service call is a paid visit that PRODUCES a scope, not a verification of one that already exists — and a booking may legitimately have a service call AND, later, a pre-work verification of whatever the visit established.",
    platformKind: null,
    requiresSchemaChange:
      "prisma/schema.prisma: add SERVICE_CALL to enum AppointmentKind. Additive; the existing @@index([bookingId, kind]) already covers it. Electrical models this as a TroubleshootingSession with no Appointment row, so this is new behavior rather than a rename. Named SERVICE_CALL rather than DIAGNOSTIC: the enum value would outlive every rewording above it, and the platform should not learn plumbing's forbidden conclusion as a schema constant.",
    blocks: "PRICING",
  },
] as const;

/** True when the shell can actually be scheduled against today's schema. */
export function shellIsSchedulable(shell: PlumbingAppointmentShell): boolean {
  return shell.platformKind !== null;
}

export function appointmentShell(key: PlumbingAppointmentShell["key"]): PlumbingAppointmentShell {
  const found = PLUMBING_APPOINTMENT_SHELLS.find((s) => s.key === key);
  if (!found) throw new Error(`Unknown plumbing appointment shell "${key}".`);
  return found;
}
