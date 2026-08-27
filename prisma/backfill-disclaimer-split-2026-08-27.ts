/**
 * Split ConditionalDisclaimer into a canonical condition and contractor
 * policy — 27 August 2026. ADR-009.
 *
 *   npx tsx prisma/backfill-disclaimer-split-2026-08-27.ts            (report)
 *   npx tsx prisma/backfill-disclaimer-split-2026-08-27.ts --apply    (write)
 *
 * EXPAND PHASE. Additive: creates rows in two new tables and fills two columns
 * that are null everywhere. `ConditionalDisclaimer` is read but never written,
 * never deleted, and keeps every row.
 *
 * WHAT IT WRITES
 *
 *   CanonicalDisclaimer            one per existing ConditionalDisclaimer
 *   ContractorDisclaimer           one per (contractor, canonical) pair in use
 *   QuestionDisclaimer.contractorDisclaimerId
 *   AnswerOptionDisclaimer.contractorDisclaimerId
 *
 * No price, no material, no labor. It cannot move a customer's price. It CAN
 * change what a customer is told, which is why the verification below compares
 * resolved text for every attachment rather than trusting the copy.
 *
 * WHERE THE TEXT GOES, AND WHY
 *
 * `text` moves to the CONTRACTOR row, not the canonical one. The condition is
 * trade knowledge; the promise is policy. Elite says patching is not included;
 * another contractor may include it. One mutable shared field would mean
 * editing a disclaimer for one contractor changes what a different contractor
 * promises their homeowner.
 *
 * `accessClass` stays canonical — WHEN the statement applies is part of the
 * condition. `active` exists on both: the platform can retire a concept, and a
 * contractor can switch off their own statement independently.
 *
 * WHOSE POLICY IS IT
 *
 * Derived from the attachment, never assumed: a QuestionDisclaimer belongs to
 * a Question, which belongs to a Service, which has a contractor. An
 * attachment whose service has no contractor is a stop, not a row to skip.
 *
 * A disclaimer attached to nothing still gets an Elite row when Elite is the
 * only contractor — an unattached concept is a real catalog entry, and losing
 * it here would quietly delete work.
 *
 * Idempotent. Upserts by natural key, only fills null pointers, and the
 * contractor upsert's update branch is empty so a re-run cannot overwrite text
 * a contractor has since edited.
 */

