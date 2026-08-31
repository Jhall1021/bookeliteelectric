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

/**
 * Public, price-less, and knowingly so — while Phase F gives each a bounded
 * scope. Removing an entry is how a rescue finishes; nothing else clears it.
 */
const UNDER_RESCUE: Record<string, string> = {
  "200a-service-upgrade":
    "Phase F rescue. Standard scope drafted (overhead, meter and panel in " +
    "place, no relocation). Blocked on service-equipment material roles AND " +
    "on owner confirmation of crew-hours — the $4,995 historical price does " +
    "not reconcile with the 8 hours the seed records.",
  "electrical-panel-replacement":
    "Phase F rescue. Standard scope drafted (same amperage, same location, " +
    "service conductors reused). Blocked on panel/breaker material roles and " +
    "the same crew-hour confirmation as the service upgrade.",
  // level-2-ev-charger came off this list on 30 Aug 2026. Under the
  // outcome-aware rule it needs no exception: 36 review routes, 0 pricing
  // routes, 0 dead routes — it promises a quote and delivers a quote. Its tree
  // normalisation is still wanted, but that is a quality goal, not a broken
  // promise to a customer, and it was only ever on this list because the old
  // rule could not tell those apart.
};

/**
 * Priced before the approval boundary existed, and never stamped.
 *
 * These carry a real price with no `publishedPriceApprovedAt`, because until
 * 30 Aug 2026 nothing required one — the service editor wrote `basePrice`
 * straight from a typed field. They are not wrong prices; three of the four
 * reproduce their derived figure exactly. They are unapproved ones.
 *
 * WHAT CLEARS AN ENTRY: the contractor re-approves the price through the
 * pricing screen's publish action, which stamps it. Nothing here may stamp
 * them — a script approving its own output is the governance failure this
 * whole boundary exists to prevent, and `audit-price-writers` would flag it.
 *
 * Dated and finite, like the rescue list above it.
 */
const AWAITING_APPROVAL: Record<string, string> = {
  "elite-articulating-mount":
    "Add-on only and inactive — an Elite-supplied mount fitted during a TV " +
    "installation. Its labor hours were null (unknown) where the true answer " +
    "was 0 (none), so the engine derived nothing; completed 30 Aug 2026. " +
    "Published $200.00 is material at the 2.0x multiplier and now derives " +
    "exactly. Needs the approval stamp only.",
  "elite-tilt-mount":
    "As above. Published $125.00 is material at 2.5x and now derives exactly. " +
    "Needs the approval stamp only.",
  "new-coax-line":
    "Published $420.00; inputs now derive $405.00. Needs re-approval, and the " +
    "$15 gap is a decision for the contractor rather than something to " +
    "overwrite silently.",
  "new-ethernet-line": "Published $415.00, matches its derived price. Needs the approval stamp only.",
  "new-wall-sconce": "Published $340.00, matches its derived price. Needs the approval stamp only.",
  "replace-wall-sconce": "Published $255.00, matches its derived price. Needs the approval stamp only.",
};

/**
 * `--assume-priced=slug,slug` answers a question the normal run cannot:
 * WOULD these services pass §1.4 on their own, with no rescue exception at
 * all? It treats the named slugs as priced and drops the entire allowlist.
 *
 * It changes nothing and writes nothing. The point is to know the answer
 * BEFORE publishing a price, rather than publishing one to find out.
 */
const assumePriced = new Set(
  (process.argv.find((a) => a.startsWith("--assume-priced="))?.split("=")[1] ?? "")
    .split(",").map((x) => x.trim()).filter(Boolean)
);
const dryRun = assumePriced.size > 0 || process.argv.includes("--no-rescue");

