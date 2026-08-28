/**
 * Reconciliation migration — 23 August 2026.
 *
 *   npx tsx prisma/reconcile-2026-08-23.ts          report
 *   npx tsx prisma/reconcile-2026-08-23.ts --apply  publish
 *
 * THIS IS THE EXCEPTION.
 *
 * Every other seed is forbidden from touching a published customer price —
 * that's what _priceGuard.ts enforces, and it exists because seeds were
 * quietly repricing services nobody had decided to reprice.
 *
 * This file is the sanctioned alternative: a named, dated migration carrying
 * prices the owner approved explicitly, in writing, one at a time. It sets
 * publishedPriceApprovedAt because the approval is real — not because a
 * calculation produced a number it liked.
 *
 * Each entry below records WHO approved it and WHY, because in six months the
 * only thing distinguishing this from the workbook import will be that this
 * one wrote its reasons down.
 *
 * Only the prices listed here move. Everything else is untouched.
 */

import { PrismaClient } from "@prisma/client";
import { serviceSlugKey } from "./_serviceKey";

const prisma = new PrismaClient();

type Change = {
  slug: string;
  basePrice?: number;
  whileWeThereBasePrice?: number;
  why: string;
};

const APPROVED: Change[] = [
  {
    slug: "dedicated-120v-circuit-outlet",
    basePrice: 68500,
    whileWeThereBasePrice: 68500,
    why:
      "Owner-approved 23 Aug. 2.5 crew-hours both ways plus $46 of materials. " +
      "The same-visit price was $170 — a quarter of standalone — which was a " +
      "legacy figure treating an add-on as a discount category. Nothing about " +
      "this job shrinks when the van is already outside: the run, the breaker, " +
      "the box, the terminations and the testing all happen in full.",
  },
  {
    slug: "whole-house-surge-protection",
    basePrice: 60000,
    whileWeThereBasePrice: 53500,
    why:
      "Owner-approved 23 Aug. $218 of real materials — protector $142, trim " +
      "kit $58, double-pole breaker $18 — against an old $175 allowance that " +
      "missed the trim kit entirely. 1.25 / 1.0 crew-hours.",
  },
  {
    slug: "electrical-troubleshooting",
    basePrice: 24900,
    why:
      "Owner-approved. $249 is the published diagnostic product and always " +
      "was; the database held $250 because the seed that set it was stripped " +
      "of price-writing when the guard went in. Correcting the record, not " +
      "changing the price.",
  },
];

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`\nRECONCILIATION — 23 August 2026\n`);
  console.log(`  ${APPROVED.length} owner-approved price change(s)\n`);

  const now = new Date();
  let applied = 0;

  for (const c of APPROVED) {
    const svc = await prisma.service.findUnique({
      where: await serviceSlugKey(prisma, c.slug),
      select: { id: true, name: true, basePrice: true, whileWeThereBasePrice: true },
    });
    if (!svc) {
      console.log(`  ! ${c.slug} not in the catalog — skipped\n`);
      continue;
    }

    const lines: string[] = [];
    if (c.basePrice !== undefined && svc.basePrice !== c.basePrice) {
      lines.push(
        `standalone $${(svc.basePrice ?? 0) / 100} -> $${c.basePrice / 100}`
      );
    }
    if (
      c.whileWeThereBasePrice !== undefined &&
      svc.whileWeThereBasePrice !== c.whileWeThereBasePrice
    ) {
      lines.push(
        `same-visit $${(svc.whileWeThereBasePrice ?? 0) / 100} -> $${c.whileWeThereBasePrice / 100}`
      );
    }

    if (lines.length === 0) {
      console.log(`  · ${svc.name.trim()} — already at the approved price\n`);
      continue;
    }

    console.log(`  ${svc.name.trim()}`);
    for (const l of lines) console.log(`      ${l}`);
    console.log(`      ${c.why}\n`);

    if (apply) {
      await prisma.service.update({
        where: { id: svc.id },
        data: {
          ...(c.basePrice !== undefined ? { basePrice: c.basePrice } : {}),
          ...(c.whileWeThereBasePrice !== undefined
            ? { whileWeThereBasePrice: c.whileWeThereBasePrice }
            : {}),
          // Legitimate here, and only here: a person decided each of these.
          publishedPriceApprovedAt: now,
        },
      });
      applied++;
    }
  }

  if (!apply) {
    console.log(`  Report only. Re-run with --apply to publish.\n`);
    return;
  }

  console.log(`  ✓ ${applied} service(s) published and stamped as approved.\n`);
  console.log(`  Re-run the reconciliation to confirm these now read as MATCH.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
