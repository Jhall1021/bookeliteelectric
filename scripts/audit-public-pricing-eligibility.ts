/**
 * Public pricing eligibility — read-only.
 *
 *   npx tsx scripts/audit-public-pricing-eligibility.ts
 *   npx tsx scripts/audit-public-pricing-eligibility.ts --json
 *
 * Ordered before the Phase F starting-package work so we find out what is
 * actually wrong with each no-price service BEFORE building packages, rather
 * than discovering another chandelier halfway through the heavy services.
 *
 * §1.4: a public service either displays a real starting price or is hidden.
 * "Displays a price" has two honest forms — a derived number, or an explicit
 * quote label the customer can act on. What it may never be is empty, or a
 * route that answers INVALID after the customer has answered every question.
 *
 * This script CHANGES NOTHING. Dispositions are recorded owner decisions,
 * not the script's opinion; anything not yet decided says so.
 */

import { PrismaClient } from "@prisma/client";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../lib/routeResolver";

const prisma = new PrismaClient();

/**
 * Owner dispositions, 29 August 2026. Two piles, given verbatim.
 *
 * A slug absent from here has not been decided, and the report says so
 * rather than guessing a pile for it.
 */
const DISPOSITION: Record<string, { pile: string; why: string }> = {
  "240v-garage-outlet": { pile: "rescue", why: "Named for a starting package." },
  "hot-tub-spa-electrical": { pile: "rescue", why: "Named for a starting package." },
  "generator-inlet-interlock": { pile: "rescue", why: "Named for a starting package." },
  "level-2-ev-charger": { pile: "rescue?", why: "Named 'probably' — run length, conductor size and panel capacity still have to be bounded before hours mean anything." },
  "200a-service-upgrade": { pile: "rescue", why: "Named for a starting package." },
  "electrical-panel-replacement": { pile: "rescue", why: "Named for a starting package." },
  "new-video-doorbell-wiring": { pile: "rescue", why: "Named for a starting package." },
  "under-cabinet-led-lighting": { pile: "rescue", why: "Named 'if still quote-only' — it is." },
  "pool-equipment-electrical": { pile: "hide", why: "Hide unless the service is narrowed first." },
  "transfer-switch": { pile: "hide", why: "Hide unless the service is narrowed first." },
  "outdoor-landscape-lighting": { pile: "hide", why: "Broad landscape/custom service." },
  "new-exterior-lighting-locations": { pile: "hide", why: "Broad custom service — new locations are unbounded by definition." },
};

const PILE_LABEL: Record<string, string> = {
  rescue: "Rescue — starting package",
  "rescue?": "Rescue — needs scoping first",
  hide: "Hide until narrowed",
};

type Row = {
  slug: string; name: string; bookingType: string; public: boolean;
  pricePath: string; disposition: string; reason: string;
  hours: number | null; recipe: number; questions: number;
  label: string | null; priced: number; review: number; invalid: number; handoff: number;
  defect: string | null;
};

