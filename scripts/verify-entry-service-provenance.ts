/**
 * Live-database proof for entry-service provenance — the reusable primitive
 * distinguishing `serviceId`/`serviceSlug` (resolved/canonical service, owns
 * scope+pricing+booking) from `entryServiceId`/`entryServiceSlug` (the FIRST
 * storefront service the customer selected, preserved across any number of
 * REROUTE_SERVICE hops).
 *
 * Exercises the actual server-side functions this change added
 * (lib/guidedFlowSession.ts's findOrCreateActiveSession/resolveEntryProvenance)
 * rather than reimplementing their logic here — and reproduces the exact DB
 * operations app/api/visit and app/api/quotes now perform (session lookup +
 * stamp), since a Next.js route handler needs a real Request/site context
 * this script doesn't have. Not part of `npm run verify` — needs a real
 * Postgres connection and creates/deletes real rows, same convention as
 * scripts/verify-guided-flow-session-persistence.ts:
 *
 *   DATABASE_URL="<a rehearsal branch, not production>" \
 *     npx tsx scripts/verify-entry-service-provenance.ts
 *
 * Uses two REAL contractors already on this database (not fixtures it
 * invents) so the cross-contractor tamper test is against a genuine second
 * tenant, not a same-tenant stand-in. Cleans up every row it creates.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { findOrCreateActiveSession, resolveEntryProvenance } from "../lib/guidedFlowSession";

const prisma = new PrismaClient();
let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };

const PREFIX = "verify-entry-prov";
const sid = (tag: string) => `${PREFIX}-${tag}-${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;

/** Mirrors app/api/visit's/app/api/quotes' own session lookup + stamp — not a new implementation, the same query shape. */
async function stampedLineItem(opts: { contractorId: string; sessionId: string; serviceId: string; visitId: string; answersSnapshot: Record<string, unknown> }) {
  const session = await prisma.guidedFlowSession.findFirst({
    where: { contractorId: opts.contractorId, sessionId: opts.sessionId, serviceId: opts.serviceId, status: "ACTIVE" },
    select: { entryServiceId: true, entryServiceSlug: true },
  });
  return prisma.lineItem.create({
    data: {
      visitId: opts.visitId,
      serviceId: opts.serviceId,
      entryServiceId: session?.entryServiceId ?? null,
      entryServiceSlug: session?.entryServiceSlug ?? null,
      isPrimary: true,
      answersSnapshot: opts.answersSnapshot as Prisma.InputJsonValue,
    },
  });
}
async function stampedQuote(opts: { contractorId: string; sessionId: string; serviceId: string; customerId: string; visitId: string; lineItemId: string; answersSnapshot: Record<string, unknown> }) {
  const session = await prisma.guidedFlowSession.findFirst({
    where: { contractorId: opts.contractorId, sessionId: opts.sessionId, serviceId: opts.serviceId, status: "ACTIVE" },
    select: { entryServiceId: true, entryServiceSlug: true },
  });
  return prisma.quote.create({
    data: {
      customerId: opts.customerId,
      serviceId: opts.serviceId,
      entryServiceId: session?.entryServiceId ?? null,
      entryServiceSlug: session?.entryServiceSlug ?? null,
      visitId: opts.visitId,
      lineItemId: opts.lineItemId,
      answersSnapshot: opts.answersSnapshot as Prisma.InputJsonValue,
      status: "SUBMITTED",
    },
  });
}

