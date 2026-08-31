/**
 * §1.4 — a service that PROMISES a fixed price shows an approved one.
 *
 *   npx tsx scripts/verify-public-pricing.ts
 *
 * This used to read "a public service shows a real starting price, or it is
 * not public", which treats *active* and *priced* as synonyms. They are not.
 * A remote-quote service is legitimately customer-visible with nothing in the
 * price slot: collecting photos and coming back with a number IS its outcome,
 * not a gap in it. The old rule could only accommodate that through an
 * allowlist, so an honest product and an unfinished one looked identical.
 *
 * The rule now asks the question that was always meant:
 *
 *   Can a homeowner walk this service's tree and arrive at a fixed price?
 *   If so, that price must exist AND have been approved by a human.
 *
 * Asked of the TREE, not of `bookingType` — see lib/activationOutcome.ts. A
 * service declared ADJUSTED whose every route reaches review promises nothing;
 * a service with no tree promises a price on the customer's first tap.
 *
 * WHY APPROVAL AND NOT MERELY PRESENCE
 *
 * A number in the slot was never the point — a number a human accepted was.
 * `publishedPriceApprovedAt` is that acceptance, and until now nothing checked
 * it, so a price typed straight into the service editor satisfied this rule
 * completely.
 *
 * "Get a quote" in the price slot is still not a starting price for a service
 * that promises one. That case is what this forbids, and the remedy is
 * unchanged: give it a bounded scope and a derived price, or take it out of
 * the public catalog until it has one.
 *
 * THE ALLOWLIST IS DATED AND FINITE.
 *
 * Every entry names what would clear it. An allowlist without that becomes the
 * place non-compliance goes to be forgotten — which is how nine price-less
 * public services went unnoticed until an audit went looking.
 */

import { PrismaClient } from "@prisma/client";
import { loadServiceForResolution, loadPricingSettings } from "../lib/routeResolver";
import { pricePromiseOf, unapprovedPriceSources } from "../lib/activationOutcome";

const prisma = new PrismaClient();

// THE RESCUE ALLOWLIST IS GONE — 31 Aug 2026.
//
// It existed because the old rule could not tell an honest quote-only service
// from an unfinished one, so both needed an exception. Outcome-aware
// activation tells them apart on its own: level-2-ev-charger passes because
// its tree promises a quote and delivers one, and the two pre-work services
// passed the moment they were priced and approved.
//
// Removed rather than emptied. An exception list with nothing on it is a door
// somebody opens later, and the whole reason this one stayed honest was that
// every entry named what would clear it.

// The AWAITING_APPROVAL backlog is GONE, not emptied — every price published
// before the approval boundary existed has been through the lifecycle, and an
// empty exception list is just a door someone opens later. An unapproved
// price is now simply a violation.

