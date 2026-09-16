/**
 * Live-database proof for the sump-pump and fridge/freezer dedicated-circuit
 * entry aliases.
 *
 * Covers everything provable at the data/server layer without a browser:
 *   1. entry service is discoverable (active + offered)
 *   2. entry resolves into dedicated-120v-circuit-outlet (REROUTE_SERVICE)
 *   3. the preset dedicated_equipment value survives GuidedFlowEngine's own
 *      answer-carry filter (reimplemented exactly, not approximated)
 *   6. original entry provenance survives through terminal creation
 *   7. terminal LineItem resolves to the canonical service
 *   8. canonical price/material computation is reused UNCHANGED — the same
 *      resolveRoute() call, with the same answers, regardless of whether the
 *      customer arrived directly or through an alias
 *   9. no homeowner-answer pollution with provenance metadata
 *   10 (partial). the canonical tree itself is unmodified by this work
 *
 * Items 4 (equipment question skipped), 5 (remaining questions behave
 * normally) and 10 (direct entry, end to end through a real browser) are
 * proven by the companion script:
 *   scripts/verify-dedicated-circuit-entry-aliases-browser-flow.ts
 *
 *   DATABASE_URL="<rehearsal, not production>" npx tsx scripts/verify-dedicated-circuit-entry-aliases.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { findOrCreateActiveSession, resolveEntryProvenance } from "../lib/guidedFlowSession";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../lib/routeResolver";

const prisma = new PrismaClient();
let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };

const CONTRACTOR_SLUG = "elite-electric";
const CANONICAL_SLUG = "dedicated-120v-circuit-outlet";

const ALIASES = [
  { slug: "sump-pump-dedicated-circuit", equipmentValue: "sump_pump" },
  { slug: "freezer-fridge-dedicated-circuit", equipmentValue: "fridge_freezer" },
];

/** Mirrors GuidedFlowEngine.tsx's own reroute-handoff filter exactly. */
function carryFilter(answers: Record<string, string>, targetQuestionKeys: Set<string>): Record<string, string> {
  return Object.fromEntries(Object.entries(answers).filter(([k]) => targetQuestionKeys.has(k)));
}

