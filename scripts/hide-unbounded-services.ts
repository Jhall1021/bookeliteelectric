/**
 * Four services leave the public catalogue — 29 August 2026.
 *
 *   npx tsx scripts/hide-unbounded-services.ts          report
 *   npx tsx scripts/hide-unbounded-services.ts --apply  hide
 *
 * These are the "hide" pile from the Phase F eligibility report. Each is a
 * real service Elite really sells. None of them has a bounded standard job
 * inside it waiting to be found — they are genuinely custom, and the honest
 * thing is to stop listing them next to services that quote themselves.
 *
 * Manufacturing a weak starting price for these would be worse than hiding
 * them. A starting price is a promise about scope; where there is no bounded
 * scope, the number is a guess wearing a promise.
 *
 * HIDDEN, NOT DELETED. `active: false` takes a service out of the catalogue
 * and out of search while leaving it reachable by direct reference, so the
 * office can still put one on a visit and a narrowed version can be brought
 * back later. Nothing here is destroyed and nothing is repriced.
 */

import { PrismaClient } from "@prisma/client";
import { serviceSlugKey } from "../prisma/_serviceKey";

const prisma = new PrismaClient();

const HIDE: { slug: string; why: string; toRevisit: string }[] = [
  {
    slug: "pool-equipment-electrical",
    why:
      "Pump, heater, salt cell and light circuits are four different jobs " +
      "sharing a name, and which of them a customer means changes the work " +
      "more than any answer a form could collect.",
    toRevisit:
      "Comes back as a narrowed service — 'pool pump circuit', bonded and " +
      "within reach of an existing panel — rather than as this one.",
  },
  {
    slug: "transfer-switch",
    why:
      "A whole-house transfer switch is sized to the generator and the load " +
      "calculation, and the switch itself is most of the cost. There is no " +
      "standard one.",
    toRevisit:
      "Generator Inlet + Interlock is the bounded version of this need and is " +
      "in the Phase F rescue set. If a standard switch and generator pairing " +
      "emerges, that becomes its own service.",
  },
  {
    slug: "outdoor-landscape-lighting",
    why:
      "Priced by fixture count, run length and transformer size, none of " +
      "which exist until someone has walked the property.",
    toRevisit:
      "A bounded package is possible — a transformer and a fixed number of " +
      "path lights on one run — but that is a product decision, not a " +
      "pricing one.",
  },
  {
    slug: "new-exterior-lighting-locations",
    why:
      "'New locations' is unbounded by definition: the count is unknown, the " +
      "power source is unknown, and the wall construction decides the labour.",
    toRevisit:
      "replace-exterior-light-fixture already covers the bounded case. A " +
      "single new exterior location with defined access could join it.",
  },
];

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`\nLEAVING THE PUBLIC CATALOGUE — 29 August 2026\n`);

  let changed = 0;
  for (const h of HIDE) {
    const svc = await prisma.service.findUnique({
      where: await serviceSlugKey(prisma, h.slug),
      select: { id: true, name: true, active: true, basePrice: true, bookingType: true },
    });
    if (!svc) {
      console.log(`  ! ${h.slug} not in the catalogue — skipped\n`);
      continue;
    }

    // Hiding a service that has a price is a different decision — that is
    // withdrawing a product, not declining to fake one. Not this script's job.
    if (svc.basePrice !== null) {
      console.log(`  ! ${h.slug} has a published price ($${(svc.basePrice / 100).toFixed(0)}).`);
      console.log(`      Withdrawing a priced service is a product decision. Not touched.\n`);
      continue;
    }

    console.log(`  ${svc.name.trim()}`);
    console.log(`      ${svc.active ? "public" : "already hidden"} · ${svc.bookingType} · no price`);
    console.log(`      ${h.why}`);
    console.log(`      LATER: ${h.toRevisit}\n`);

    if (apply && svc.active) {
      await prisma.service.update({ where: { id: svc.id }, data: { active: false } });
      changed++;
    }
  }

  if (!apply) {
    console.log(`  Report only. Re-run with --apply to hide.\n`);
    return;
  }
  console.log(`  ✓ ${changed} service(s) hidden. Nothing deleted, nothing repriced.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