async function main() {
  console.log(`\nPUBLIC PRICING — §1.4\n`);


  const contractors = await prisma.contractor.findMany({
    select: { id: true, slug: true, name: true },
    orderBy: { slug: "asc" },
  });

  let violations = 0;
  let priced = 0;
  /** Legitimately unpriced: no route the customer can take reaches a price. */
  let quoteOnly = 0;
  /** Contractors with no pricing settings — nothing of theirs can be priced. */
  const unpriceable = new Set<string>();
  /** Unpriced services whose promise could not be computed. */
  const unverifiable: string[] = [];

  for (const c of contractors) {
    const services = await prisma.service.findMany({
      where: { contractorId: c.id, active: true },
      select: {
        id: true, slug: true, name: true, bookingType: true, basePrice: true,
        startingPriceLabel: true, publishedPriceApprovedAt: true,
      },
      orderBy: { slug: "asc" },
    });

    // A contractor part-way through onboarding has no pricing settings yet,
    // and loading them THROWS. §1.4 was calling this before it knew whether it
    // needed them, so one un-onboarded contractor took the whole deploy gate
    // down with an error about pricing for a tenant that has no prices.
    //
    // Missing settings only costs the ability to ask what a tree PROMISES.
    // The approval checks below need no settings at all, and they are the ones
    // that protect a homeowner, so they still run.
    let settings: Awaited<ReturnType<typeof loadPricingSettings>> | null = null;
    try {
      settings = await loadPricingSettings(prisma as never, c.id);
    } catch {
      unpriceable.add(c.slug);
    }
    const offenders: { slug: string; bookingType: string; why: string }[] = [];

    for (const s of services) {
      const treated = s.basePrice !== null;

      // Approval is checked on anything carrying a price, whatever its
      // outcome: a remote-quote anchor price is still a number a customer
      // reads, so it still needs someone to have accepted it.
      if (s.basePrice !== null && s.publishedPriceApprovedAt === null) {
        offenders.push({
          slug: s.slug, bookingType: s.bookingType,
          why: "carries a price that nobody approved — it did not come through the publish action",
        });
        continue;
      }
      // A price a customer reaches through an ADD-ON is still a price this
      // service puts in front of them. Checked whatever the host's own price
      // slot says, because a fully approved service can still offer an
      // unapproved one — and the referenced service being inactive hides it
      // from every check that walks the active catalog.
      const referenced = await prisma.answerOption.findMany({
        where: { question: { serviceId: s.id }, referencedServiceId: { not: null } },
        select: {
          referencedService: {
            select: { slug: true, basePrice: true, publishedPriceApprovedAt: true },
          },
        },
      });
      const viaAddOn = unapprovedPriceSources(
        referenced.map((r) => r.referencedService!).filter(Boolean)
      );
      // Known, dated entries stay covered by the backlog they are already on.
      // Anything else is a live route offering a price nobody approved.
      if (viaAddOn.length) {
        offenders.push({
          slug: s.slug, bookingType: s.bookingType,
          why: `offers an unapproved price through ${viaAddOn.join(", ")}`,
        });
        continue;
      }

      if (treated) { priced++; continue; }

      // Unpriced. Whether that is a defect depends entirely on what the
      // service's own tree promises the customer.
      // Without settings there is no way to ask what the tree promises. The
      // service is reported as unverifiable rather than assumed innocent.
      if (!settings) { unverifiable.push(s.slug); continue; }

      const full = await loadServiceForResolution(prisma as never, s.id);
      const promise = pricePromiseOf(
        full ? ({ ...full, bookingType: s.bookingType } as never) : null,
        settings
      );

      if (!promise.promisesFixedPrice) {
        quoteOnly++;
        continue;
      }

      offenders.push({
        slug: s.slug, bookingType: s.bookingType,
        why: `${promise.reason}, but no price is published`,
      });
    }

    if (offenders.length) {
      console.log(`  ${c.name.trim()} — ${offenders.length} service(s) failing the promise they make:\n`);
      for (const s of offenders) {
        console.log(`      ${s.slug}`);
        console.log(`          ${s.bookingType} — ${s.why}`);
      }
      console.log();
      violations += offenders.length;
    }
  }

  console.log(`  ${priced} service(s) promise a price and show an approved one.`);
  console.log(`  ${quoteOnly} resolve by quote or review, and owe no price.`);
  console.log();

  // An allowlist entry for a service that is already priced, hidden or gone is
  // dead weight that makes the list look longer than the problem is.
  // The approval backlog is not limited to ACTIVE services — the Postgres
  // constraint governs every row, so an inactive service carrying an
  // unapproved price is just as much a blocker. Scanning only the active ones
  // made two real entries look stale.
  const everyUnapproved = await prisma.service.findMany({
    where: { basePrice: { not: null }, publishedPriceApprovedAt: null },
    select: { slug: true },
  });
  // Inactive services are included: an inactive row can still be an add-on
  // price source, which is exactly how two mounts reached homeowners unseen.
  if (everyUnapproved.length) {
    console.log(`  ${everyUnapproved.length} service(s) carry a price nobody approved:`);
    for (const u of everyUnapproved) console.log(`      ${u.slug}`);
    console.log(`  Re-approve them through the pricing screen.\n`);
    violations += everyUnapproved.length;
  }

  if (unpriceable.size) {
    console.log(`  ${unpriceable.size} contractor(s) have no pricing settings yet:`);
    for (const c of unpriceable) console.log(`      ${c}`);
    console.log(`  Their unpriced services cannot be checked for a price promise,`);
    console.log(`  but every price they DO carry was still checked for approval.`);
    if (unverifiable.length) console.log(`      unchecked: ${unverifiable.join(", ")}`);
    console.log();
  }

  if (violations) {
    console.log(`  ✗ ${violations} service(s) promise a customer a fixed price they`);
    console.log(`    cannot show, or show one nobody approved. Each one either gets`);
    console.log(`    a bounded scope and an APPROVED derived price, changes what its`);
    console.log(`    tree promises, or comes out of the catalog.\n`);
    process.exit(1);
  }

  console.log(`  ✓ Every service that promises a fixed price shows an approved one.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
