/**
 * Give every configuration row an owner — 25 August 2026.
 *
 *   npx tsx prisma/backfill-config-contractor-2026-08-25.ts            (report)
 *   npx tsx prisma/backfill-config-contractor-2026-08-25.ts --apply    (write)
 *
 * EXPAND PHASE. Sets a column that was null. Nothing is removed, no loader
 * changes, and no read path is switched — that comes after this is verified.
 *
 * WHAT AND WHY
 *
 * Five configuration models had no tenant dimension at all. Four of them —
 * pricing settings, business hours, material settings, the Jobber connection
 * — were single rows keyed on the literal id `"default"`, which encodes the
 * assumption that there is exactly one business. Service areas were read with
 * no contractor filter at all.
 *
 * The danger was never that these break under multi-tenancy. It is that they
 * DON'T: an unscoped read returns whichever row the database hands back, so
 * contractor B gets priced at contractor A's crew rate and validated against
 * contractor A's service area. No error, no warning.
 *
 * WHAT IT DOES NOT TOUCH
 *
 * No pricing formula, published price, labor figure, material rule or
 * reconciliation behaviour. Reconcile must read 108 of 108 before and after.
 *
 * The `"default"` id is left alone deliberately. Removing that dependency is
 * the contract phase, after the loaders take a contractor.
 */

import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CONTRACTOR_SLUG = "elite-electric";

type Row = { label: string; total: number; unowned: number; foreign: number };

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`\nBACKFILL — configuration ownership`);
  console.log(apply ? `  APPLYING\n` : `  Report only. Re-run with --apply.\n`);

  const contractor = await prisma.contractor.findUnique({
    where: { slug: CONTRACTOR_SLUG },
    select: { id: true, name: true },
  });
  if (!contractor) {
    console.error(`No contractor "${CONTRACTOR_SLUG}".\n`);
    process.exit(1);
    return;
  }

  const owned = { contractorId: contractor.id };
  const rows: Row[] = [
    {
      label: "PricingSettings",
      total: await prisma.pricingSettings.count(),
      unowned: await prisma.pricingSettings.count({ where: { contractorId: null } }),
      foreign: await prisma.pricingSettings.count({
        where: { contractorId: { not: null, notIn: [contractor.id] } },
      }),
    },
    {
      label: "BusinessHours",
      total: await prisma.businessHours.count(),
      unowned: await prisma.businessHours.count({ where: { contractorId: null } }),
      foreign: await prisma.businessHours.count({
        where: { contractorId: { not: null, notIn: [contractor.id] } },
      }),
    },
    {
      label: "ContractorMaterialSettings",
      total: await prisma.contractorMaterialSettings.count(),
      unowned: await prisma.contractorMaterialSettings.count({ where: { contractorId: null } }),
      foreign: await prisma.contractorMaterialSettings.count({
        where: { contractorId: { not: null, notIn: [contractor.id] } },
      }),
    },
    {
      label: "JobberConnection",
      total: await prisma.jobberConnection.count(),
      unowned: await prisma.jobberConnection.count({ where: { contractorId: null } }),
      foreign: await prisma.jobberConnection.count({
        where: { contractorId: { not: null, notIn: [contractor.id] } },
      }),
    },
    {
      label: "ServiceArea",
      total: await prisma.serviceArea.count(),
      unowned: await prisma.serviceArea.count({ where: { contractorId: null } }),
      foreign: await prisma.serviceArea.count({
        where: { contractorId: { not: null, notIn: [contractor.id] } },
      }),
    },
  ];

  console.log(`  owner: ${contractor.name}\n`);
  console.log(`  ${"model".padEnd(28)}${"rows".padStart(6)}${"to assign".padStart(12)}`);
  for (const r of rows) {
    console.log(`  ${r.label.padEnd(28)}${String(r.total).padStart(6)}${String(r.unowned).padStart(12)}`);
  }

  // A row already owned by someone else is never reassigned. Impossible with
  // one contractor — but a backfill that could quietly take over another
  // contractor's configuration is not one worth writing.
  const foreign = rows.filter((r) => r.foreign > 0);
  if (foreign.length) {
    console.error(`\nSTOPPING — rows already belong to a different contractor:`);
    for (const r of foreign) console.error(`    ${r.label}: ${r.foreign}`);
    console.error(`\nNothing was changed.\n`);
    process.exit(1);
    return;
  }

  // The four singletons must hold at most one row each, or the unique
  // constraint on contractorId will reject the backfill. Better to say so
  // here than to have Postgres say it halfway through.
  const singletons = rows.filter((r) => r.label !== "ServiceArea");
  const tooMany = singletons.filter((r) => r.total > 1);
  if (tooMany.length) {
    console.error(`\nSTOPPING — more than one row in a one-per-contractor model:`);
    for (const r of tooMany) console.error(`    ${r.label}: ${r.total}`);
    console.error(
      `\nEach of these must resolve to a single contractor's configuration.\n` +
        `Decide which row is Elite's before assigning ownership.\n`
    );
    process.exit(1);
    return;
  }

  // A missing configuration row is worth naming now. Once the loaders require
  // a contractor, an absent row becomes a hard failure at booking time rather
  // than a silent default — which is the intended behaviour, but only if the
  // row is created deliberately at onboarding.
  const missing = rows.filter((r) => r.label !== "ServiceArea" && r.total === 0);
  if (missing.length) {
    console.log(`\n  Note — no row exists for: ${missing.map((m) => m.label).join(", ")}`);
    console.log(`  Nothing to assign there. Onboarding must create these.`);
  }

  const toAssign = rows.reduce((n, r) => n + r.unowned, 0);
  if (toAssign === 0) {
    console.log(`\n  Nothing to do — every configuration row already has an owner.\n`);
    return;
  }

  if (!apply) {
    console.log(`\n  ${toAssign} row(s) would be assigned. Nothing was changed.\n`);
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const a = await tx.pricingSettings.updateMany({ where: { contractorId: null }, data: owned });
    const b = await tx.businessHours.updateMany({ where: { contractorId: null }, data: owned });
    const c = await tx.contractorMaterialSettings.updateMany({
      where: { contractorId: null },
      data: owned,
    });
    const d = await tx.jobberConnection.updateMany({ where: { contractorId: null }, data: owned });
    const e = await tx.serviceArea.updateMany({ where: { contractorId: null }, data: owned });
    return {
      pricingSettings: a.count,
      businessHours: b.count,
      materialSettings: c.count,
      jobberConnection: d.count,
      serviceAreas: e.count,
    };
  });

  // Read back rather than reprinting what was sent.
  const stillUnowned =
    (await prisma.pricingSettings.count({ where: { contractorId: null } })) +
    (await prisma.businessHours.count({ where: { contractorId: null } })) +
    (await prisma.contractorMaterialSettings.count({ where: { contractorId: null } })) +
    (await prisma.jobberConnection.count({ where: { contractorId: null } })) +
    (await prisma.serviceArea.count({ where: { contractorId: null } }));

  console.log(`\n  ASSIGNED — read back from the database:\n`);
  for (const [k, v] of Object.entries(result)) {
    console.log(`      ${k.padEnd(20)} ${v}`);
  }
  console.log(`      ${"still unowned".padEnd(20)} ${stillUnowned}`);

  if (stillUnowned > 0) {
    console.error(
      `\n  Some configuration rows still have no owner. Do not switch the\n` +
        `  loaders — a row with no contractor cannot be resolved safely.\n`
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\n  No pricing formula, published price or labor figure was touched.`);
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