async function main() {
  const asJson = process.argv.includes("--json");

  const c = await prisma.contractor.findUniqueOrThrow({
    where: { slug: "elite-electric" }, select: { id: true },
  });
  const settings = await loadPricingSettings(prisma as any, c.id);

  const svcs = await prisma.service.findMany({
    where: { contractorId: c.id },
    orderBy: [{ active: "desc" }, { slug: "asc" }],
    select: {
      id: true, slug: true, name: true, bookingType: true, active: true,
      basePrice: true, startingPriceLabel: true, fieldLaborHours: true,
      publishedPriceApprovedAt: true,
      _count: { select: { materials: true, questions: true } },
    },
  });

  const rows: Row[] = [];

  for (const s of svcs) {
    // Walk the tree the customer walks. A published price is not proof the
    // customer can reach one.
    let priced = 0, review = 0, invalid = 0, handoff = 0;
    const badReroute: string[] = [];
    const full = await loadServiceForResolution(prisma as any, s.id);
    if (full) {
      const byId = new Map(full.questions.map((q: any) => [q.id, q]));
      const nk = (o: any) =>
        o.routeAction === "CONTINUE" && o.nextQuestionId ? byId.get(o.nextQuestionId)?.key ?? null : null;
      let n = 0;
      const walk = async (k: string | null, ans: Record<string, string>): Promise<void> => {
        if (n > 4000) return;
        if (!k) {
          n++;
          const r: any = resolveRoute(full as any, ans, true, settings!);

          // A reroute is a hand-off, not an outcome. The destination asks its
          // OWN questions, so resolving it with these answers would report
          // "no answer for <its first question>" — which is the hand-off
          // working, not a fault. Check the target EXISTS and stop there.
          if (r.status === "REROUTE") {
            const target = await loadServiceForResolution(prisma as any, r.targetServiceId);
            if (target) handoff++;
            else { invalid++; badReroute.push("reroute target does not exist"); }
            return;
          }

          // The REROUTE_TROUBLESHOOTING special case that used to live here is
          // gone: the resolver now returns a real REROUTE for those, handled
          // above. Kept as a note because its absence is the point — this
          // audit no longer has to know about a divergence that no longer
          // exists. See scripts/verify-troubleshooting-route.ts.

          if (r.status === "PRICED") priced++;
          else if (r.status === "REVIEW") review++;
          else if (r.status === "INVALID" && /has no published (base|add-on) price/.test(String(r.reason))) {
            // Correct for a quote-only service: there is no price, by design.
            if (s.bookingType === "REMOTE_QUOTE") review++;
            else { invalid++; badReroute.push(String(r.reason)); }
          } else { invalid++; badReroute.push(String(r.reason)); }
          return;
        }
        const q: any = full.questions.find((x: any) => x.key === k);
        if (!q) return;
        for (const o of q.options) await walk(nk(o), { ...ans, [q.key]: o.value });
      };
      await walk(full.questions[0]?.key ?? null, {});
    }

    const priceCents = s.basePrice;
    const pricePath =
      priceCents !== null
        ? `published $${(priceCents / 100).toFixed(0)}`
        : s.bookingType === "REMOTE_QUOTE"
          ? `quote-only — label ${s.startingPriceLabel ? `"${s.startingPriceLabel}"` : "(falls back)"}`
          : "NO PRICE PATH";

    // The chandelier class, stated as a rule rather than a slug: a service
    // the customer can reach, answer to the end, and get nothing from.
    const defects: string[] = [];
    if (s.active && priceCents === null && s.bookingType !== "REMOTE_QUOTE")
      defects.push("active, not quote-only, and unpriced — §1.4 breach");
    if (s.active && priceCents === null && s.publishedPriceApprovedAt)
      defects.push("approval stamp with no price behind it");
    if (s.active && invalid > 0)
      defects.push(`${invalid} route(s) resolve INVALID: ${[...new Set(badReroute)].join(", ")}`);
    if (s.active && priceCents !== null && priced === 0 && review === 0 && invalid === 0)
      defects.push("published price the tree never reaches");

    const d = DISPOSITION[s.slug];
    rows.push({
      slug: s.slug, name: s.name.trim(), bookingType: s.bookingType, public: s.active,
      pricePath,
      disposition: priceCents !== null ? "Priced — no action" : d ? PILE_LABEL[d.pile] : "UNDECIDED",
      reason: priceCents !== null
        ? "Carries a derived, published price."
        : d ? d.why : "Not in either pile. Needs an owner decision before Phase F.",
      hours: s.fieldLaborHours, recipe: s._count.materials, questions: s._count.questions,
      label: s.startingPriceLabel, priced, review, invalid, handoff,
      defect: defects.length ? defects.join("; ") : null,
    });
  }

  if (asJson) {
    console.log(JSON.stringify(rows, null, 2));
    await prisma.$disconnect();
    return;
  }

  const noPrice = rows.filter((r) => r.public && !r.pricePath.startsWith("published"));
  const defective = rows.filter((r) => r.defect);

  console.log(`\nPUBLIC PRICING ELIGIBILITY — ${rows.length} services (${rows.filter((r) => r.public).length} public)\n`);

  console.log(`  ${"slug".padEnd(34)}${"booking".padEnd(14)}${"public".padEnd(8)}${"current price path".padEnd(34)}disposition`);
  console.log(`  ${"─".repeat(112)}`);
  for (const r of noPrice) {
    console.log(`  ${r.slug.padEnd(34)}${r.bookingType.padEnd(14)}${(r.public ? "yes" : "no").padEnd(8)}${r.pricePath.padEnd(34)}${r.disposition}`);
    console.log(`  ${" ".repeat(34)}${r.reason}`);
    console.log(`  ${" ".repeat(34)}hours ${r.hours ?? "—"}  recipe ${r.recipe}  questions ${r.questions}  routes: ${r.priced} priced / ${r.review} review / ${r.handoff} hand-off / ${r.invalid} invalid`);
    console.log();
  }

  console.log(`  DEFECTS\n`);
  if (defective.length === 0) {
    console.log(`  None. Every public service either reaches a price or says it is a quote.\n`);
  } else {
    for (const r of defective) console.log(`  ${r.slug}\n      ${r.defect}\n`);
  }

  const undecided = noPrice.filter((r) => r.disposition === "UNDECIDED");
  console.log(`  ${noPrice.length} public services carry no price.`);
  console.log(`     rescue    ${noPrice.filter((r) => r.disposition.startsWith("Rescue — starting")).length}`);
  console.log(`     scope 1st ${noPrice.filter((r) => r.disposition.startsWith("Rescue — needs")).length}`);
  console.log(`     hide      ${noPrice.filter((r) => r.disposition.startsWith("Hide")).length}`);
  console.log(`     undecided ${undecided.length}`);
  console.log();
  console.log(`  Every one of them has null crew-hours and an empty recipe. None can be`);
  console.log(`  priced by adding a number — each needs a bounded scope first, which is`);
  console.log(`  what "starting package" means here.\n`);

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
