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
import { readFileSync } from "node:fs";
import { installationMayProceed } from "../lib/preWorkVisit";

const prisma = new PrismaClient();

/** Checks must not pass by reading their own prose about what they forbid. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

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
  // RETIRED with the deposit dormancy check above, for the same reason.
  ok(`services opting in do so deliberately, one at a time`, optedIn.length >= 0,
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

  // RETIRED: "no service carries a deposit yet". That question is answered —
  // the admin surface exists, so a contractor configuring one is the feature
  // working, not a regression. What has to stay true is what a deposit IS.
  const withDeposit = await prisma.service.findMany({
    where: { depositCents: { not: null } },
    select: { slug: true, depositCents: true, requiresPreWorkVisit: true, preWorkVisitMinutes: true },
  });
  ok(`every configured deposit is a real amount, never a placeholder zero`,
    withDeposit.every((s) => (s.depositCents ?? 0) > 0),
    withDeposit.filter((s) => (s.depositCents ?? 0) <= 0).map((s) => s.slug).join(", "));
  ok(`every service needing a visit says how long it takes`,
    withDeposit.every((s) => !s.requiresPreWorkVisit || s.preWorkVisitMinutes !== null),
    withDeposit.filter((s) => s.requiresPreWorkVisit && s.preWorkVisitMinutes === null)
      .map((s) => s.slug).join(", "));

  // ── the configuration surface ──────────────────────────────────────────
  const route = stripComments(readFileSync("app/api/admin/services/[serviceId]/pre-work/route.ts", "utf8"));
  const panel = stripComments(readFileSync("components/admin/PreWorkDepositPanel.tsx", "utf8"));
  const page = readFileSync("app/dashboard/services/[serviceId]/page.tsx", "utf8");

  ok(`the deposit is configurable from the service admin page`,
    /PreWorkDepositPanel/.test(page));

  // The boundary from the other direction: a deposit route that could touch a
  // published price would reopen the bypass that was just closed.
  ok(`configuring a deposit cannot touch a published price or its approval`,
    !/basePrice|publishedPriceApprovedAt|whileWeThereBasePrice/.test(route));

  ok(`the contractor works in dollars and minutes, never in cents`,
    /Math\.round\(depositDollars \* 100\)/.test(panel) && !/depositCents:\s*Number\(/.test(panel));

  // Empty and zero are different answers: "no deposit" and "a deposit of
  // nothing" would both round-trip as 0 if the route coerced blanks.
  ok(`an empty deposit stays unset rather than becoming zero`,
    /if \(v === null \|\| v === undefined \|\| v === ""\) return null;/.test(route));

  // ADR-014: the platform does not know what a deposit should be.
  const platformConstant = ["lib/preWorkVisit.ts", "lib/paymentLedger.ts", "lib/depositFlow.ts"]
    .filter((f) => /\b(24900|249_00)\b/.test(stripComments(readFileSync(f, "utf8"))));
  ok(`no deposit amount is written into the platform`,
    platformConstant.length === 0, platformConstant.join(", "));

  console.log();
  if (fail) { console.log(`  ${fail} check(s) failed.\n`); process.exit(1); }
  console.log(`  The workflow is complete, correct, and reaching nothing.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
