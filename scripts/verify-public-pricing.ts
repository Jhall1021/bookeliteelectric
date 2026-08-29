/**
 * §1.4 — a public service shows a real starting price, or it is not public.
 *
 *   npx tsx scripts/verify-public-pricing.ts
 *
 * "Get a quote" in the price slot is not a starting price. It is the absence
 * of one, formatted. A customer scanning a catalogue is comparing numbers, and
 * a service that opts out of that comparison while sitting in the same grid is
 * borrowing the credibility of the ones that didn't.
 *
 * A quote-only service is an honest product. A quote-only service PRESENTED AS
 * a priced one is not, and that is the only thing this rule forbids. The
 * remedy is always one of two things: give it a bounded scope and a derived
 * price, or take it out of the public catalogue until it has one.
 *
 * THE ALLOWLIST IS DATED AND FINITE.
 *
 * Every entry names what would clear it. An allowlist without that becomes the
 * place non-compliance goes to be forgotten — which is how nine price-less
 * public services went unnoticed until an audit went looking.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Public, price-less, and knowingly so — while Phase F gives each a bounded
 * scope. Removing an entry is how a rescue finishes; nothing else clears it.
 */
const UNDER_RESCUE: Record<string, string> = {
  "240v-garage-outlet":
    "Phase F rescue. Standard scope drafted (exposed garage wall, run within " +
    "25 ft, panel in the garage with two open spaces). Blocked on material " +
    "roles for 240V receptacles and conductors heavier than 12 AWG.",
  "hot-tub-spa-electrical":
    "Phase F rescue. Standard scope drafted (tub set, exterior surface run " +
    "within 25 ft, no trenching). Blocked on a GFCI spa-disconnect role and " +
    "heavy conductor/conduit roles.",
  "generator-inlet-interlock":
    "Phase F rescue. Standard scope drafted (listed interlock available for " +
    "the panel, inlet within 10 ft, 30 A). Blocked on inlet-box, interlock-kit " +
    "and 10/3 conductor roles.",
  "200a-service-upgrade":
    "Phase F rescue. Standard scope drafted (overhead, meter and panel in " +
    "place, no relocation). Blocked on service-equipment material roles AND " +
    "on owner confirmation of crew-hours — the $4,995 historical price does " +
    "not reconcile with the 8 hours the seed records.",
  "electrical-panel-replacement":
    "Phase F rescue. Standard scope drafted (same amperage, same location, " +
    "service conductors reused). Blocked on panel/breaker material roles and " +
    "the same crew-hour confirmation as the service upgrade.",
  "new-video-doorbell-wiring":
    "Phase F rescue. Standard scope drafted (accessible attic or basement, " +
    "run within 25 ft, customer supplies the doorbell). Blocked on one role: " +
    "18/2 bell wire.",
  "under-cabinet-led-lighting":
    "Phase F rescue. Standard scope drafted (kitchen, up to 3 runs and 12 " +
    "linear ft, powered from an existing circuit below). Blocked on LED " +
    "under-cabinet fixture and driver roles.",
  "level-2-ev-charger":
    "Phase F, held back deliberately. 36 review routes means the tree needs " +
    "normalising around the facts that actually price it before any package " +
    "is drawn. Not a rescue until that pass runs.",
};

async function main() {
  console.log(`\nPUBLIC PRICING — §1.4\n`);

  const contractors = await prisma.contractor.findMany({
    select: { id: true, slug: true, name: true },
    orderBy: { slug: "asc" },
  });

  let violations = 0;
  let allowed = 0;
  let priced = 0;
  const staleAllowlist = new Set(Object.keys(UNDER_RESCUE));

  for (const c of contractors) {
    const services = await prisma.service.findMany({
      where: { contractorId: c.id, active: true },
      select: { slug: true, name: true, bookingType: true, basePrice: true, startingPriceLabel: true },
      orderBy: { slug: "asc" },
    });

    const offenders: typeof services = [];
    for (const s of services) {
      if (s.basePrice !== null) { priced++; continue; }
      staleAllowlist.delete(s.slug);
      if (UNDER_RESCUE[s.slug]) { allowed++; continue; }
      offenders.push(s);
    }

    if (offenders.length) {
      console.log(`  ${c.name.trim()} — ${offenders.length} public service(s) with no starting price:\n`);
      for (const s of offenders) {
        console.log(`      ${s.slug}`);
        console.log(`          ${s.bookingType}, shows ${s.startingPriceLabel ? `"${s.startingPriceLabel}"` : "a fallback label"} where a price goes`);
      }
      console.log();
      violations += offenders.length;
    }
  }

  console.log(`  ${priced} public service(s) show a real starting price.`);
  console.log(`  ${allowed} under an explicit, dated rescue.`);
  console.log();

  // An allowlist entry for a service that is already priced, hidden or gone is
  // dead weight that makes the list look longer than the problem is.
  if (staleAllowlist.size) {
    console.log(`  ${staleAllowlist.size} stale allowlist entr(ies) — no longer public and price-less:`);
    for (const s of staleAllowlist) console.log(`      ${s}`);
    console.log(`  Remove them; a rescue that finished should stop being listed.\n`);
  }

  if (violations) {
    console.log(`  ✗ ${violations} service(s) are public with nothing in the price slot,`);
    console.log(`    and are not on the rescue list. Each one either gets a bounded`);
    console.log(`    scope and a derived price, or comes out of the catalogue.\n`);
    process.exit(1);
  }

  console.log(`  ✓ No public service is quietly price-less.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
