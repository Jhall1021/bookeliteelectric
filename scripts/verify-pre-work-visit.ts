/**
 * The pre-work visit workflow exists and is dormant.
 *
 *   npx tsx scripts/verify-pre-work-visit.ts
 *
 * Two claims, and the second is the one that matters right now.
 *
 *   1. The GATING RULE is right, including every state that blocks.
 *   2. NOTHING IS USING IT. No service has opted in, no appointment or
 *      pre-work record exists, and every booking still carries the arrival
 *      window it always had.
 *
 * The workflow was built ahead of the payment capability it needs, on the
 * strength of `requiresPreWorkVisit` defaulting to false everywhere. That
 * argument is only as good as the fact, so the fact is checked rather than
 * asserted — this is what makes "it cannot have changed anything" a finding.
 */

import { PrismaClient } from "@prisma/client";
import { installationMayProceed } from "../lib/preWorkVisit";

const prisma = new PrismaClient();

let fail = 0;
function ok(label: string, cond: boolean, detail?: string) {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
}

async function main() {
  console.log(`\nPRE-WORK VISIT WORKFLOW\n`);
  console.log(`  THE GATING RULE\n`);

  const gated = (scopeState: any) =>
    installationMayProceed({
      requiresPreWorkVisit: true,
      installationRequiresPreWorkCompletion: true,
      scopeState,
    });

  ok(`a service without the workflow is never blocked`,
    installationMayProceed({ requiresPreWorkVisit: false, installationRequiresPreWorkCompletion: true, scopeState: null }).allowed);
  ok(`opted in but not gated -> allowed`,
    installationMayProceed({ requiresPreWorkVisit: true, installationRequiresPreWorkCompletion: false, scopeState: null }).allowed);
  ok(`gated with NO visit record -> blocked`, !gated(null).allowed,
    "a workflow that has not started is not a workflow that has passed");
  ok(`PENDING_VERIFICATION -> blocked`, !gated("PENDING_VERIFICATION").allowed);
  ok(`OUT_OF_SCOPE_REVIEW -> blocked`, !gated("OUT_OF_SCOPE_REVIEW").allowed);
  ok(`STANDARD_SCOPE_VERIFIED -> allowed`, gated("STANDARD_SCOPE_VERIFIED").allowed);
  ok(`EXCEPTION_RESOLVED -> allowed`, gated("EXCEPTION_RESOLVED").allowed);
  ok(`an unknown state blocks rather than falling through`, !gated("SOMETHING_NEW" as any).allowed);

  // Every state the enum defines must be decided, not defaulted.
  const STATES = ["PENDING_VERIFICATION", "STANDARD_SCOPE_VERIFIED", "OUT_OF_SCOPE_REVIEW", "EXCEPTION_RESOLVED"];
  const decided = STATES.filter((s) => !/unhandled/.test(gated(s).reason));
  ok(`all ${STATES.length} scope states are explicitly decided`, decided.length === STATES.length,
    `${STATES.length - decided.length} fall through`);

  console.log(`\n  DORMANT\n`);

  const optedIn = await prisma.service.findMany({
    where: { requiresPreWorkVisit: true },
    select: { slug: true, contractor: { select: { slug: true } } },
  });
  ok(`no service has opted in yet`, optedIn.length === 0,
    optedIn.map((s) => `${s.contractor.slug}/${s.slug}`).join(", "));

  const appointments = await prisma.appointment.count();
  const preWork = await prisma.preWorkVisit.count();
  ok(`no Appointment rows exist`, appointments === 0, String(appointments));
  ok(`no PreWorkVisit rows exist`, preWork === 0, String(preWork));

  // The expand-phase promise: the legacy field is untouched. A booking with a
  // null arrivalWindowId would mean the new model had started absorbing reads.
  const bookings = await prisma.booking.count();
  const withWindow = await prisma.booking.count({ where: { NOT: { arrivalWindowId: "" } } });
  ok(`all ${bookings} booking(s) still carry their original arrival window`,
    bookings === withWindow, `${bookings - withWindow} without one`);

  const deposits = await prisma.service.count({ where: { depositCents: { not: null } } });
  ok(`no service carries a deposit yet`, deposits === 0, String(deposits));

  console.log();
  if (fail) { console.log(`  ${fail} check(s) failed.\n`); process.exit(1); }
  console.log(`  The workflow is complete, correct, and reaching nothing.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
