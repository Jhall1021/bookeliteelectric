/**
 * No published price rests on a cost nobody stands behind.
 *
 *   npx tsx scripts/verify-material-cost-holds.ts
 *
 * A role whose cost is marked STALE or ERROR is one somebody has said needs
 * reverifying. Building and deriving on it is fine — that is how development
 * continues while a supplier is chased. PUBLISHING on it is not: a published
 * price is a promise to a customer, and it should not be made out of a figure
 * the contractor has flagged as doubtful.
 *
 * This is deliberately a RECIPE query rather than a list of service slugs. A
 * service that starts consuming a held role tomorrow is caught tomorrow,
 * without anybody remembering to add it here.
 */

import { PrismaClient } from "@prisma/client";
import { heldRoles, servicesOnHold } from "../lib/materialHolds";

const prisma = new PrismaClient();

async function main() {
  console.log(`\nMATERIAL COST HOLDS\n`);

  const contractors = await prisma.contractor.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { slug: "asc" },
  });

  let violations = 0;
  for (const c of contractors) {
    const held = await heldRoles(prisma as any, c.id);
    if (held.length === 0) continue;

    console.log(`  ${c.name.trim()} — ${held.length} role(s) on hold:\n`);
    for (const h of held) {
      console.log(`      ${h.key.padEnd(28)} $${(h.unitCostCents / 100).toFixed(2)}  ${h.status}`);
      if (h.note) console.log(`          ${h.note}`);
    }
    console.log();

    const affected = await servicesOnHold(prisma as any, c.id);
    const publishedOnHold = affected.filter((s) => s.published);
    const unpublished = affected.filter((s) => !s.published);

    if (unpublished.length) {
      console.log(`      ${unpublished.length} unpublished service(s) build on them — fine, that is the point:`);
      for (const s of unpublished) console.log(`          ${s.slug}`);
      console.log();
    }

    if (publishedOnHold.length) {
      console.log(`      ✗ ${publishedOnHold.length} PUBLISHED service(s) rest on a held cost:`);
      for (const s of publishedOnHold) {
        console.log(`          ${s.slug}  (${s.heldRoles.map((h) => h.key).join(", ")})`);
      }
      console.log();
      violations += publishedOnHold.length;
    }
  }

  if (violations) {
    console.log(`  ${violations} published price(s) built on a cost flagged as doubtful.`);
    console.log(`  Either reverify the cost and clear the hold, or withdraw the price.\n`);
    process.exit(1);
  }

  console.log(`  ✓ No published price rests on a held cost.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
