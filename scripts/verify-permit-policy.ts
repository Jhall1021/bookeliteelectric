/**
 * Permit fees are named, not buried.
 *
 *   npx tsx scripts/verify-permit-policy.ts
 *
 * Two claims:
 *
 *   1. No service carries a permit allowance in its price unless it is on the
 *      explicit include list. A fee set by a jurisdiction does not belong
 *      inside a figure that claims to describe the work.
 *   2. Every service that talks about permits uses the SAME sentence. Six
 *      slightly different wordings is six things to keep in step, and a
 *      customer comparing two services should meet the same words.
 */

import { PrismaClient } from "@prisma/client";
import {
  PERMIT_DISCLAIMER, PERMIT_INCLUDED_DISCLAIMER, MENTIONS_PERMIT, PERMIT_INCLUDED_SLUGS,
} from "../lib/permitPolicy";

const prisma = new PrismaClient();

let fail = 0;
function ok(label: string, cond: boolean, detail?: string) {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `\n        ${detail}`}`);
}

async function main() {
  console.log(`\nPERMIT POLICY\n`);

  const services = await prisma.service.findMany({
    select: { slug: true, active: true, permitAdminCents: true, disclaimer: true, contractor: { select: { slug: true } } },
    orderBy: { slug: "asc" },
  });

  // 1 — nothing buries a permit fee in the price
  const withAllowance = services.filter(
    (s) => (s.permitAdminCents ?? 0) > 0 && !PERMIT_INCLUDED_SLUGS.includes(s.slug)
  );
  ok(
    `no service carries an unlisted permit allowance (${services.length} checked)`,
    withAllowance.length === 0,
    withAllowance.map((s) => `${s.slug}: $${((s.permitAdminCents ?? 0) / 100).toFixed(2)}`).join(", ")
  );

  // 1b — a promise of exclusion must be backed by an explicit zero.
  //
  // permitAdminCents is nullable and a null inherits the contractor's
  // defaultPermitAdminCents. So a service that SAYS the fee is excluded while
  // leaving the field unset would start including one the moment that default
  // moved, with its disclaimer still saying otherwise. Zero is a decision;
  // null is the absence of one.
  const promisesExcluded = services.filter((s) => s.disclaimer?.includes(PERMIT_DISCLAIMER));
  const unsetButPromising = promisesExcluded.filter((s) => s.permitAdminCents === null);
  ok(
    `every service promising no permit sets the allowance to an explicit 0 (${promisesExcluded.length} promise it)`,
    unsetButPromising.length === 0,
    unsetButPromising.map((s) => s.slug).join(", ")
  );

  // 2 — one sentence, verbatim
  const talkAboutPermits = services.filter((s) => s.disclaimer && MENTIONS_PERMIT.test(s.disclaimer));
  const paraphrased = talkAboutPermits.filter(
    (s) => !s.disclaimer!.includes(PERMIT_DISCLAIMER) && !PERMIT_INCLUDED_SLUGS.includes(s.slug)
  );
  ok(
    `every service that mentions permits uses the standard sentence (${talkAboutPermits.length} mention it)`,
    paraphrased.length === 0,
    paraphrased.map((s) => s.slug).join(", ")
  );

  // A service on the include list must say so, or the default sentence and the
  // price contradict each other.
  const included = services.filter((s) => PERMIT_INCLUDED_SLUGS.includes(s.slug));
  for (const s of included) {
    // The list and the price must agree. A slug listed as including a permit
    // but carrying no allowance is a promise with nothing behind it.
    ok(
      `${s.slug} carries a real permit allowance`,
      (s.permitAdminCents ?? 0) > 0,
      `on the include list with $${((s.permitAdminCents ?? 0) / 100).toFixed(2)}`
    );
    ok(
      `${s.slug} says the permit is included`,
      Boolean(s.disclaimer?.includes(PERMIT_INCLUDED_DISCLAIMER)),
      `disclaimer does not carry the included sentence`
    );
    // Opposite promises. One service must not make both.
    ok(
      `${s.slug} does not also say permits are excluded`,
      !s.disclaimer?.includes(PERMIT_DISCLAIMER),
      `carries BOTH the included and the excluded sentence`
    );
  }

  console.log();
  if (fail) { console.log(`  ${fail} check(s) failed.\n`); process.exit(1); }
  console.log(`  Every permit fee is either named or excluded, in one voice, and no`);
  console.log(`  service says both.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