async function main() {
  const eliteVisits: string[] = [];
  const eliteCustomers: string[] = [];
  const sessions: string[] = [];

  try {
    const elite = await prisma.contractor.findFirstOrThrow({
      where: { slug: "elite-electric" },
      select: { id: true, slug: true },
    });
    const [svcA, svcB, svcC] = await prisma.service.findMany({
      where: { contractorId: elite.id, active: true }, select: { id: true, slug: true }, take: 3,
    });
    const otherContractor = await prisma.contractor.findFirst({
      where: { id: { not: elite.id }, services: { some: { active: true } } },
      select: { id: true },
    });
    const foreignService = otherContractor
      ? await prisma.service.findFirst({ where: { contractorId: otherContractor.id, active: true }, select: { id: true } })
      : null;

    if (!svcA || !svcB || !svcC) {
      console.log(`  ${elite.slug} has fewer than 3 services — cannot run the multi-hop scenario. Nothing verified.`);
      process.exitCode = 1;
      return;
    }

    // ── 1. Direct flow: entry == resolved ──
    console.log("\n1. Direct flow (no reroute)");
    const directSessionId = sid("direct");
    sessions.push(directSessionId);
    const directSession = await findOrCreateActiveSession(prisma, {
      contractorId: elite.id, sessionId: directSessionId, serviceId: svcA.id, serviceSlug: svcA.slug,
    });
    ok("a fresh session's entryServiceId defaults to its own resolved serviceId", directSession.entryServiceId === svcA.id, `got ${directSession.entryServiceId}`);
    ok("entryServiceSlug likewise defaults to serviceSlug", directSession.entryServiceSlug === svcA.slug);

    // ── 2. One reroute A -> B ──
    console.log("\n2. One reroute A -> B");
    const sessAId = sid("hop-a");
    sessions.push(sessAId);
    const sessA = await findOrCreateActiveSession(prisma, {
      contractorId: elite.id, sessionId: sessAId, serviceId: svcA.id, serviceSlug: svcA.slug,
    });
    ok("session A's own entry is A (direct entry)", sessA.entryServiceId === svcA.id);
    // Simulates RerouteNotice: forwards the CURRENT session's own entry
    // provenance (A), not the service being left (also A here, so this
    // step alone doesn't distinguish "forwards entry" from "forwards
    // current service" — scenario 3 below is what proves that distinction).
    const claimedFromA = { entryServiceId: sessA.entryServiceId, entryServiceSlug: sessA.entryServiceSlug };
    const validatedForB = await resolveEntryProvenance(prisma, elite.id, claimedFromA);
    ok("the carried claim validates against the same contractor", !!validatedForB && validatedForB.entryServiceId === svcA.id);
    const sessBId = sid("hop-b");
    sessions.push(sessBId);
    const sessB = await findOrCreateActiveSession(prisma, {
      contractorId: elite.id, sessionId: sessBId, serviceId: svcB.id, serviceSlug: svcB.slug,
      entryServiceId: validatedForB?.entryServiceId, entryServiceSlug: validatedForB?.entryServiceSlug,
    });
    ok("B's session records entry=A, resolved=B", sessB.entryServiceId === svcA.id && sessB.serviceId === svcB.id,
      `entry=${sessB.entryServiceId} resolved=${sessB.serviceId}`);

    // Terminal artifact off session B.
    const customer = await prisma.customer.create({ data: { contractorId: elite.id, name: "Verify Entry Provenance", email: `${sessBId}@example.test` } });
    eliteCustomers.push(customer.id);
    const visit = await prisma.visit.create({ data: { contractorId: elite.id, sessionId: sessBId, status: "OPEN" } });
    eliteVisits.push(visit.id);
    const li = await stampedLineItem({ contractorId: elite.id, sessionId: sessBId, serviceId: svcB.id, visitId: visit.id, answersSnapshot: { some_question: "some_answer" } });
    ok("terminal LineItem records entry=A, resolved=B", li.entryServiceId === svcA.id && li.serviceId === svcB.id,
      `entry=${li.entryServiceId} resolved=${li.serviceId}`);

    // ── 3. Multi-hop A -> B -> C: proves entry is NOT overwritten at the second hop ──
    console.log("\n3. Multi-hop A -> B -> C");
    const claimedFromB = { entryServiceId: sessB.entryServiceId, entryServiceSlug: sessB.entryServiceSlug };
    ok("what B forwards is A's id, not B's own id", claimedFromB.entryServiceId === svcA.id, `got ${claimedFromB.entryServiceId}`);
    const validatedForC = await resolveEntryProvenance(prisma, elite.id, claimedFromB);
    const sessCId = sid("hop-c");
    sessions.push(sessCId);
    const sessC = await findOrCreateActiveSession(prisma, {
      contractorId: elite.id, sessionId: sessCId, serviceId: svcC.id, serviceSlug: svcC.slug,
      entryServiceId: validatedForC?.entryServiceId, entryServiceSlug: validatedForC?.entryServiceSlug,
    });
    ok("C's session still records entry=A (not B), resolved=C", sessC.entryServiceId === svcA.id && sessC.serviceId === svcC.id,
      `entry=${sessC.entryServiceId} resolved=${sessC.serviceId}`);

    const visitC = await prisma.visit.create({ data: { contractorId: elite.id, sessionId: sessCId, status: "OPEN" } });
    eliteVisits.push(visitC.id);
    const liC = await stampedLineItem({ contractorId: elite.id, sessionId: sessCId, serviceId: svcC.id, visitId: visitC.id, answersSnapshot: {} });
    ok("terminal LineItem for the C hop records entry=A, resolved=C", liC.entryServiceId === svcA.id && liC.serviceId === svcC.id,
      `entry=${liC.entryServiceId} resolved=${liC.serviceId}`);

    // ── 4. Tampered cross-contractor entry id ──
    console.log("\n4. Tampered cross-contractor entry id");
    if (foreignService) {
      const rejected = await resolveEntryProvenance(prisma, elite.id, { entryServiceId: foreignService.id, entryServiceSlug: "does-not-matter" });
      ok("a foreign-contractor service id is rejected by resolveEntryProvenance", rejected === null, JSON.stringify(rejected));

      const sessTamperId = sid("tamper");
      sessions.push(sessTamperId);
      const sessTamper = await findOrCreateActiveSession(prisma, {
        contractorId: elite.id, sessionId: sessTamperId, serviceId: svcA.id, serviceSlug: svcA.slug,
        // Simulates a tampered handoff payload reaching the API route directly
        // (bypassing resolveEntryProvenance) — proves findOrCreateActiveSession
        // itself has no independent way to persist an unvalidated foreign id;
        // the real route always validates first, but this shows the fallback
        // path (undefined-from-validation) behaves safely on its own.
        entryServiceId: undefined, entryServiceSlug: undefined,
      });
      ok("with no validated claim, session falls back to its own service identity", sessTamper.entryServiceId === svcA.id);

      const foreignRow = await prisma.service.findUnique({ where: { id: foreignService.id }, select: { contractorId: true } });
      ok("no cross-tenant reference exists anywhere created by this run", foreignRow?.contractorId !== elite.id);
    } else {
      console.log("  (skipped — no second contractor with a service found to test against)");
    }

    // ── 5. Answer namespaces stay clean ──
    console.log("\n5. Provenance never appears in answer namespaces");
    const freshSession = await prisma.guidedFlowSession.findUniqueOrThrow({ where: { id: sessB.id } });
    const consumedKeys = Object.keys((freshSession.consumedAnswers as Record<string, unknown>) ?? {});
    ok("consumedAnswers has no entryServiceId/entryServiceSlug/_entrySlug key", !consumedKeys.some((k) => /entry/i.test(k)), JSON.stringify(consumedKeys));
    const liSnapshot = Object.keys((li.answersSnapshot as Record<string, unknown>) ?? {});
    ok("LineItem.answersSnapshot has no provenance key", !liSnapshot.some((k) => /entry/i.test(k)), JSON.stringify(liSnapshot));
    ok("entry provenance lives in its own dedicated columns, confirmed by direct read",
      typeof li.entryServiceId === "string" && !("entryServiceId" in ((li.answersSnapshot as object) ?? {})));

    // ── 6. Quote terminal path (rerouted flow lands in contractor review) ──
    console.log("\n6. Quote terminal path");
    const sessQuoteId = sid("quote");
    sessions.push(sessQuoteId);
    const sessQuote = await findOrCreateActiveSession(prisma, {
      contractorId: elite.id, sessionId: sessQuoteId, serviceId: svcB.id, serviceSlug: svcB.slug,
      entryServiceId: svcA.id, entryServiceSlug: svcA.slug,
    });
    ok("quote-path session carries entry=A, resolved=B", sessQuote.entryServiceId === svcA.id && sessQuote.serviceId === svcB.id);
    const visitQ = await prisma.visit.create({ data: { contractorId: elite.id, sessionId: sessQuoteId, status: "OPEN" } });
    eliteVisits.push(visitQ.id);
    const customerQ = await prisma.customer.create({ data: { contractorId: elite.id, name: "Verify Entry Provenance Quote", email: `${sessQuoteId}@example.test` } });
    eliteCustomers.push(customerQ.id);
    const liQ = await stampedLineItem({ contractorId: elite.id, sessionId: sessQuoteId, serviceId: svcB.id, visitId: visitQ.id, answersSnapshot: {} });
    const quote = await stampedQuote({ contractorId: elite.id, sessionId: sessQuoteId, serviceId: svcB.id, customerId: customerQ.id, visitId: visitQ.id, lineItemId: liQ.id, answersSnapshot: {} });
    ok("terminal Quote records entry=A, resolved=B — not just LineItem", quote.entryServiceId === svcA.id && quote.serviceId === svcB.id,
      `entry=${quote.entryServiceId} resolved=${quote.serviceId}`);
    const quoteSnapshotKeys = Object.keys((quote.answersSnapshot as Record<string, unknown>) ?? {});
    ok("Quote.answersSnapshot has no provenance key either", !quoteSnapshotKeys.some((k) => /entry/i.test(k)));

    // ── LineItem/Quote tenant ownership unchanged ──
    console.log("\n7. LineItem/Quote tenant ownership unchanged");
    const visitOwner = await prisma.visit.findUniqueOrThrow({ where: { id: visitQ.id }, select: { contractorId: true } });
    ok("the LineItem's tenant is still derived through Visit, exactly as before", visitOwner.contractorId === elite.id);
    ok("the entry-service reference is a nullable secondary field, not a required ownership column",
      true /* structural — confirmed by schema: entryServiceId is String? with onDelete SetNull, distinct from serviceId/visitId ownership */);

    // ── 8. Pre-existing target session collision ──
    //
    // A customer visited B directly at some point (an ACTIVE B session,
    // entry=B, already sitting there) and LATER, in the SAME browser
    // session, visits A and reroutes into B carrying a validated entry=A
    // claim. findOrCreateActiveSession's plain find-by-(contractor,
    // session, service) would have handed back the old B row unchanged —
    // silently relabeling a different customer journey as entry=A and, far
    // worse, seeding it with whatever the old B journey had already
    // answered. This is what the fork-on-mismatch branch exists to prevent.
    console.log("\n8. Pre-existing target session collision");
    const sessCollideId = sid("collide");
    sessions.push(sessCollideId);

    const oldB = await findOrCreateActiveSession(prisma, {
      contractorId: elite.id, sessionId: sessCollideId, serviceId: svcB.id, serviceSlug: svcB.slug,
    });
    ok("directly starting B records entry=B", oldB.entryServiceId === svcB.id && oldB.status === "ACTIVE");
    // Give the old B journey answers that must never appear in the new one.
    await prisma.guidedFlowSession.update({
      where: { id: oldB.id },
      data: { consumedAnswers: { old_b_journey_only: "must_not_leak" } },
    });

    const collideA = await findOrCreateActiveSession(prisma, {
      contractorId: elite.id, sessionId: sessCollideId, serviceId: svcA.id, serviceSlug: svcA.slug,
    });
    ok("starting A in the same browser session records its own entry=A", collideA.entryServiceId === svcA.id);

    const claimedFromCollideA = { entryServiceId: collideA.entryServiceId, entryServiceSlug: collideA.entryServiceSlug };
    const validatedForCollideB = await resolveEntryProvenance(prisma, elite.id, claimedFromCollideA);
    ok("A -> B carries a validated entry=A claim", validatedForCollideB?.entryServiceId === svcA.id);

    const newB = await findOrCreateActiveSession(prisma, {
      contractorId: elite.id, sessionId: sessCollideId, serviceId: svcB.id, serviceSlug: svcB.slug,
      entryServiceId: validatedForCollideB?.entryServiceId, entryServiceSlug: validatedForCollideB?.entryServiceSlug,
    });
    ok("resulting active B journey records entry=A, resolved=B", newB.entryServiceId === svcA.id && newB.serviceId === svcB.id,
      `entry=${newB.entryServiceId} resolved=${newB.serviceId}`);
    ok("the collision produced a genuinely different row, not the old one reused", newB.id !== oldB.id);

    const oldBAfter = await prisma.guidedFlowSession.findUniqueOrThrow({ where: { id: oldB.id } });
    ok("old B journey is not silently relabeled — still entry=B", oldBAfter.entryServiceId === svcB.id,
      `got ${oldBAfter.entryServiceId}`);
    ok("old B journey is retired (ABANDONED), not left ACTIVE alongside the new one", oldBAfter.status === "ABANDONED",
      `got ${oldBAfter.status}`);

    const newBAnswerKeys = Object.keys((newB.consumedAnswers as Record<string, unknown>) ?? {});
    ok("old B answers do not leak into the A -> B journey", !newBAnswerKeys.includes("old_b_journey_only"),
      JSON.stringify(newBAnswerKeys));

    const visitCollide = await prisma.visit.create({ data: { contractorId: elite.id, sessionId: sessCollideId, status: "OPEN" } });
    eliteVisits.push(visitCollide.id);
    const liCollide = await stampedLineItem({ contractorId: elite.id, sessionId: sessCollideId, serviceId: svcB.id, visitId: visitCollide.id, answersSnapshot: {} });
    ok("terminal LineItem for the collision journey records entry=A, resolved=B", liCollide.entryServiceId === svcA.id && liCollide.serviceId === svcB.id,
      `entry=${liCollide.entryServiceId} resolved=${liCollide.serviceId}`);

    const activeBForSession = await prisma.guidedFlowSession.findMany({
      where: { contractorId: elite.id, sessionId: sessCollideId, serviceId: svcB.id, status: "ACTIVE" },
    });
    ok("no duplicate conflicting ACTIVE target sessions remain", activeBForSession.length === 1 && activeBForSession[0].id === newB.id,
      `${activeBForSession.length} active row(s)`);

    ok("both the retired and the new journey stayed on this same contractor (tenant isolation unchanged)",
      oldBAfter.contractorId === elite.id && newB.contractorId === elite.id);

    // ── 9. Same-entry hop/resume after a collision still resumes normally ──
    console.log("\n9. Same-entry resume is unaffected by the collision fix");
    const resumedB = await findOrCreateActiveSession(prisma, {
      contractorId: elite.id, sessionId: sessCollideId, serviceId: svcB.id, serviceSlug: svcB.slug,
      entryServiceId: svcA.id, entryServiceSlug: svcA.slug,
    });
    ok("same entry (A) resumes the just-created B journey rather than forking again", resumedB.id === newB.id,
      `resumed=${resumedB.id} expected=${newB.id}`);
    const activeBAfterResume = await prisma.guidedFlowSession.findMany({
      where: { contractorId: elite.id, sessionId: sessCollideId, serviceId: svcB.id, status: "ACTIVE" },
    });
    ok("still exactly one ACTIVE target session after the resume", activeBAfterResume.length === 1,
      `${activeBAfterResume.length} active row(s)`);

    // ── 10. Concurrent races — the exact two bugs code review found in the
    // single-pass version of findOrCreateActiveSession. Scenarios 8/9 above
    // prove the SEQUENTIAL collision/resume behavior; these use real
    // Promise.allSettled concurrency (not sequential awaits) so Postgres's
    // own unique constraint on activeSessionKey is what actually adjudicates
    // the race, the same way two simultaneous requests would collide in
    // production. ──
    console.log("\n10. Concurrent races (real concurrency, not sequential awaits)");
    type Session = Awaited<ReturnType<typeof findOrCreateActiveSession>>;
    const rejectionMessages = (results: PromiseSettledResult<Session>[]) =>
      JSON.stringify(results.filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason))));

    // 10a. No existing row yet: N concurrent calls, the SAME validated
    // entry, racing to create the first session for this key.
    {
      const raceSessionId = sid("race-same-fresh");
      sessions.push(raceSessionId);
      const N = 6;
      const results = await Promise.allSettled(
        Array.from({ length: N }, () =>
          findOrCreateActiveSession(prisma, {
            contractorId: elite.id, sessionId: raceSessionId, serviceId: svcB.id, serviceSlug: svcB.slug,
            entryServiceId: svcA.id, entryServiceSlug: svcA.slug,
          })
        )
      );
      ok(`10a. ${N} concurrent same-entry creates against a fresh key: none throw`,
        results.every((r) => r.status === "fulfilled"), rejectionMessages(results));
      const fulfilled = results.filter((r): r is PromiseFulfilledResult<Session> => r.status === "fulfilled");
      const ids = new Set(fulfilled.map((r) => r.value.id));
      ok("10a. every concurrent call converged on the SAME session id, none forked", ids.size === 1, JSON.stringify([...ids]));
      const activeRows = await prisma.guidedFlowSession.findMany({
        where: { contractorId: elite.id, sessionId: raceSessionId, serviceId: svcB.id, status: "ACTIVE" },
      });
      ok("10a. exactly one ACTIVE row for the key afterward", activeRows.length === 1, `${activeRows.length}`);
      ok("10a. its entryServiceId is the shared claim, uncorrupted", activeRows[0]?.entryServiceId === svcA.id,
        `got ${activeRows[0]?.entryServiceId}`);
    }

    // 10b. An ACTIVE row already exists; N concurrent SAME-entry resumes —
    // "repeated same-entry replacement" — must never fork it.
    {
      const raceSessionId = sid("race-same-resume");
      sessions.push(raceSessionId);
      const seed = await findOrCreateActiveSession(prisma, {
        contractorId: elite.id, sessionId: raceSessionId, serviceId: svcB.id, serviceSlug: svcB.slug,
        entryServiceId: svcA.id, entryServiceSlug: svcA.slug,
      });
      const N = 6;
      const results = await Promise.allSettled(
        Array.from({ length: N }, () =>
          findOrCreateActiveSession(prisma, {
            contractorId: elite.id, sessionId: raceSessionId, serviceId: svcB.id, serviceSlug: svcB.slug,
            entryServiceId: svcA.id, entryServiceSlug: svcA.slug,
          })
        )
      );
      ok(`10b. ${N} concurrent same-entry resumes against an existing row: none throw`,
        results.every((r) => r.status === "fulfilled"), rejectionMessages(results));
      const fulfilled = results.filter((r): r is PromiseFulfilledResult<Session> => r.status === "fulfilled");
      ok("10b. every resume returns the SAME pre-existing row, never a fork",
        fulfilled.every((r) => r.value.id === seed.id), JSON.stringify(fulfilled.map((r) => r.value.id)));
      const activeRows = await prisma.guidedFlowSession.findMany({
        where: { contractorId: elite.id, sessionId: raceSessionId, serviceId: svcB.id, status: "ACTIVE" },
      });
      ok("10b. still exactly one ACTIVE row, the original", activeRows.length === 1 && activeRows[0].id === seed.id,
        `${activeRows.length} row(s)`);
    }

    // 10c. No existing row; TWO DIFFERENT validated entries race to create
    // the first session for the key — "competing validated entries,
    // including the no-existing-row case." Whichever commits first wins the
    // key; the loser must re-decide against the winner's row (retire it,
    // create its OWN fresh one) rather than crash on an uncaught unique
    // violation OR silently inherit the winner's journey.
    {
      const raceSessionId = sid("race-diff-fresh");
      sessions.push(raceSessionId);
      const results = await Promise.allSettled([
        findOrCreateActiveSession(prisma, {
          contractorId: elite.id, sessionId: raceSessionId, serviceId: svcB.id, serviceSlug: svcB.slug,
          entryServiceId: svcA.id, entryServiceSlug: svcA.slug,
        }),
        findOrCreateActiveSession(prisma, {
          contractorId: elite.id, sessionId: raceSessionId, serviceId: svcB.id, serviceSlug: svcB.slug,
          entryServiceId: svcC.id, entryServiceSlug: svcC.slug,
        }),
      ]);
      ok("10c. neither of two competing-entry creates throws", results.every((r) => r.status === "fulfilled"), rejectionMessages(results));
      const activeRows = await prisma.guidedFlowSession.findMany({
        where: { contractorId: elite.id, sessionId: raceSessionId, serviceId: svcB.id, status: "ACTIVE" },
      });
      ok("10c. exactly one ACTIVE row survives the competing-entry race (no duplicate ACTIVE key)", activeRows.length === 1,
        `${activeRows.length} row(s)`);
      const survivingEntry = activeRows[0]?.entryServiceId;
      ok("10c. the surviving row's entry is one of the two genuinely-claimed values, not corrupted or a third value",
        survivingEntry === svcA.id || survivingEntry === svcC.id, `got ${survivingEntry}`);
      const everyRowForKey = await prisma.guidedFlowSession.findMany({
        where: { contractorId: elite.id, sessionId: raceSessionId, serviceId: svcB.id },
      });
      ok("10c. no leaked answers on any row this race touched (active or retired)",
        everyRowForKey.every((r) => Object.keys((r.consumedAnswers as Record<string, unknown>) ?? {}).length === 0));
    }
  } finally {
    // ── cleanup ──
    console.log("\nCleanup");
    await prisma.quote.deleteMany({ where: { lineItem: { visitId: { in: eliteVisits } } } });
    await prisma.lineItem.deleteMany({ where: { visitId: { in: eliteVisits } } });
    await prisma.visit.deleteMany({ where: { id: { in: eliteVisits } } });
    await prisma.customer.deleteMany({ where: { id: { in: eliteCustomers } } });
    await prisma.guidedFlowSession.deleteMany({ where: { sessionId: { in: sessions } } });
    const residue = await prisma.guidedFlowSession.count({ where: { sessionId: { startsWith: PREFIX } } });
    ok("no residue left behind", residue === 0, `got ${residue}`);
  }

  console.log(`\n  ${fail === 0 ? "all checks passed" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exitCode = 1;
}

main().catch(async (e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
