/**
 * The pre-work visit workflow's one rule, as a function.
 *
 * A fixed-price job that needs physical verification before installation:
 * booked online at the sold price, deposit taken, verification visit
 * scheduled, permit and prerequisites started, installation coordinated after.
 *
 * THE VISIT NEVER CHANGES THE PRICE.
 *
 * That is the whole product promise and it is worth stating as code rather
 * than as prose in a disclaimer. If the homeowner answered the qualification
 * questions accurately and the home fits the bounded scope Price2Book sold,
 * the booked price is the price. A technician standing in the driveway is not
 * a renegotiation, and a workflow that quietly allowed one would turn every
 * fixed price into an estimate with extra steps.
 *
 * What the visit CAN do is discover a condition genuinely outside that scope.
 * That is a different event, it has a name, and it blocks installation until a
 * person resolves it — rather than adjusting a number and moving on.
 */

import type { PreWorkScopeState } from "@prisma/client";

/**
 * May the installation be scheduled?
 *
 * Pure, and takes the service's own setting rather than assuming it: a service
 * MAY opt into the visit without gating installation on it, and that is a
 * contractor's decision to make.
 */
export function installationMayProceed(args: {
  requiresPreWorkVisit: boolean;
  installationRequiresPreWorkCompletion: boolean;
  scopeState: PreWorkScopeState | null;
}): { allowed: boolean; reason: string } {
  const { requiresPreWorkVisit, installationRequiresPreWorkCompletion, scopeState } = args;

  // The ordinary case, and every service in the catalog today.
  if (!requiresPreWorkVisit) {
    return { allowed: true, reason: "this service has no pre-work visit" };
  }
  if (!installationRequiresPreWorkCompletion) {
    return { allowed: true, reason: "the visit is required but does not gate installation" };
  }
  // Opted in, gated, and no visit record — that is a workflow that has not
  // started, not a workflow that has passed.
  if (scopeState === null) {
    return { allowed: false, reason: "no pre-work visit has been recorded yet" };
  }

  switch (scopeState) {
    case "STANDARD_SCOPE_VERIFIED":
      return { allowed: true, reason: "the home matches the scope that was sold" };
    case "EXCEPTION_RESOLVED":
      return { allowed: true, reason: "an out-of-scope condition was found and resolved" };
    case "PENDING_VERIFICATION":
      return { allowed: false, reason: "the pre-work visit has not been completed" };
    case "OUT_OF_SCOPE_REVIEW":
      return { allowed: false, reason: "an out-of-scope condition is unresolved" };
    default: {
      // A state nobody has taught this function about blocks, rather than
      // falling through to allowed. Adding a state should require deciding
      // what it means here.
      const exhaustive: never = scopeState;
      return { allowed: false, reason: `unhandled scope state: ${String(exhaustive)}` };
    }
  }
}

/**
 * What the customer is told the deposit is, and is not. Shared by every
 * service that takes one — the deposit promise does not vary by trade.
 */
export const DEPOSIT_SENTENCE = (depositCents: number) =>
  `A $${(depositCents / 100).toFixed(0)} deposit is required when booking and will be ` +
  `applied toward your project.`;

/**
 * WHAT COMES AFTER IT IS PER-SERVICE, and lives on `Service.preWorkCustomerNote`.
 *
 * It was one constant, which meant every pre-work service promised "we'll begin
 * the permit process". That is true of a 200-amp service upgrade and is NOT
 * something to promise for every panel replacement, where permit handling
 * varies. A promise that holds for one service is not a platform constant, and
 * the moment it is written as one it gets made to customers it was never
 * true for.
 */
