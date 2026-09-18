/**
 * Approves the master price book — the one construction-chain step
 * authorized to stamp publishedPriceApprovedAt.
 *
 *   npx tsx prisma/seed-master-price-book-approval.ts
 *
 * WHY THIS FILE EXISTS, SEPARATELY FROM THE FILES THAT CREATE THESE ROWS
 *
 * prisma/seed.ts's own CATALOG literals, prisma/seed-appliance-services.ts's
 * Replace Existing Range Hood, and prisma/seed-exterior-gfci-routing.ts's
 * exterior-gfci-other-routing all carry real, hand-set figures the owner
 * already decided — but each of those files deliberately refuses to also
 * stamp publishedPriceApprovedAt on its own output. Their own comments say
 * why: "a script vouching for its own number," and "approval happens in the
 * admin, or in one explicit reconciliation migration. Not here." That rule
 * predates scripts/install-price-approval-constraint.ts's CHECK constraint,
 * which now makes "priced, no publishedPriceApprovedAt" impossible to even
 * create as a transient row state — so a from-scratch build that skips this
 * step is stuck with every one of those services quote-only: never wrong,
 * but not the real catalog either, and at least one later seed
 * (seed-outlet-power-source.ts's own answer-option price labels) reads
 * basePrice expecting it to already be there.
 *
 * This file is that one explicit migration. It changes nothing about WHICH
 * figures are approved — every one is a literal already committed to
 * CATALOG (prisma/seed.ts) or hardcoded below, never computed or derived —
 * it only does, once, in the one place this codebase's own rule allows, what
 * the creating files themselves correctly refuse to do on their own output.
 *
 * NEVER OVERWRITES AN EXISTING DECISION. Every write below is gated on
 * publishedPriceApprovedAt currently being null for that service. A rerun
 * against an already-approved database — production, or a Preview
 * re-initialized without a full reset — changes nothing and reports so.
 *
 * Position in the construction chain: immediately after
 * prisma/seed-appliance-services.ts (see SEED_STEPS in
 * scripts/rehearse-fresh-electrical-launch.ts) — the earliest point every
 * service named below is guaranteed to already exist, and before
 * prisma/seed-outlet-power-source.ts, the first later seed confirmed to read
 * an approved basePrice.
 */

import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { CATALOG, c } from "./seed";
import { serviceSlugKey } from "./_serviceKey";

const prisma = new PrismaClient();

type PriceIntent = { slug: string; basePriceCents: number; whileWeThereBasePriceCents: number | null };

/** Every CATALOG service that carries a basePrice literal. */
const FROM_CATALOG: PriceIntent[] = CATALOG.flatMap((cat) =>
  cat.services
    .filter((svc) => svc.basePrice)
    .map((svc) => ({
      slug: svc.slug,
      basePriceCents: c(svc.basePrice as number),
      whileWeThereBasePriceCents: svc.whileWeThereBasePrice ? c(svc.whileWeThereBasePrice) : null,
    }))
);

/**
 * The two services established outside CATALOG itself, by files that
 * (correctly) stopped setting these fields on their own output — see their
 * own comments at the point they used to. Figures copied verbatim from
 * there, not re-derived.
 */
const FROM_OTHER_CONSTRUCTION_FILES: PriceIntent[] = [
  // prisma/seed-appliance-services.ts — Replace Existing Range Hood.
  { slug: "replace-range-hood", basePriceCents: 37500, whileWeThereBasePriceCents: null },
  // prisma/seed-exterior-gfci-routing.ts — exterior-gfci-other-routing.
  { slug: "exterior-gfci-other-routing", basePriceCents: 46000, whileWeThereBasePriceCents: 39500 },
];

const INTENTS: PriceIntent[] = [...FROM_CATALOG, ...FROM_OTHER_CONSTRUCTION_FILES];

async function main() {
  console.log("Approving the master price book...\n");

  let approved = 0;
  let skippedAlready = 0;
  let skippedMissing = 0;

  for (const intent of INTENTS) {
    const service = await prisma.service.findUnique({
      where: await serviceSlugKey(prisma, intent.slug),
      select: { id: true, basePrice: true, publishedPriceApprovedAt: true },
    });
    if (!service) {
      console.log(`  – ${intent.slug}: not in the catalog, skipped`);
      skippedMissing++;
      continue;
    }
    if (service.publishedPriceApprovedAt !== null) {
      console.log(`  – ${intent.slug}: already approved ${service.publishedPriceApprovedAt.toISOString()}, left unchanged`);
      skippedAlready++;
      continue;
    }

    await prisma.service.update({
      where: { id: service.id },
      data: {
        basePrice: intent.basePriceCents,
        whileWeThereBasePrice: intent.whileWeThereBasePriceCents,
        publishedPriceApprovedAt: new Date(),
      },
    });
    console.log(`  ✓ ${intent.slug}: approved at $${(intent.basePriceCents / 100).toFixed(2)}`);
    approved++;
  }

  console.log(`\n  ${approved} approved, ${skippedAlready} already approved, ${skippedMissing} not in the catalog.\n`);

  const remaining = await prisma.service.count({
    where: { basePrice: { not: null }, publishedPriceApprovedAt: null },
  });
  if (remaining > 0) {
    console.error(`  ${remaining} service(s) still carry a price with no approval — services_price_requires_approval will refuse them.\n`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
