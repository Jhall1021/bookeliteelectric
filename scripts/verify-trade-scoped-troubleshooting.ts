/**
 * G2 — a troubleshooting reroute resolves within its own trade.
 *
 * THE INVARIANT
 *
 *   A troubleshooting reroute resolves within the ORIGINATING SERVICE'S trade
 *   and contractor. Another trade's diagnostic is INVISIBLE to that lookup —
 *   not counted as ambiguity.
 *
 * The second half is the design. A filter that merely broke the tie would still
 * treat a Plumbing service call as a candidate answer to an Electrical
 * question. It is not a worse candidate; it is not a candidate.
 *
 * WHY THIS BUILDS ITS OWN CONTRACTOR
 *
 * The defect only appears on a contractor selling more than one trade, and no
 * such contractor exists — Elite is enrolled in nothing, BrightPath in
 * electrical alone, and both Plumbing rehearsal contractors in plumbing alone.
 * Asserting against live data would prove the single-trade case forever and the
 * multi-trade case never.
 *
 * So this stands one up, proves the eight acceptance cases against the REAL
 * shared lookup, and removes it. Named with a per-run suffix nothing else can
 * collide with, and the teardown refuses to delete anything it did not create.
 *
 *   npx tsx scripts/verify-trade-scoped-troubleshooting.ts
 */

import { PrismaClient } from "@prisma/client";
import { findTroubleshootingService, tradeOfService } from "../lib/troubleshooting";

const prisma = new PrismaClient();
const RUN = `g2-probe-${Date.now()}`;

let failures = 0;
let checks = 0;
function ok(label: string, condition: boolean, detail = "") {
  checks++;
  if (condition) console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  else {
    failures++;
    console.log(`  \x1b[31m✗ ${label}\x1b[0m${detail ? `\n      ${detail}` : ""}`);
  }
}
function group(name: string) {
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}

/** A service that exists only to be looked up. No prices, no tree, not offered. */
async function service(
  contractorId: string,
  categoryId: string,
  slug: string,
  tradeKey: string | null,
  bookingType: "TROUBLESHOOT_ONLY" | "INSTANT",
  active: boolean
) {
  return prisma.service.create({
    data: {
      contractorId,
      categoryId,
      slug,
      name: slug,
      bookingType,
      tradeKey,
      active,
      offered: true,
    },
    select: { id: true, slug: true, tradeKey: true },
  });
}

