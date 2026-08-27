/**
 * Split JobComponent into CanonicalComponent + ContractorComponent.
 *
 *   npx tsx prisma/migrate-component-split-2026-08-26.ts            (report)
 *   npx tsx prisma/migrate-component-split-2026-08-26.ts --apply    (write)
 *
 * EXPAND PHASE. Copies data forward. Deletes nothing, changes no existing
 * row's meaning, and leaves every current read path working.
 *
 * WHY
 *
 * JobComponent carries approvedPriceCents, addMaterialCostCents and three
 * timing fields on a model with no owner. Those are Elite's economics sitting
 * on a shared definition — the same problem materials had before their split,
 * and the reason a second contractor would silently inherit Elite's $190
 * finished-route charge.
 *
 *   canonical   what the component MEANS   key, name, label
 *   contractor  what it COSTS and how long price, material, hours, minutes,
 *                                           crew size
 *
 * The timings go to the contractor deliberately. FINISHED_ROUTE adds 0.75
 * hours because that is how long fishing through finished walls takes ELITE.
 * Another contractor takes a different amount. Pace is not a fact about the
 * work.
 *
 * SAME SHAPE AS THE MATERIAL SPLIT
 *
 * Batched into a handful of queries rather than a loop of round trips — the
 * material migration timed out that way against a remote database, and the
 * transaction rolled back whole. Repointing is a single UPDATE ... FROM
 * joined on the key, because updateMany cannot set a different value per row.
 *
 * Idempotent. Re-running finds the rows present and reports no work.
 */

import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CONTRACTOR_SLUG = "elite-electric";

const $ = (c: number | null | undefined) =>
  c === null || c === undefined ? "not approved" : `$${(c / 100).toFixed(2)}`;

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`\nCOMPONENT SPLIT — expand phase`);
  console.log(apply ? `  APPLYING\n` : `  Report only. Re-run with --apply.\n`);

  const contractor = await prisma.contractor.findUnique({
    where: { slug: CONTRACTOR_SLUG },
    select: { id: true, name: true },
  });
  if (!contractor) {
    console.error(`  No contractor "${CONTRACTOR_SLUG}".\n`);
    process.exit(1);
    return;
  }

  const components = await prisma.jobComponent.findMany({
    orderBy: { key: "asc" },
    include: { options: { select: { id: true } } },
  });

  if (components.length === 0) {
    console.error(`  No components found. Nothing to migrate.\n`);
    process.exit(1);
    return;
  }

  const badKeys = components.filter((c) => !c.key || !c.key.trim());
  if (badKeys.length) {
    console.error(`  STOPPING — ${badKeys.length} component(s) have no key.\n`);
    process.exit(1);
    return;
  }

  const attachments = components.reduce((n, c) => n + c.options.length, 0);
  const unapproved = components.filter((c) => c.approvedPriceCents === null);

  console.log(`  ${components.length} component(s) to split`);
  console.log(`  ${await prisma.canonicalComponent.count()} canonical already present`);
  console.log(`  ${attachments} answer-option attachment(s) to repoint\n`);

  for (const c of components.slice(0, 5)) {
    console.log(`  ${c.key}`);
    console.log(`      canonical   ${c.name}`);
    console.log(
      `      Elite       ${$(c.approvedPriceCents)}` +
        `  ${c.addFieldLaborHours} hr` +
        `  ${$(c.addMaterialCostCents)} material` +
        `  ${c.addScheduleMinutes} min`
    );
  }
  if (components.length > 5) console.log(`  ...and ${components.length - 5} more\n`);

  if (unapproved.length) {
    // Not a blocker — null is a meaningful state meaning "goes to review".
    // Worth surfacing because after the split it will mean the same thing per
    // contractor, and a second contractor starts with all of them unpriced.
    console.log(
      `\n  ${unapproved.length} component(s) have no approved price. That is a\n` +
        `  valid state — routes selecting them go to review. It carries across\n` +
        `  unchanged.`
    );
  }

  if (!apply) {
    console.log(`\n  Nothing was changed. Re-run with --apply.\n`);
    return;
  }

  const result = await prisma.$transaction(
    async (tx) => {
      // 1. Identity -> canonical.
      await tx.canonicalComponent.createMany({
        data: components.map((c) => ({
          key: c.key,
          name: c.name,
          customerFacingLabel: c.customerFacingLabel,
          active: c.active,
          notes: c.notes,
        })),
        skipDuplicates: true,
      });

      const canonicals = await tx.canonicalComponent.findMany({
        where: { key: { in: components.map((c) => c.key) } },
        select: { id: true, key: true },
      });
      const idByKey = new Map(canonicals.map((c) => [c.key, c.id]));

      const missing = components.filter((c) => !idByKey.has(c.key));
      if (missing.length) {
        throw new Error(
          `Canonical rows missing for: ${missing.map((m) => m.key).join(", ")}`
        );
      }

      // 2. Economics -> contractor.
      await tx.contractorComponent.createMany({
        data: components.map((c) => ({
          contractorId: contractor.id,
          canonicalComponentId: idByKey.get(c.key)!,
          addFieldLaborHours: c.addFieldLaborHours,
          addMaterialCostCents: c.addMaterialCostCents,
          addScheduleMinutes: c.addScheduleMinutes,
          addTechCount: c.addTechCount,
          approvedPriceCents: c.approvedPriceCents,
          active: c.active,
          notes: c.notes,
        })),
        skipDuplicates: true,
      });

      // 3. Answer options point at the ROLE. One statement, joined on key.
      const repointed: number = await tx.$executeRaw`
        UPDATE "answer_option_components" aoc
        SET "canonicalComponentId" = cc."id"
        FROM "job_components" jc
        JOIN "canonical_components" cc ON cc."key" = jc."key"
        WHERE aoc."componentId" = jc."id"
          AND aoc."canonicalComponentId" IS NULL
      `;

      return {
        canonicalCreated: canonicals.length,
        contractorCreated: components.length,
        repointed,
      };
    },
    { timeout: 120_000, maxWait: 20_000 }
  );

  const canonicalTotal = await prisma.canonicalComponent.count();
  const contractorTotal = await prisma.contractorComponent.count();
  const unlinked = await prisma.answerOptionComponent.count({
    where: { canonicalComponentId: null },
  });

  console.log(`\n  MIGRATED — read back from the database:\n`);
  console.log(`      contractor            ${contractor.name}`);
  console.log(`      canonical components  ${canonicalTotal}`);
  console.log(`      contractor components ${contractorTotal}`);
  console.log(`      attachments repointed ${result.repointed}`);
  console.log(`      still unlinked        ${unlinked}`);

  if (unlinked > 0) {
    console.error(
      `\n  ${unlinked} attachment(s) still have no canonical link. Do NOT\n` +
        `  proceed to the contract phase — removing JobComponent would orphan\n` +
        `  them.\n`
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\n  Nothing was removed. JobComponent and every read path are intact.`);
  console.log(`  Next: npm run db:reconcile — must still be 108 of 108.\n`);
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
