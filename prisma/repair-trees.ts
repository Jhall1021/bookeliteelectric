/**
 * Diagnose — and optionally repair — broken decision trees.
 *
 *   npx tsx prisma/repair-trees.ts            report only
 *   npx tsx prisma/repair-trees.ts --apply    fix what it can
 *
 * Reports two faults across every service:
 *
 *   DANGLING   an answer says "continue" but points at a question that no
 *              longer exists. nextQuestionId has no foreign key, so the
 *              database allows it. The flow engine fails safe by resolving to
 *              a price — meaning the customer skips the rest of the tree and
 *              gets quoted for work nobody qualified.
 *
 *   UNREACHABLE  a question nothing routes to. Customers never see it.
 *
 * Repair points dangling answers at the first unreachable question, which is
 * what the id-churn bug produced: a module recreated with fresh ids while the
 * answers still referenced the old ones. Where that guess doesn't apply, it
 * reports and leaves the tree alone rather than inventing a route.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");

  const services = await prisma.service.findMany({
    orderBy: { slug: "asc" },
    include: { questions: { orderBy: { order: "asc" }, include: { options: true } } },
  });

  let totalDangling = 0;
  let totalUnreachable = 0;
  let totalFixed = 0;

  for (const service of services) {
    if (service.questions.length === 0) continue;
    const liveIds = new Set(service.questions.map((q) => q.id));

    const dangling = service.questions.flatMap((q) =>
      q.options
        .filter(
          (o) =>
            o.routeAction === "CONTINUE" &&
            (!o.nextQuestionId || !liveIds.has(o.nextQuestionId))
        )
        .map((o) => ({ question: q.key, option: o }))
    );

    const reachable = new Set<string>([service.questions[0].id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const q of service.questions) {
        if (!reachable.has(q.id)) continue;
        for (const o of q.options) {
          if (o.routeAction === "CONTINUE" && o.nextQuestionId && !reachable.has(o.nextQuestionId)) {
            reachable.add(o.nextQuestionId);
            changed = true;
          }
        }
      }
    }
    const unreachable = service.questions.filter((q) => !reachable.has(q.id));

    if (dangling.length === 0 && unreachable.length === 0) continue;

    console.log(`\n${service.name}  (${service.slug})`);
    for (const d of dangling) {
      console.log(`   DANGLING     ${d.question} → "${d.option.label}"`);
    }
    for (const u of unreachable) {
      console.log(`   UNREACHABLE  ${u.key} — "${u.prompt}"`);
    }
    totalDangling += dangling.length;
    totalUnreachable += unreachable.length;

    // The id-churn signature: answers orphaned by a module that was deleted
    // and recreated, with that module now sitting unreachable. Pointing the
    // orphans at it restores the intended route.
    if (apply && dangling.length > 0 && unreachable.length > 0) {
      const target = unreachable[0];
      await prisma.answerOption.updateMany({
        where: { id: { in: dangling.map((d) => d.option.id) } },
        data: { nextQuestionId: target.id },
      });
      console.log(`   -> repaired ${dangling.length} answer(s) to point at "${target.key}"`);
      totalFixed += dangling.length;
    } else if (apply && dangling.length > 0) {
      console.log(`   -> NOT repaired: no unreachable question to point at. Needs a look.`);
    }
  }

  console.log(`\n${"-".repeat(60)}`);
  console.log(`dangling: ${totalDangling}   unreachable: ${totalUnreachable}`);
  if (!apply) {
    console.log(`\nReport only. Re-run with --apply to repair.\n`);
  } else {
    console.log(`repaired: ${totalFixed}\n`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