import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`\nBACKFILL — disclaimer split (ADR-009)`);
  console.log(apply ? `  APPLYING\n` : `  Report only. Re-run with --apply.\n`);

  const legacy = await prisma.conditionalDisclaimer.findMany({
    orderBy: { key: "asc" },
    include: {
      questions: {
        select: {
          id: true,
          contractorDisclaimerId: true,
          question: { select: { service: { select: { slug: true, contractorId: true } } } },
        },
      },
      options: {
        select: {
          id: true,
          contractorDisclaimerId: true,
          answerOption: {
            select: {
              question: { select: { service: { select: { slug: true, contractorId: true } } } },
            },
          },
        },
      },
    },
  });

  if (legacy.length === 0) {
    console.error(`  No ConditionalDisclaimer rows. Nothing to split.\n`);
    process.exit(1);
    return;
  }

  // Every attachment must resolve to an owning contractor.
  const unowned: string[] = [];
  for (const d of legacy) {
    for (const q of d.questions) {
      if (!q.question.service.contractorId) unowned.push(`${d.key} <- question on ${q.question.service.slug}`);
    }
    for (const o of d.options) {
      if (!o.answerOption.question.service.contractorId) {
        unowned.push(`${d.key} <- answer on ${o.answerOption.question.service.slug}`);
      }
    }
  }
  if (unowned.length > 0) {
    console.error(
      `  ${unowned.length} attachment(s) hang off a service with no contractor, so\n` +
        `  whose policy the text is cannot be decided:\n` +
        unowned.map((u) => `      ${u}`).join("\n") +
        `\n\n  Run prisma/backfill-service-contractor-2026-08-25.ts first.\n`
    );
    process.exit(1);
    return;
  }

  const contractors = await prisma.contractor.findMany({ select: { id: true, slug: true } });
  const soleContractor = contractors.length === 1 ? contractors[0] : null;

  console.log(`  ${legacy.length} disclaimers, ${contractors.length} contractor(s)\n`);
  console.log(`  key                                  accessClass  active  qs  opts  owners`);
  console.log(`  ${"─".repeat(88)}`);

  /** contractorIds that attach to each disclaimer. */
  const ownersOf = new Map<string, Set<string>>();
  for (const d of legacy) {
    const set = new Set<string>();
    for (const q of d.questions) set.add(q.question.service.contractorId!);
    for (const o of d.options) set.add(o.answerOption.question.service.contractorId!);
    if (set.size === 0 && soleContractor) set.add(soleContractor.id);
    ownersOf.set(d.id, set);
    const slugs = [...set].map((id) => contractors.find((c) => c.id === id)?.slug ?? "?");
    console.log(
      `  ${d.key.padEnd(36)} ${String(d.accessClass ?? "—").padEnd(12)} ` +
        `${String(d.active).padEnd(7)} ${String(d.questions.length).padStart(2)} ` +
        `${String(d.options.length).padStart(5)}  ${slugs.join(", ")}`
    );
  }

  const pointed =
    legacy.reduce((n, d) => n + d.questions.filter((q) => q.contractorDisclaimerId).length, 0) +
    legacy.reduce((n, d) => n + d.options.filter((o) => o.contractorDisclaimerId).length, 0);
  const totalAttachments =
    legacy.reduce((n, d) => n + d.questions.length + d.options.length, 0);
  console.log(`\n  Attachments already pointed: ${pointed} of ${totalAttachments}`);

  if (!apply) {
    console.log(`\n  Nothing was changed. Re-run with --apply.\n`);
    return;
  }

  // ---- write -------------------------------------------------------------
  let canonicalWritten = 0;
  let contractorWritten = 0;
  const canonicalBySourceId = new Map<string, string>();
  const contractorRowBy = new Map<string, string>(); // `${contractorId}::${canonicalId}`

  for (const d of legacy) {
    const canonical = await prisma.canonicalDisclaimer.upsert({
      where: { key: d.key },
      // The CONCEPT is refreshed from the pre-split row, which is still the
      // source of truth until contract. No text — text is not canonical.
      update: { name: d.name, accessClass: d.accessClass, description: d.notes },
      create: {
        key: d.key,
        name: d.name,
        accessClass: d.accessClass,
        description: d.notes,
        active: true,
      },
    });
    canonicalBySourceId.set(d.id, canonical.id);
    canonicalWritten++;

    for (const contractorId of ownersOf.get(d.id)!) {
      const row = await prisma.contractorDisclaimer.upsert({
        where: {
          contractorId_canonicalDisclaimerId: {
            contractorId,
            canonicalDisclaimerId: canonical.id,
          },
        },
        // DELIBERATELY EMPTY. `text` is this contractor's promise to their
        // homeowner. A re-run must never overwrite wording they have edited.
        update: {},
        create: {
          contractorId,
          canonicalDisclaimerId: canonical.id,
          text: d.text,
          active: d.active,
          notes: d.notes,
        },
      });
      contractorRowBy.set(`${contractorId}::${canonical.id}`, row.id);
      contractorWritten++;
    }
  }

  // Repoint attachments at their own contractor's policy row.
  let repointed = 0;
  for (const d of legacy) {
    const canonicalId = canonicalBySourceId.get(d.id)!;
    for (const q of d.questions) {
      if (q.contractorDisclaimerId) continue;
      const id = contractorRowBy.get(`${q.question.service.contractorId}::${canonicalId}`);
      if (!id) {
        console.error(`\n  ${d.key}: no contractor row for its question attachment. Stopping.\n`);
        process.exitCode = 1;
        return;
      }
      await prisma.questionDisclaimer.update({
        where: { id: q.id },
        data: { contractorDisclaimerId: id },
      });
      repointed++;
    }
    for (const o of d.options) {
      if (o.contractorDisclaimerId) continue;
      const id = contractorRowBy.get(
        `${o.answerOption.question.service.contractorId}::${canonicalId}`
      );
      if (!id) {
        console.error(`\n  ${d.key}: no contractor row for its answer attachment. Stopping.\n`);
        process.exitCode = 1;
        return;
      }
      await prisma.answerOptionDisclaimer.update({
        where: { id: o.id },
        data: { contractorDisclaimerId: id },
      });
      repointed++;
    }
  }

  console.log(`\n  ${canonicalWritten} canonical concepts`);
  console.log(`  ${contractorWritten} contractor policy rows`);
  console.log(`  ${repointed} attachments repointed`);

  // ---- verify ------------------------------------------------------------
  const qNull = await prisma.questionDisclaimer.count({ where: { contractorDisclaimerId: null } });
  const oNull = await prisma.answerOptionDisclaimer.count({
    where: { contractorDisclaimerId: null },
  });
  console.log(`\n  VERIFY: ${qNull + oNull} attachment(s) still unpointed`);
  if (qNull + oNull > 0) {
    console.error(`\n  INCOMPLETE.\n`);
    process.exitCode = 1;
    return;
  }

  // What the homeowner is told must be byte-identical, per attachment.
  const qs = await prisma.questionDisclaimer.findMany({
    select: {
      id: true,
      disclaimer: { select: { key: true, text: true, active: true, accessClass: true } },
      contractorDisclaimer: {
        select: {
          text: true,
          active: true,
          canonicalDisclaimer: { select: { key: true, accessClass: true } },
        },
      },
    },
  });
  const os = await prisma.answerOptionDisclaimer.findMany({
    select: {
      id: true,
      disclaimer: { select: { key: true, text: true, active: true, accessClass: true } },
      contractorDisclaimer: {
        select: {
          text: true,
          active: true,
          canonicalDisclaimer: { select: { key: true, accessClass: true } },
        },
      },
    },
  });
  const all = [...qs, ...os];
  const drifted = all.filter((a) => {
    const c = a.contractorDisclaimer;
    if (!c) return true;
    return (
      c.text !== a.disclaimer.text ||
      c.active !== a.disclaimer.active ||
      c.canonicalDisclaimer.key !== a.disclaimer.key ||
      c.canonicalDisclaimer.accessClass !== a.disclaimer.accessClass
    );
  });
  console.log(
    `  VERIFY: ${all.length - drifted.length} of ${all.length} attachments resolve to ` +
      `identical text, active state, key and accessClass`
  );
  if (drifted.length > 0) {
    console.error(
      `\n  DRIFT on ${drifted.length} attachment(s):\n` +
        drifted.map((d) => `      ${d.disclaimer.key}`).join("\n") +
        `\n`
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\n  Done. ConditionalDisclaimer untouched; nothing reads the new rows yet.\n`);
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
