/**
 * Chandelier — restore the derived price it was meant to carry.
 *
 *   npx tsx scripts/publish-chandelier-price.ts          report
 *   npx tsx scripts/publish-chandelier-price.ts --apply  publish
 *
 * `remove-and-replace-existing-chandelier` is the only service in the
 * catalog carrying an owner approval stamp with no price behind it:
 *
 *     active  ADJUSTED  basePrice NULL  publishedPriceApprovedAt 24 Aug
 *
 * Everything else about it is sound. It has 2.0 crew-hours, an itemized
 * recipe (BOX_FAN_RATED x1, CONSUMABLES_SMALL x1 = $21 fully resolved), a
 * three-question tree, and height/access branches that route correctly to
 * review. Exactly one route is meant to price — and it returns INVALID,
 * because the price it was approved for is not in the row.
 *
 * That price was derived once already, in prisma/reconcile-scope-services.ts
 * on 23 August, and stamped on 24 August 91ms before its sibling in the same
 * loop. The sibling kept its money; this one did not. This script does not
 * trust that arithmetic — it re-derives through lib/pricing.ts and refuses
 * if the engine disagrees with what was approved.
 *
 * Same figure standalone and same-visit. Nothing about the job gets shorter
 * because a crew is already at the house: the ladder still goes up, the old
 * fixture still comes down piece by piece, the new one still gets assembled
 * and levelled. wwtLaborHours is 2.0 for that reason, so the engine produces
 * the same number twice on its own.
 */

import { PrismaClient } from "@prisma/client";
import { suggestPrimaryPrice, suggestWwtPrice, type PricingSettings } from "../lib/pricing";
import { serviceSlugKey } from "../prisma/_serviceKey";

const prisma = new PrismaClient();

const SLUG = "remove-and-replace-existing-chandelier";

/** What the 23 Aug reconciliation approved. The engine must reproduce it. */
const APPROVED_CENTS = 53000;

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`\nCHANDELIER — DERIVED PRICE\n`);

  const svc = await prisma.service.findUnique({
    where: await serviceSlugKey(prisma, SLUG),
    select: {
      id: true, name: true, contractorId: true, active: true, bookingType: true,
      basePrice: true, whileWeThereBasePrice: true, publishedPriceApprovedAt: true,
      fieldLaborHours: true, wwtLaborHours: true, requiresTechCount: true,
      materialCostCents: true, materialMultiplier: true, permitAdminCents: true,
      otherDirectCostCents: true, isPrimaryEligible: true,
      materials: {
        select: {
          quantity: true,
          canonicalMaterial: { select: { key: true, unit: true } },
        },
      },
    },
  });
  if (!svc) {
    console.error(`  ${SLUG} is not in the catalog.\n`);
    process.exit(1);
  }

  // An existing published price is owner data. This script restores a missing
  // one; it is not licensed to move one that is already there.
  if (svc.basePrice !== null || svc.whileWeThereBasePrice !== null) {
    console.log(`  ${svc.name.trim()} already carries a published price:`);
    console.log(`      standalone $${((svc.basePrice ?? 0) / 100).toFixed(2)}`);
    console.log(`      same-visit $${((svc.whileWeThereBasePrice ?? 0) / 100).toFixed(2)}`);
    console.log(`\n  Nothing to restore. Repricing is a reconciliation decision.\n`);
    return;
  }

  if (svc.fieldLaborHours === null || svc.wwtLaborHours === null) {
    console.error(`  No crew-hours recorded. Refusing to publish a price with`);
    console.error(`  no labor behind it — that is the defect, not the fix.\n`);
    process.exit(1);
  }

  const settings = (await prisma.pricingSettings.findUnique({
    where: { contractorId: svc.contractorId },
  })) as PricingSettings | null;
  if (!settings) {
    console.error(`  This contractor has no pricing settings. Refusing to price\n`);
    console.error(`  against another contractor's labor rate.\n`);
    process.exit(1);
  }

  const inputs = {
    fieldLaborHours: svc.fieldLaborHours,
    wwtLaborHours: svc.wwtLaborHours,
    requiresTechCount: svc.requiresTechCount,
    materialCostCents: svc.materialCostCents,
    materialMultiplier: svc.materialMultiplier,
    permitAdminCents: svc.permitAdminCents,
    otherDirectCostCents: svc.otherDirectCostCents,
    isPrimaryEligible: svc.isPrimaryEligible,
  };

  const primary = suggestPrimaryPrice(inputs, settings);
  const wwt = suggestWwtPrice(inputs, settings);

  console.log(`  ${svc.name.trim()}`);
  console.log(`      ${svc.active ? "active" : "inactive"}  ${svc.bookingType}`);
  console.log(`      recipe: ${svc.materials.map((m) => `${m.canonicalMaterial?.key ?? "?"} x${m.quantity}`).join(", ") || "(none)"}`);
  console.log();
  console.log(`      ${svc.fieldLaborHours} crew-hours          $${(primary.laborCents / 100).toFixed(2)}`);
  console.log(`      material @ ${primary.multiplierUsed}x        $${(primary.materialCents / 100).toFixed(2)}   ($${((svc.materialCostCents ?? 0) / 100).toFixed(2)} direct)`);
  if (primary.permitCents) console.log(`      permit                 $${(primary.permitCents / 100).toFixed(2)}`);
  if (primary.otherCents) console.log(`      other                  $${(primary.otherCents / 100).toFixed(2)}`);
  console.log(`                            --------`);
  console.log(`      standalone             $${(primary.totalCents / 100).toFixed(2)}`);
  console.log(`      same-visit             $${(wwt.totalCents / 100).toFixed(2)}`);
  if (primary.minimumApplied) console.log(`      (service-call minimum applied)`);
  console.log();

  // The approval on this row is dated. If the engine no longer reproduces the
  // figure that approval was given for, a cost has moved since — and this
  // stops being a restore and becomes a pricing change, which is not ours.
  if (primary.totalCents !== APPROVED_CENTS) {
    console.log(`  REFUSE — the engine derives $${(primary.totalCents / 100).toFixed(2)}, but the standing`);
    console.log(`           approval on this row is for $${(APPROVED_CENTS / 100).toFixed(2)}.`);
    console.log();
    console.log(`  A cost has moved since 23 August. Restoring the approved figure`);
    console.log(`  would publish a price the model no longer explains; publishing the`);
    console.log(`  derived one would be a pricing change nobody approved. Not written.\n`);
    process.exit(1);
  }

  console.log(`  Engine agrees with the standing approval: $${(APPROVED_CENTS / 100).toFixed(2)}.`);
  console.log();

  if (!apply) {
    console.log(`  Report only. Re-run with --apply to publish.\n`);
    return;
  }

  await prisma.service.update({
    where: { id: svc.id },
    data: {
      basePrice: primary.totalCents,
      whileWeThereBasePrice: wwt.totalCents,
    },
  });

  // The approval stamp already on the row is the one this price was given
  // under, and it is still the right date. Restamping it would relabel a
  // 23 August decision as a decision made today.
  console.log(`  Published. Approval stamp left at ${svc.publishedPriceApprovedAt?.toISOString().slice(0, 10)} — that`);
  console.log(`  is when this price was decided, and today is not.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