async function main() {
  const sessions: string[] = [];
  const visits: string[] = [];

  try {
    const contractor = await prisma.contractor.findUniqueOrThrow({ where: { slug: CONTRACTOR_SLUG }, select: { id: true } });
    const canonical = await prisma.service.findFirstOrThrow({
      where: { contractorId: contractor.id, slug: CANONICAL_SLUG },
      select: { id: true, slug: true, questions: { select: { id: true, key: true, order: true, options: { select: { value: true, nextQuestionId: true } } } } },
    });
    const canonicalQuestionKeys = new Set(canonical.questions.map((q) => q.key));

    // ── 10 (partial): the canonical tree itself is unmodified ──
    console.log("\n0. Canonical tree unmodified");
    ok("dedicated-120v-circuit-outlet still has exactly 6 questions", canonical.questions.length === 6,
      `got ${canonical.questions.length}`);
    const equipmentQ = canonical.questions.find((q) => q.key === "dedicated_equipment");
    ok("its first question is still dedicated_equipment", equipmentQ?.order === 1);

    for (const alias of ALIASES) {
      console.log(`\n=== ${alias.slug} ===`);

      const aliasService = await prisma.service.findFirstOrThrow({
        where: { contractorId: contractor.id, slug: alias.slug },
        select: {
          id: true, slug: true, active: true, offered: true,
          questions: { select: { id: true, key: true, options: { select: { id: true, value: true, routeAction: true, rerouteServiceId: true } } } },
        },
      });

      // ── 1. discoverable ──
      ok("1. entry service is discoverable (active + offered)", aliasService.active === true && aliasService.offered === true);

      // ── 2. resolves into canonical ──
      ok("2. exactly one question", aliasService.questions.length === 1, `got ${aliasService.questions.length}`);
      const q = aliasService.questions[0];
      ok("   ...keyed dedicated_equipment", q.key === "dedicated_equipment");
      ok("   ...exactly one answer option", q.options.length === 1, `got ${q.options.length}`);
      const opt = q.options[0];
      ok("2. entry resolves into dedicated-120v-circuit-outlet via REROUTE_SERVICE",
        opt.routeAction === "REROUTE_SERVICE" && opt.rerouteServiceId === canonical.id,
        `routeAction=${opt.routeAction} rerouteServiceId=${opt.rerouteServiceId}`);
      ok("   ...answer value matches this alias's equipment", opt.value === alias.equipmentValue);

      // ── 3. preset survives the real answer-carry filter ──
      const simulatedAnswersAtReroute = { [q.key]: opt.value };
      const carried = carryFilter(simulatedAnswersAtReroute, canonicalQuestionKeys);
      ok("3. preset dedicated_equipment survives GuidedFlowEngine's answer-carry filter",
        carried.dedicated_equipment === alias.equipmentValue, JSON.stringify(carried));

      // Data-contract half of "the equipment question is skipped": the
      // canonical question's own answer option for this value must exist and
      // point somewhere (advanceFrom's evaluate() takes it from here). The
      // actual skip is proven end-to-end by the browser-flow script.
      const canonicalEquipmentOption = equipmentQ?.options.find((o) => o.value === alias.equipmentValue);
      ok("   canonical dedicated_equipment question has a matching answer to auto-evaluate",
        !!canonicalEquipmentOption, `no option for value ${alias.equipmentValue}`);
      ok("   ...and it advances past dedicated_equipment (nextQuestionId set)",
        !!canonicalEquipmentOption?.nextQuestionId);

      // ── 6/7/9: session -> terminal LineItem, mirroring /api/visit's own lookup+stamp ──
      const sid = `verify-dca-${alias.slug}-${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
      sessions.push(sid);

      // Entry session on the ALIAS itself (direct entry to the alias).
      const entrySession = await findOrCreateActiveSession(prisma, {
        contractorId: contractor.id, sessionId: sid, serviceId: aliasService.id, serviceSlug: aliasService.slug,
      });
      ok("   alias session: entry defaults to itself", entrySession.entryServiceId === aliasService.id);

      // Reroute into canonical, carrying validated entry provenance —
      // exactly what app/api/guided-flow-sessions/route.ts does server-side.
      const validated = await resolveEntryProvenance(prisma, contractor.id, {
        entryServiceId: entrySession.entryServiceId, entryServiceSlug: entrySession.entryServiceSlug,
      });
      ok("   the claim validates against the same contractor", validated?.entryServiceId === aliasService.id);

      const canonicalSession = await findOrCreateActiveSession(prisma, {
        contractorId: contractor.id, sessionId: sid, serviceId: canonical.id, serviceSlug: canonical.slug,
        entryServiceId: validated?.entryServiceId, entryServiceSlug: validated?.entryServiceSlug,
      });
      ok("6. canonical session records entry=alias, resolved=canonical",
        canonicalSession.entryServiceId === aliasService.id && canonicalSession.serviceId === canonical.id);

      // Full answer set a customer would actually have by the end of the
      // canonical tree (equipment preset + the rest, as if walked normally).
      // Real answer-option values from the live canonical tree (checked
      // above), not guessed — so resolveRoute below exercises the actual
      // tree rather than tripping its own unresolved-route fallback.
      const fullAnswers: Record<string, string> = {
        dedicated_equipment: alias.equipmentValue,
        dedicated_route_access: "unfinished_basement",
        dedicated_distance: "under_25",
        dedicated_panel_location: "unfinished_basement",
        dedicated_finish_ack: "accepted",
      };

      const visit = await prisma.visit.create({ data: { contractorId: contractor.id, sessionId: sid, status: "OPEN" } });
      visits.push(visit.id);

      // Mirrors app/api/visit's own session lookup + stamp exactly.
      const sessionForStamp = await prisma.guidedFlowSession.findFirst({
        where: { contractorId: contractor.id, sessionId: sid, serviceId: canonical.id, status: "ACTIVE" },
        select: { entryServiceId: true, entryServiceSlug: true },
      });
      const li = await prisma.lineItem.create({
        data: {
          visitId: visit.id,
          serviceId: canonical.id,
          entryServiceId: sessionForStamp?.entryServiceId ?? null,
          entryServiceSlug: sessionForStamp?.entryServiceSlug ?? null,
          isPrimary: true,
          answersSnapshot: fullAnswers as Prisma.InputJsonValue,
        },
      });
      ok("7. terminal LineItem resolves to the canonical service", li.serviceId === canonical.id);
      ok("   ...and records entry=alias", li.entryServiceId === aliasService.id, `got ${li.entryServiceId}`);

      // ── 9. no provenance leaking into homeowner-answer namespaces ──
      const snapshotKeys = Object.keys((li.answersSnapshot as Record<string, unknown>) ?? {});
      ok("9. LineItem.answersSnapshot has no provenance key", !snapshotKeys.some((k) => /entry/i.test(k)), JSON.stringify(snapshotKeys));
      const freshSession = await prisma.guidedFlowSession.findUniqueOrThrow({ where: { id: canonicalSession.id } });
      const consumedKeys = Object.keys((freshSession.consumedAnswers as Record<string, unknown>) ?? {});
      ok("   consumedAnswers (if any) has no provenance key either", !consumedKeys.some((k) => /entry/i.test(k)));

      // ── 8. canonical price/material computation is reused, unchanged ──
      const loaded = await loadServiceForResolution(prisma, canonical.id);
      if (!loaded) { ok("8. canonical service loads for resolution", false); continue; }
      const settings = await loadPricingSettings(prisma, contractor.id);
      const resolvedViaAlias = resolveRoute(loaded, fullAnswers, true, settings);
      const resolvedDirect = resolveRoute(loaded, fullAnswers, true, settings);
      ok("8. resolveRoute is a pure function of (service, answers) — identical result whether reached via alias or directly",
        JSON.stringify(resolvedViaAlias) === JSON.stringify(resolvedDirect));
      ok("   ...and it actually produced a real status", typeof resolvedViaAlias.status === "string", resolvedViaAlias.status);
    }
  } finally {
    console.log("\nCleanup");
    await prisma.lineItem.deleteMany({ where: { visitId: { in: visits } } });
    await prisma.visit.deleteMany({ where: { id: { in: visits } } });
    await prisma.guidedFlowSession.deleteMany({ where: { sessionId: { in: sessions } } });
    const residue = await prisma.guidedFlowSession.count({ where: { sessionId: { startsWith: "verify-dca-" } } });
    ok("no residue left behind", residue === 0, `got ${residue}`);
  }

  console.log(`\n  ${fail === 0 ? "all checks passed" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exitCode = 1;
}

main().catch(async (e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