async function main() {
  console.log("\n\x1b[1mG2 — TRADE-SCOPED TROUBLESHOOTING\x1b[0m");
  console.log("Builds a multi-trade contractor, proves the eight cases, removes it.");

  // A legacy category row is required by the schema; any existing one will do,
  // and nothing here reads it.
  const cat = await prisma.serviceCategory.findFirstOrThrow({ select: { id: true } });

  const c = await prisma.contractor.create({
    data: { slug: RUN, name: "G2 Probe" },
    select: { id: true, slug: true },
  });

  try {
    // ── the multi-trade contractor ────────────────────────────────────────
    const elecDiag = await service(c.id, cat.id, `${RUN}-elec-diag`, "electrical", "TROUBLESHOOT_ONLY", true);
    const plumbDiag = await service(c.id, cat.id, `${RUN}-plumb-diag`, "plumbing", "TROUBLESHOOT_ONLY", true);
    const elecSvc = await service(c.id, cat.id, `${RUN}-elec-outlet`, "electrical", "INSTANT", true);
    const plumbSvc = await service(c.id, cat.id, `${RUN}-plumb-faucet`, "plumbing", "INSTANT", true);

    group("CASES 1 & 2 — each trade resolves its own");
    const e = await findTroubleshootingService(prisma as never, c.id, "electrical");
    ok("an Electrical reroute resolves the Electrical diagnostic",
      e.ok && e.service.id === elecDiag.id, JSON.stringify(e));
    const p = await findTroubleshootingService(prisma as never, c.id, "plumbing");
    ok("a Plumbing reroute resolves the Plumbing service call",
      p.ok && p.service.id === plumbDiag.id, JSON.stringify(p));
    ok("and they are different services",
      e.ok && p.ok && e.service.id !== p.service.id);

    group("CASE 6 — another trade's diagnostic is INVISIBLE, not ambiguous");
    // The whole defect: before G2 this contractor had two TROUBLESHOOT_ONLY
    // services and the lookup refused as "not decidable", so every reroute fell
    // to review. Two exist now and neither answer is ambiguous.
    ok("two diagnostics exist on this contractor",
      (await prisma.service.count({
        where: { contractorId: c.id, bookingType: "TROUBLESHOOT_ONLY", active: true },
      })) === 2);
    ok("the Electrical answer is not ambiguous", e.ok === true,
      e.ok ? "" : (e as { problem: string }).problem);
    ok("the Plumbing answer is not ambiguous", p.ok === true,
      p.ok ? "" : (p as { problem: string }).problem);

    group("CASE 3 — adding HVAC later changes neither answer");
    const hvacDiag = await service(c.id, cat.id, `${RUN}-hvac-diag`, "hvac", "TROUBLESHOOT_ONLY", true);
    const e2 = await findTroubleshootingService(prisma as never, c.id, "electrical");
    const p2 = await findTroubleshootingService(prisma as never, c.id, "plumbing");
    ok("Electrical still resolves the same service",
      e2.ok && e2.service.id === elecDiag.id, JSON.stringify(e2));
    ok("Plumbing still resolves the same service",
      p2.ok && p2.service.id === plumbDiag.id, JSON.stringify(p2));
    const h = await findTroubleshootingService(prisma as never, c.id, "hvac");
    ok("and HVAC resolves its own", h.ok && h.service.id === hvacDiag.id);

    group("CASE 4 — no diagnostic WITHIN the trade fails closed");
    const none = await findTroubleshootingService(prisma as never, c.id, "roofing");
    ok("a trade with no diagnostic refuses", none.ok === false);
    ok("and the refusal names the trade",
      none.ok === false && /roofing/.test(none.problem), none.ok === false ? none.problem : "");
    ok("three other trades' diagnostics did NOT satisfy it",
      none.ok === false, "presence of other trades must not resolve this one");

    group("CASE 5 — two diagnostics WITHIN one trade fails closed");
    const dupe = await service(c.id, cat.id, `${RUN}-elec-diag-2`, "electrical", "TROUBLESHOOT_ONLY", true);
    const amb = await findTroubleshootingService(prisma as never, c.id, "electrical");
    ok("two in one trade is ambiguous, and refuses", amb.ok === false);
    ok("and the refusal names both", amb.ok === false && /elec-diag/.test(amb.problem),
      amb.ok === false ? amb.problem : "");
    ok("while Plumbing is unaffected by Electrical's ambiguity",
      (await findTroubleshootingService(prisma as never, c.id, "plumbing")).ok === true);
    await prisma.service.delete({ where: { id: dupe.id } });

    group("INACTIVE and NULL trade");
    await prisma.service.update({ where: { id: plumbDiag.id }, data: { active: false } });
    ok("an inactive diagnostic counts as missing",
      (await findTroubleshootingService(prisma as never, c.id, "plumbing")).ok === false);
    await prisma.service.update({ where: { id: plumbDiag.id }, data: { active: true } });

    const orphan = await service(c.id, cat.id, `${RUN}-no-trade`, null, "INSTANT", true);
    const orphanTrade = await tradeOfService(prisma as never, c.id, orphan.id);
    ok("a service with a null tradeKey cannot resolve a destination",
      orphanTrade.ok === false);
    ok("and says so rather than guessing a trade",
      orphanTrade.ok === false && /tradeKey/.test(orphanTrade.problem),
      orphanTrade.ok === false ? orphanTrade.problem : "");
    for (const t of ["", "   "]) {
      ok(`an empty trade (${JSON.stringify(t)}) refuses rather than matching everything`,
        (await findTroubleshootingService(prisma as never, c.id, t)).ok === false);
    }

    group("tradeOfService — the one sanctioned way to obtain a trade");
    const got = await tradeOfService(prisma as never, c.id, elecSvc.id);
    ok("reads the originating service's own stored trade",
      got.ok && got.tradeKey === "electrical", JSON.stringify(got));
    const gotP = await tradeOfService(prisma as never, c.id, plumbSvc.id);
    ok("and a different service in the same catalog gives a different trade",
      gotP.ok && gotP.tradeKey === "plumbing");

    group("CASE 8 — tenant isolation unchanged");
    const elite = await prisma.contractor.findFirst({
      where: { slug: "elite-electric" }, select: { id: true },
    });
    if (elite) {
      const cross = await findTroubleshootingService(prisma as never, elite.id, "plumbing");
      ok("Elite does not inherit the probe's Plumbing diagnostic", cross.ok === false);
      const foreign = await tradeOfService(prisma as never, elite.id, elecSvc.id);
      ok("a service id from another contractor is not found, not merely wrong",
        foreign.ok === false);
    } else {
      ok("elite-electric present for the isolation check", false, "not found");
    }

    group("CASE 7 — a single-trade contractor behaves exactly as before");
    const solo = await prisma.contractor.create({
      data: { slug: `${RUN}-solo`, name: "G2 Solo Probe" },
      select: { id: true, slug: true },
    });
    try {
      const soloDiag = await service(solo.id, cat.id, `${RUN}-solo-diag`, "electrical", "TROUBLESHOOT_ONLY", true);
      const r = await findTroubleshootingService(prisma as never, solo.id, "electrical");
      ok("one trade, one diagnostic — resolves, no new refusal",
        r.ok && r.service.id === soloDiag.id, JSON.stringify(r));
      const empty = await prisma.contractor.create({
        data: { slug: `${RUN}-empty`, name: "G2 Empty Probe" }, select: { id: true, slug: true },
      });
      try {
        ok("a contractor with no diagnostic still fails closed",
          (await findTroubleshootingService(prisma as never, empty.id, "electrical")).ok === false);
      } finally {
        if (!empty.slug.startsWith(RUN)) throw new Error("refusing to delete a contractor this probe did not create");
        await prisma.contractor.delete({ where: { id: empty.id } });
      }
    } finally {
      if (!solo.slug.startsWith(RUN)) throw new Error("refusing to delete a contractor this probe did not create");
      await prisma.service.deleteMany({ where: { contractorId: solo.id } });
      await prisma.contractor.delete({ where: { id: solo.id } });
    }
  } finally {
    // Refuses to delete anything it did not create. The suffix is per-run, so
    // a probe cannot remove a contractor another run is using.
    const mine = await prisma.contractor.findUnique({ where: { id: c.id }, select: { slug: true } });
    if (!mine || !mine.slug.startsWith("g2-probe-")) {
      throw new Error("refusing to delete a contractor this probe did not create");
    }
    await prisma.service.deleteMany({ where: { contractorId: c.id } });
    await prisma.contractor.delete({ where: { id: c.id } });
  }

  // CORRELATED BY ID, NOT SLUG.
  //
  // `Service.slug` is unique PER CONTRACTOR — `@@unique([contractorId, slug])` —
  // so two contractors legitimately share one. Elite and BrightPath both have
  // `electrical-troubleshooting`. Matching the route-capable set by slug would
  // attribute one contractor's routing to another's service, which is a wrong
  // report even when the count happens to come out right.
  //
  // `active_service_has_trade` below covers the whole active set independently,
  // so a slug collision could not have hidden a missing trade. This is about the
  // narrower report naming the right services.
  const routing = await prisma.service.findMany({
    where: {
      active: true,
      questions: { some: { options: { some: { routeAction: "REROUTE_TROUBLESHOOTING" } } } },
    },
    select: { id: true },
  });
  const routesToTroubleshooting = new Set(routing.map((r) => r.id));

  // ── THE MODEL INVARIANT, over the LIVE catalog ─────────────────────────
  group("active_service_has_trade — every live service knows its trade");

  // BROADER THAN "can reach REROUTE_TROUBLESHOOTING", deliberately.
  //
  // The narrow version would pass while an ordinary active service sat there
  // with a null trade — invisible to every scoped lookup, and one authoring
  // edit away from becoming a service that routes. After the backfill every
  // live service has a trade, so there is no reason to permit a new one that
  // does not, and the tighter rule catches the hole at creation rather than at
  // the moment somebody adds a troubleshooting answer to it.
  const activeServices = await prisma.service.findMany({
    where: { active: true },
    select: { id: true, slug: true, tradeKey: true, contractor: { select: { slug: true } } },
    orderBy: { slug: "asc" },
  });
  const untraded = activeServices.filter((s) => !s.tradeKey);
  console.log(`  ${activeServices.length} active service(s) live`);
  ok("every active service has a tradeKey", untraded.length === 0,
    untraded.map((s) => `${s.contractor?.slug}/${s.slug}`).join(", "));

  // The narrower rule still stated separately: it is the one whose failure is a
  // customer-time surprise rather than a latent gap, so it is worth naming.
  const reachable = activeServices.filter((s) => routesToTroubleshooting.has(s.id));
  const reachableUntraded = reachable.filter((s) => !s.tradeKey);
  console.log(`  ${routesToTroubleshooting.size} of them can reach REROUTE_TROUBLESHOOTING`);
  ok("and every one that routes to troubleshooting can resolve a destination",
    reachableUntraded.length === 0,
    reachableUntraded.map((s) => `${s.contractor?.slug}/${s.slug}`).join(", "));

  console.log(
    `\n${failures === 0 ? "\x1b[32m" : "\x1b[31m"}${checks - failures}/${checks} checks passed\x1b[0m\n`
  );
  await prisma.$disconnect();
  if (failures > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
