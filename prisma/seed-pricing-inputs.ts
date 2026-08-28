/**
 * RETIRED — DO NOT RUN. 23 August 2026.
 *
 * This file is kept for historical reference only. Running it would reverse
 * most of the August pricing work.
 *
 * Everything in it describes a model that no longer exists:
 *
 *   primaryLaborUnits / addOnLaborUnits
 *       Superseded by fieldLaborHours and wwtLaborHours, which are CREW-hours
 *       — one van carrying a lead and a helper. The old units were never
 *       measured; they were back-fitted from prices.
 *
 *   materialMultiplier of 3.0 / 2.5 / 1.75
 *       Superseded by a progressive markup: 30% of the first $750, 20% above,
 *       applied once to the assembled package. The old banded rule had a cliff
 *       where a cost RISE of two cents dropped the customer's price by $17.
 *
 *   a $225 primary minimum
 *       Now $250, and a floor on every first service rather than only those
 *       under an hour.
 *
 *   the prices themselves
 *       Reconciled on 23 August against real crew-hours and itemized
 *       materials, through a named owner-approved migration. 98 of 98
 *       model-priced services match. This file would undo that.
 *
 * It is not in seed-all.ts and must not be added. If you need the historical
 * figures, read them here; do not execute them.
 *
 * The guard below makes running it an explicit, deliberate act rather than an
 * accident of tab-completion.
 */

if (!process.argv.includes("--i-know-this-is-retired")) {
  console.error(`
  This seed is RETIRED and would undo the August pricing reconciliation.

  It writes labor units, material multipliers and prices from the model that
  was replaced: 3x material markup, a $225 minimum, and back-fitted labor.

  Current pricing comes from:
      prisma/seed-labor-hours.ts        crew-hours
      prisma/seed-materials.ts          itemized materials
      prisma/reconcile-price-book.ts    owner-approved published prices

  If you genuinely need to run this, pass --i-know-this-is-retired.
`);
  process.exit(1);
}

/**
 * BookEliteElectric.com — pricing composition import
 * Imports labor units + material cost data from the client's validated
 * Excel pricing engine (v3) into the live database, so the admin panel's
 * "Recalculate All Prices" feature has real per-service data to work with
 * instead of only ever storing the final computed dollar amount.
 *
 * This does NOT change any live price by running it — it only populates
 * the composition fields. Prices only change when an admin explicitly
 * clicks "Recalculate" in /admin/pricing-settings.
 *
 * Run with: npx tsx prisma/seed-pricing-inputs.ts
 */

import { PrismaClient } from "@prisma/client";
import { eliteContractorId } from "./_componentHelpers";

const prisma = new PrismaClient();

