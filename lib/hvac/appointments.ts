/**
 * The one HVAC appointment shell — H1.
 *
 * HVAC needs exactly one shell in this slice: the service call
 * `hvac-service-call` books, using the shared G2/G3 architecture. Mirrors
 * lib/plumbing/appointments.ts's `on_site_service` shell, which mirrors it
 * for exactly the same reason — a service call is a paid visit that
 * PRODUCES a scope, not a verification of one that already exists.
 *
 * NOT MIRRORED: plumbing's other two shells (`verification` / PRE_WORK, and
 * `installation` / INSTALLATION). Neither is approved or needed for H1 —
 * inventing them now would be modeling appointment kinds nobody has asked
 * HVAC to have yet.
 */

/** The values prisma/schema.prisma actually has today. */
export type PlatformAppointmentKind = "PRE_WORK" | "INSTALLATION" | "SERVICE_CALL";

export type HvacAppointmentShell = {
  key: "on_site_service";
  title: string;
  purpose: string;
  platformKind: PlatformAppointmentKind;
  /** What the shell blocks while a scope has not yet been established. */
  blocks: "PRICING";
};

export const HVAC_SERVICE_CALL_SHELL: HvacAppointmentShell = {
  key: "on_site_service",
  title: "HVAC service call",
  // Named for what happens — somebody attends — rather than for a
  // conclusion about why. "Diagnostic" asserts there is a fault to be
  // found, which is exactly what the governing invariant forbids assuming.
  purpose:
    "Where an unresolved symptom or an unbounded scope converges. A technician attends, at a known visit price, and establishes what the work is. Predicting the repair is not a promise Price2Book makes.",
  // Already schedulable — G3 shipped SERVICE_CALL to prisma/schema.prisma
  // before HVAC's H1. Unlike plumbing/appointments.ts when it was written,
  // there is no `requiresSchemaChange: string | null` here: nothing to
  // wait on.
  platformKind: "SERVICE_CALL",
  blocks: "PRICING",
};

/** True while the platform can actually schedule this shell. Always true
 * today — kept as a function, not a literal, so a caller checks the fact
 * rather than assuming it. */
export function hvacServiceCallIsSchedulable(): boolean {
  return HVAC_SERVICE_CALL_SHELL.platformKind !== null;
}
