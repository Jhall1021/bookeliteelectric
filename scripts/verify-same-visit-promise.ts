/**
 * The storefront may only promise what the cart will honor.
 *
 *   npx tsx scripts/verify-same-visit-promise.ts
 *
 * WHAT WENT WRONG
 *
 * The same-visit promise was unconditional copy: a badge, a two-rung ladder, a
 * step in "How Our Pricing Works" and an upsell on the cart, all describing
 * what Price2Book supports rather than what the contractor had configured.
 * BrightPath launched four services, none with an add-on price, and advertised
 * same-visit pricing on every page. A homeowner who took the offer was refused
 * at the cart with PRIMARY_UNRESOLVABLE.
 *
 * The two halves have to agree, so this checks them against each other rather
 * than checking either alone. The agreement is NOT "every pair works" — Elite
 * has 15 unplaceable pairs out of 2,080 and its promise is plainly true — it
 * is that the promise is only made when there is something to add, and that
 * the combinations which cannot be placed are never offered in the first
 * place. A refusal a homeowner can reach is the defect; a gap they never see
 * is a catalog to fill in.
 */

import { PrismaClient } from "@prisma/client";
import { canPromiseSameVisit, canPlaceAlongside, sameVisitAvailable } from "../lib/sameVisit";
import { selectPrimary } from "../lib/visitPrimary";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

/** Every pair a homeowner could assemble from a live catalog. */
function everyPair<T>(xs: T[]): [T, T][] {
  const out: [T, T][] = [];
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) out.push([xs[i], xs[j]]);
  return out;
}

function statics() {
  console.log(`\n  THE RULE\n`);

  const withAddOn = (n: number) => ({ slug: `wwt${n}`, basePrice: 21500, whileWeThereBasePrice: 9000 });
  const noAddOn = (n: number) => ({ slug: `bare${n}`, basePrice: 21500, whileWeThereBasePrice: null });

  ok(canPromiseSameVisit([withAddOn(1), withAddOn(2)]) === true,
    "two services that can both be demoted — promise holds");
  ok(canPromiseSameVisit([noAddOn(1), withAddOn(2)]) === true,
    "one that can only be primary is fine: it carries the service call");
  ok(canPromiseSameVisit([noAddOn(1), noAddOn(2)]) === false,
    "NO service has an add-on price — the promise is false of this business");
  ok(canPromiseSameVisit([noAddOn(1), noAddOn(2), withAddOn(3)]) === true,
    "a mostly-priced catalog keeps the promise despite some gaps",
    "silencing Elite over 0.7% of pairs would be the wrong correction");
  ok(canPromiseSameVisit([withAddOn(1)]) === false,
    "a single live service has nothing to add alongside");
  ok(canPromiseSameVisit([]) === false, "an empty catalog promises nothing");

  const catalogs = [
    [withAddOn(1), withAddOn(2), withAddOn(3)],
    [noAddOn(1), withAddOn(2), withAddOn(3)],
    [noAddOn(1), noAddOn(2), withAddOn(3)],
    [noAddOn(1), noAddOn(2), noAddOn(3)],
  ];
  // THE PROPERTY THAT ACTUALLY MATTERS. Not "every pair works" — that is a
  // catalog gap, not a false promise — but "whenever we promise, there is
  // something a homeowner can actually add".
  let empty = 0;
  for (const catalog of catalogs) {
    if (!canPromiseSameVisit(catalog)) continue;
    const anyPlaceable = everyPair(catalog).some(([a, b]) => selectPrimary([a, b]).ok);
    if (!anyPlaceable) empty++;
  }
  ok(empty === 0, "wherever the promise is shown, at least one pair can be placed");

  // And the converse: it is not withheld from a catalog that could keep it,
  // which would cost the contractor real add-on work.
  let withheld = 0;
  for (const catalog of catalogs) {
    if (canPromiseSameVisit(catalog) || catalog.length < 2) continue;
    if (everyPair(catalog).some(([a, b]) => selectPrimary([a, b]).ok)) withheld++;
  }
  ok(withheld === 0, "and it is not withheld from a catalog that could keep it");

  // The unplaceable combinations that remain are handled by NOT OFFERING
  // them, which is the half that keeps PRIMARY_UNRESOLVABLE off the
  // homeowner's screen.
  const onVisit = [noAddOn(1)];
  ok(canPlaceAlongside(onVisit, noAddOn(2), selectPrimary) === false,
    "a second primary-only service is not offered alongside the first");
  ok(canPlaceAlongside(onVisit, withAddOn(2), selectPrimary) === true,
    "and one with an add-on price still is");
}

async function live() {
  console.log(`\n  LIVE STOREFRONTS\n`);
  const contractors = await prisma.contractor.findMany({ select: { id: true, slug: true } });

  for (const c of contractors) {
    const services = await prisma.service.findMany({
      where: { contractorId: c.id, active: true },
      select: { slug: true, basePrice: true, whileWeThereBasePrice: true },
    });
    const promised = await sameVisitAvailable(prisma, c.id);

    if (!promised) {
      console.log(`  ${c.slug}: no same-visit promise shown (${services.length} live)`);
      continue;
    }
    // Every pair, not a sample: 2,080 of them for Elite and still cheap.
    const pairs = everyPair(services);
    const bad = pairs.filter(([a, b]) => !selectPrimary([a, b]).ok);
    ok(pairs.length - bad.length > 0,
      `${c.slug}: promises same-visit, and ${pairs.length - bad.length} of ${pairs.length} pair(s) can be placed`,
      "nothing a homeowner could add");
    // The rest must be unreachable rather than refused — the browse list is
    // filtered by canPlaceAlongside, so an unplaceable service is never on
    // screen while its blocker is on the visit.
    const undemotable = services.filter((s) => s.whileWeThereBasePrice === null);
    ok(undemotable.every((u) =>
        !canPlaceAlongside([u], undemotable.find((o) => o !== u) ?? u, selectPrimary) ||
        undemotable.length < 2),
      `${c.slug}: its ${undemotable.length} primary-only service(s) are filtered out, not refused`);
  }
}

async function main() {
  console.log("\nSAME-VISIT PROMISE");
  statics();
  await live();
  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