async function main() {
  console.log(`\nPUBLIC PRICING — §1.4\n`);
  if (dryRun) {
    console.log(`  DRY RUN — no rescue allowlist${
      assumePriced.size ? `, assuming priced: ${[...assumePriced].join(", ")}` : ""
    }\n  Nothing is written; this reports what WOULD hold.\n`);
  }

  const contractors = await prisma.contractor.findMany({
    select: { id: true, slug: true, name: true },
    orderBy: { slug: "asc" },
  });

  let violations = 0;
  let allowed = 0;
  let priced = 0;
  /** Legitimately unpriced: no route the customer can take reaches a price. */
  let quoteOnly = 0;
  /** Priced before the boundary existed; waiting on a contractor's approval. */
  let unapproved = 0;
  const staleApproval = new Set(Object.keys(AWAITING_APPROVAL));
  /** Live services offering a price that is on the backlog. */
  const reachesBacklog = new Set<string>();
  const staleAllowlist = new Set(Object.keys(UNDER_RESCUE));

  for (const c of contractors) {
    const services = await prisma.service.findMany({
      where: { contractorId: c.id, active: true },
      select: {
        id: true, slug: true, name: true, bookingType: true, basePrice: true,
        startingPriceLabel: true, publishedPriceApprovedAt: true,
      },
      orderBy: { slug: "asc" },
    });

    const settings = await loadPricingSettings(prisma as never, c.id);
    const offenders: { slug: string; bookingType: string; why: string }[] = [];

    for (const s of services) {
      const treated = s.basePrice !== null || assumePriced.has(s.slug);

      // Approval is checked on anything carrying a price, whatever its
      // outcome: a remote-quote anchor price is still a number a customer
      // reads, so it still needs someone to have accepted it.
      if (s.basePrice !== null && s.publishedPriceApprovedAt === null) {
        staleApproval.delete(s.slug);
        if (!dryRun && AWAITING_APPROVAL[s.slug]) { unapproved++; continue; }
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
      // Under --no-rescue the backlog is dropped too, which is what lets the
      // regression proof watch this rule actually bite on real data instead
      // of only on a fixture.
      const undeclaredViaAddOn = viaAddOn.filter((slug) => dryRun || !AWAITING_APPROVAL[slug]);
      if (undeclaredViaAddOn.length) {
        offenders.push({
          slug: s.slug, bookingType: s.bookingType,
          why: `offers an unapproved price through ${undeclaredViaAddOn.join(", ")}`,
        });
        continue;
      }
      if (viaAddOn.length) reachesBacklog.add(s.slug);

      if (treated) { priced++; continue; }

      // Unpriced. Whether that is a defect depends entirely on what the
      // service's own tree promises the customer.
      const full = await loadServiceForResolution(prisma as never, s.id);
      const promise = pricePromiseOf(
        full ? ({ ...full, bookingType: s.bookingType } as never) : null,
        settings
      );

      if (!promise.promisesFixedPrice) {
        quoteOnly++;
        continue;
      }

      staleAllowlist.delete(s.slug);
      if (!dryRun && UNDER_RESCUE[s.slug]) { allowed++; continue; }
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
  console.log(`  ${allowed} under an explicit, dated rescue.`);
  console.log(`  ${unapproved} priced before the approval boundary, awaiting re-approval.`);
  if (reachesBacklog.size) {
    console.log(`\n  ${reachesBacklog.size} live service(s) offer one of those prices as an add-on:`);
    for (const s of reachesBacklog) console.log(`      ${s}`);
    console.log(`  Those routes are live, so re-approving the backlog clears these too.`);
  }
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
  for (const u of everyUnapproved) staleApproval.delete(u.slug);

  const undeclared = everyUnapproved.filter((u) => !AWAITING_APPROVAL[u.slug]);
  if (undeclared.length) {
    console.log(`  ${undeclared.length} unapproved price(s) not on the backlog list:`);
    for (const u of undeclared) console.log(`      ${u.slug}`);
    console.log(`  Add them with a reason, or re-approve them.\n`);
    violations += undeclared.length;
  }

  if (staleApproval.size) {
    console.log(`  ${staleApproval.size} stale approval-backlog entr(ies) — now approved or gone:`);
    for (const s of staleApproval) console.log(`      ${s}`);
    console.log(`  Remove them; the backlog should shrink to nothing.\n`);
  }

  if (staleAllowlist.size) {
    console.log(`  ${staleAllowlist.size} stale allowlist entr(ies) — no longer public and price-less:`);
    for (const s of staleAllowlist) console.log(`      ${s}`);
    console.log(`  Remove them; a rescue that finished should stop being listed.\n`);
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