const INPUTS: {
  slug: string;
  primaryLaborUnits: number;
  addOnLaborUnits: number;
  materialCostCents: number;
  materialMultiplier: number;
  permitAdminCents: number;
}[] = [
  { slug: "replace-standard-outlet", primaryLaborUnits: 0.75, addOnLaborUnits: 0.25, materialCostCents: 600, materialMultiplier: 3, permitAdminCents: 0 },
  { slug: "replace-gfci-outlet", primaryLaborUnits: 0.9, addOnLaborUnits: 0.4, materialCostCents: 2700, materialMultiplier: 2.5, permitAdminCents: 0 },
  { slug: "replace-standard-switch", primaryLaborUnits: 0.75, addOnLaborUnits: 0.25, materialCostCents: 400, materialMultiplier: 3, permitAdminCents: 0 },
  { slug: "replace-3-way-switch", primaryLaborUnits: 0.9, addOnLaborUnits: 0.4, materialCostCents: 400, materialMultiplier: 3, permitAdminCents: 0 },
  { slug: "replace-led-dimmer", primaryLaborUnits: 0.9, addOnLaborUnits: 0.4, materialCostCents: 3200, materialMultiplier: 2.5, permitAdminCents: 0 },
  { slug: "customer-supplied-smart-switch", primaryLaborUnits: 1, addOnLaborUnits: 0.5, materialCostCents: 0, materialMultiplier: 1, permitAdminCents: 0 },
  { slug: "usb-outlet-upgrade", primaryLaborUnits: 0.9, addOnLaborUnits: 0.4, materialCostCents: 3700, materialMultiplier: 2.5, permitAdminCents: 0 },
  { slug: "smart-outlet-upgrade", primaryLaborUnits: 1, addOnLaborUnits: 0.5, materialCostCents: 6200, materialMultiplier: 2.5, permitAdminCents: 0 },
  { slug: "occupancy-motion-switch", primaryLaborUnits: 1, addOnLaborUnits: 0.5, materialCostCents: 4200, materialMultiplier: 2.5, permitAdminCents: 0 },
  { slug: "timer-switch-install", primaryLaborUnits: 1, addOnLaborUnits: 0.5, materialCostCents: 6200, materialMultiplier: 2.5, permitAdminCents: 0 },
  { slug: "new-120v-outlet", primaryLaborUnits: 1.5, addOnLaborUnits: 1, materialCostCents: 2180, materialMultiplier: 3, permitAdminCents: 0 },
  { slug: "exterior-gfci-standard", primaryLaborUnits: 1.5, addOnLaborUnits: 1, materialCostCents: 5000, materialMultiplier: 2.5, permitAdminCents: 0 },
  { slug: "garage-door-opener-outlet", primaryLaborUnits: 1.5, addOnLaborUnits: 1, materialCostCents: 2180, materialMultiplier: 3, permitAdminCents: 0 },
  { slug: "bidet-smart-toilet-outlet", primaryLaborUnits: 1.5, addOnLaborUnits: 1, materialCostCents: 2180, materialMultiplier: 3, permitAdminCents: 0 },
  { slug: "replace-interior-light-fixture", primaryLaborUnits: 1, addOnLaborUnits: 0.6, materialCostCents: 0, materialMultiplier: 1, permitAdminCents: 0 },
  { slug: "replace-exterior-light-fixture", primaryLaborUnits: 1.1, addOnLaborUnits: 0.65, materialCostCents: 0, materialMultiplier: 1, permitAdminCents: 0 },
  { slug: "replace-motion-flood-light", primaryLaborUnits: 1.15, addOnLaborUnits: 0.65, materialCostCents: 0, materialMultiplier: 1, permitAdminCents: 0 },
  { slug: "recessed-lighting", primaryLaborUnits: 1.5, addOnLaborUnits: 0.75, materialCostCents: 0, materialMultiplier: 1, permitAdminCents: 0 },
  { slug: "new-ceiling-light", primaryLaborUnits: 1.5, addOnLaborUnits: 1, materialCostCents: 0, materialMultiplier: 1, permitAdminCents: 0 },
  { slug: "replace-ceiling-fan", primaryLaborUnits: 1.5, addOnLaborUnits: 1, materialCostCents: 0, materialMultiplier: 1, permitAdminCents: 0 },
  { slug: "new-ceiling-fan", primaryLaborUnits: 1.75, addOnLaborUnits: 1.25, materialCostCents: 0, materialMultiplier: 1, permitAdminCents: 0 },
  { slug: "fan-replacing-light", primaryLaborUnits: 1.75, addOnLaborUnits: 1.25, materialCostCents: 0, materialMultiplier: 1, permitAdminCents: 0 },
  { slug: "bathroom-fan-light-combo", primaryLaborUnits: 2.25, addOnLaborUnits: 1.75, materialCostCents: 0, materialMultiplier: 1, permitAdminCents: 0 },
  { slug: "tv-installation", primaryLaborUnits: 2, addOnLaborUnits: 1.5, materialCostCents: 0, materialMultiplier: 1, permitAdminCents: 0 },
  { slug: "tv-install-existing-location", primaryLaborUnits: 1.25, addOnLaborUnits: 0.9, materialCostCents: 0, materialMultiplier: 1, permitAdminCents: 0 },
  { slug: "elite-tilt-mount", primaryLaborUnits: 0, addOnLaborUnits: 0, materialCostCents: 5000, materialMultiplier: 2.5, permitAdminCents: 0 },
  { slug: "elite-articulating-mount", primaryLaborUnits: 0, addOnLaborUnits: 0, materialCostCents: 10000, materialMultiplier: 2, permitAdminCents: 0 },
  { slug: "otr-microwave-install", primaryLaborUnits: 1.5, addOnLaborUnits: 1, materialCostCents: 0, materialMultiplier: 1, permitAdminCents: 0 },
  { slug: "install-new-microwave", primaryLaborUnits: 2, addOnLaborUnits: 1.5, materialCostCents: 0, materialMultiplier: 1, permitAdminCents: 0 },
  { slug: "dishwasher-electrical", primaryLaborUnits: 1.1, addOnLaborUnits: 0.75, materialCostCents: 0, materialMultiplier: 1, permitAdminCents: 0 },
  { slug: "garbage-disposal-install", primaryLaborUnits: 1, addOnLaborUnits: 0.7, materialCostCents: 0, materialMultiplier: 1, permitAdminCents: 0 },
  { slug: "range-receptacle-replacement", primaryLaborUnits: 1.25, addOnLaborUnits: 0.85, materialCostCents: 0, materialMultiplier: 1, permitAdminCents: 0 },
  { slug: "dryer-receptacle-replacement", primaryLaborUnits: 1.25, addOnLaborUnits: 0.85, materialCostCents: 0, materialMultiplier: 1, permitAdminCents: 0 },
  { slug: "hardwired-smoke-detector", primaryLaborUnits: 0.75, addOnLaborUnits: 0.3, materialCostCents: 2500, materialMultiplier: 3, permitAdminCents: 0 },
  { slug: "smoke-co-detector", primaryLaborUnits: 0.85, addOnLaborUnits: 0.35, materialCostCents: 6000, materialMultiplier: 2.5, permitAdminCents: 0 },
  { slug: "whole-house-surge-protection", primaryLaborUnits: 1.5, addOnLaborUnits: 1, materialCostCents: 17500, materialMultiplier: 1.75, permitAdminCents: 0 },
  { slug: "home-electrical-safety-inspection", primaryLaborUnits: 1.5, addOnLaborUnits: 1.25, materialCostCents: 0, materialMultiplier: 1, permitAdminCents: 0 },
  { slug: "video-doorbell-existing-wiring", primaryLaborUnits: 1, addOnLaborUnits: 0.6, materialCostCents: 0, materialMultiplier: 1, permitAdminCents: 0 },
  { slug: "floodlight-camera-existing", primaryLaborUnits: 1.15, addOnLaborUnits: 0.7, materialCostCents: 0, materialMultiplier: 1, permitAdminCents: 0 },
  { slug: "smart-thermostat-install", primaryLaborUnits: 1, addOnLaborUnits: 0.6, materialCostCents: 0, materialMultiplier: 1, permitAdminCents: 0 },
  { slug: "doorbell-transformer-replacement", primaryLaborUnits: 1.1, addOnLaborUnits: 0.7, materialCostCents: 1500, materialMultiplier: 3, permitAdminCents: 0 },
  { slug: "single-pole-breaker-replacement", primaryLaborUnits: 1, addOnLaborUnits: 0.45, materialCostCents: 1000, materialMultiplier: 3, permitAdminCents: 0 },
  { slug: "double-pole-breaker-replacement", primaryLaborUnits: 1.15, addOnLaborUnits: 0.55, materialCostCents: 2500, materialMultiplier: 3, permitAdminCents: 0 },
  { slug: "electrical-troubleshooting", primaryLaborUnits: 1, addOnLaborUnits: 0, materialCostCents: 0, materialMultiplier: 1, permitAdminCents: 0 },
  { slug: "garage-door-opener-outlet-ev", primaryLaborUnits: 1.5, addOnLaborUnits: 1, materialCostCents: 2180, materialMultiplier: 3, permitAdminCents: 0 },
];

