/**
 * The disclaimer split's structural invariant — ADR-009 — and the secondary
 * tenant reference on AnswerOption — ADR-010.
 *
 *   npx tsx scripts/verify-disclaimer-integrity.ts
 *
 * READ ONLY. Counts and reads; writes nothing. Same reasoning as
 * verify-category-integrity.ts: this is a structural invariant production
 * reads REQUIRE, not a judgment about mutable data, so it belongs in the gate.
 *
 * WHAT MAKES THIS ONE WORTH GATING
 *
 * A disclaimer is a PROMISE TO A HOMEOWNER. The failure mode is not a 500 —
 * it is a customer being shown a commitment that belongs to a different
 * contractor. "Patching and painting are not included" rendered for a
 * contractor who does patch is a wrong answer that looks entirely correct.
 *
 * THE CHECK NO FOREIGN KEY CAN DO
 *
 * A QuestionDisclaimer points at a Question (hence a Service, hence a
 * contractor) AND at a ContractorDisclaimer (hence a contractor). Both columns
 * are individually valid while naming DIFFERENT contractors. Postgres cannot
 * express "these two must agree"; this can.
 */

import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

let fail = 0;
function ok(cond: boolean, label: string, detail = "") {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `\n${detail}`}`);
}

async function main() {
  console.log(`\nDISCLAIMER INTEGRITY — ADR-009 / ADR-010\n`);

  const totalQ = await prisma.questionDisclaimer.count();
  const totalO = await prisma.answerOptionDisclaimer.count();
  if (totalQ + totalO === 0) {
    console.log(`  No disclaimer attachments. Nothing to check.\n`);
    return;
  }

  // 1. Every attachment carries a contractor policy row.
  //
  // Now enforced by the DATABASE. The focused disclaimer-dependency release
  // made contractorDisclaimerId required and dropped the deprecated FK, so an
  // unpointed attachment cannot be stored. This asserts the CONSTRAINT rather
  // than counting rows: a check that queries for something the schema forbids
  // would pass forever without ever looking at anything, which is the shape of
  // a check that has quietly stopped working.
  const nullable = (await prisma.$queryRawUnsafe(
    `SELECT table_name t, is_nullable n FROM information_schema.columns
     WHERE table_name IN ('question_disclaimers','answer_option_disclaimers')
       AND column_name = 'contractorDisclaimerId' ORDER BY 1`
  )) as { t: string; n: string }[];
  const enforced = nullable.length === 2 && nullable.every((x) => x.n === "NO");
  ok(
    enforced,
    `all ${totalQ + totalO} attachments carry a contractor policy row — enforced by NOT NULL`,
    `      contractorDisclaimerId is nullable on: ` +
      nullable.filter((x) => x.n !== "NO").map((x) => x.t).join(", ") +
      `\n      An attachment with no contractor policy row could be stored again.`
  );
  const legacyGone = ((await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM information_schema.columns
     WHERE table_name IN ('question_disclaimers','answer_option_disclaimers')
       AND column_name = 'disclaimerId'`
  )) as { n: number }[])[0].n === 0;
  ok(legacyGone, "no attachment still depends on the deprecated ConditionalDisclaimer");

  // 2. THE ONE NO FOREIGN KEY CAN EXPRESS.
  //
  // The attachment's owning contractor, derived through the service tree, must
  // equal the contractor whose policy it renders. Two individually-valid
  // columns naming different tenants is a homeowner reading someone else's
  // commitment.
  const qs = await prisma.questionDisclaimer.findMany({
    select: {
      question: { select: { key: true, service: { select: { slug: true, contractorId: true } } } },
      contractorDisclaimer: {
        select: { contractorId: true, canonicalDisclaimer: { select: { key: true } } },
      },
    },
  });
  const os = await prisma.answerOptionDisclaimer.findMany({
    select: {
      answerOption: {
        select: {
          value: true,
          question: { select: { service: { select: { slug: true, contractorId: true } } } },
        },
      },
      contractorDisclaimer: {
        select: { contractorId: true, canonicalDisclaimer: { select: { key: true } } },
      },
    },
  });

  const crossed: string[] = [];
  for (const q of qs) {
    if (q.contractorDisclaimer && q.question.service.contractorId !== q.contractorDisclaimer.contractorId) {
      crossed.push(
        `${q.question.service.slug} / question "${q.question.key}" renders ` +
          `${q.contractorDisclaimer.canonicalDisclaimer.key} owned by another contractor`
      );
    }
  }
  for (const o of os) {
    const svc = o.answerOption.question.service;
    if (o.contractorDisclaimer && svc.contractorId !== o.contractorDisclaimer.contractorId) {
      crossed.push(
        `${svc.slug} / answer "${o.answerOption.value}" renders ` +
          `${o.contractorDisclaimer.canonicalDisclaimer.key} owned by another contractor`
      );
    }
  }
  ok(
    crossed.length === 0,
    `no attachment renders another contractor's promise (${qs.length + os.length} checked)`,
    crossed.map((c) => `      ${c}`).join("\n")
  );

  // 3. Every policy row resolves to a canonical condition. FK-protected, but
  //    checked for the reason the category audit checks its equivalent: a
  //    constraint you believe in but never test is one you are trusting.
  const policies = await prisma.contractorDisclaimer.findMany({
    select: { id: true, canonicalDisclaimer: { select: { key: true } } },
  });
  ok(
    policies.every((p) => p.canonicalDisclaimer !== null),
    `all ${policies.length} policy rows resolve to a canonical condition`
  );

  // 4. SECONDARY TENANT REFERENCE — ADR-010.
  //
  // Separate from primary ownership, and deliberately checked here rather than
  // assumed safe. AnswerOption.referencedServiceId points at ANOTHER service
  // whose price the option adopts at request time. Its ownership chain
  // (AnswerOption -> Question -> Service) can be entirely valid while the
  // REFERENCED service belongs to a different contractor — the guard's derived
  // filter constrains the owner, not the reference.
  //
  // The failure is a customer being quoted another contractor's price for an
  // add-on, which is a wrong number that looks like a right one.
  const refs = await prisma.answerOption.findMany({
    where: { referencedServiceId: { not: null } },
    select: {
      value: true,
      referencedService: { select: { slug: true, contractorId: true } },
      question: { select: { service: { select: { slug: true, contractorId: true } } } },
    },
  });
  const crossedRefs = refs.filter(
    (r) =>
      r.referencedService &&
      r.question.service.contractorId !== r.referencedService.contractorId
  );
  ok(
    crossedRefs.length === 0,
    `no answer option adopts another contractor's price (${refs.length} references)`,
    crossedRefs
      .map(
        (r) =>
          `      ${r.question.service.slug} / "${r.value}" references ` +
          `${r.referencedService?.slug}, owned by a different contractor`
      )
      .join("\n")
  );

  console.log(
    fail === 0
      ? `\n  Disclaimer structure is intact.\n`
      : `\n  ${fail} structural check(s) FAILED. A homeowner may be shown the wrong promise.\n`
  );
  process.exitCode = fail === 0 ? 0 : 1;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