async function main() {
  console.log(`Importing pricing composition for ${INPUTS.length} validated services...`);

  for (const input of INPUTS) {
    await prisma.service.update({
      where: { slug: input.slug },
      data: {
        primaryLaborUnits: input.primaryLaborUnits,
        addOnLaborUnits: input.addOnLaborUnits,
        materialCostCents: input.materialCostCents,
        materialMultiplier: input.materialMultiplier,
        permitAdminCents: input.permitAdminCents,
      },
    });
  }
  console.log("  ✓ Composition data imported for all 45 services.");

  // Initialize the global settings at $250/hr — the rate the site's
  // CURRENT live prices already reflect (from the last repricing round),
  // not the workbook's own default of $300. Getting this wrong would mean
  // the very first "Recalculate" click jumps prices back up unexpectedly.
  // Keyed on the contractor, not on a literal id: seeding must never reach
  // another contractor's settings row.
  const seedContractorId = await eliteContractorId(prisma);
  await prisma.pricingSettings.upsert({
    where: { contractorId: seedContractorId },
    update: {}, // don't overwrite if already configured
    create: {
      contractorId: seedContractorId,
      targetRateCents: 25000, // $250.00/hr
      primaryMinimumCents: 22500, // $225.00
      roundingIncrementCents: 500, // $5.00
      defaultPermitAdminCents: 0,
    },
  });
  console.log("  ✓ Pricing settings initialized at $250/hr (matching current live prices).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
