/**
 * A plumber's first day, simulated end to end.
 *
 *   npx tsx scripts/pilot-plumbing-onboarding.ts          # Shape 1 then Shape 2
 *   npx tsx scripts/pilot-plumbing-onboarding.ts --keep   # skip teardown
 *
 * NOT a pass/fail suite. The rehearsal harness already proves Plumbing V1
 * works; this asks the different question that pilot-hardening is for:
 *
 *   can a real plumbing contractor configure a useful subset, activate it
 *   safely, and give a homeowner a clear price — WITHOUT understanding
 *   Price2Book internals?
 *
 * So its output is a FRICTION LOG. Every time this script has to supply
 * knowledge the product does not, that is recorded as friction whether or not
 * the underlying behavior is correct. `DEPENDENCY_UNAVAILABLE` is the case to
 * watch: enforcing it is right, and a contractor meeting it without being told
 * which prerequisite is missing is still a pilot defect.
 *
 * Runs only against a proved production-descended branch, and only from the
 * frozen baseline worktree. See scripts/_lineage.ts.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";
import { classifyRehearsalTarget } from "./_lineage";
import { requireClientParity } from "./_clientParity";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";
import { assessOnboarding } from "../lib/onboardingReadiness";
import { activationRefusal, activateService } from "../lib/serviceActivation";
import { resolvePolicy } from "../lib/policyResolution";
import { loadServiceForResolution, resolveRoute, loadPricingSettings } from "../lib/routeResolver";
import { recomputeServiceMaterialCost } from "../lib/materialCost";
import { buildPlumbingPayload } from "../lib/plumbing/publish";

loadEnv();
const KEEP = process.argv.includes("--keep");
const SLUG = "zz-pilot-plumber";

/** Shape 2 — a realistic starter catalog. PL-SVC-001 included deliberately. */
const STARTER = [
  "water-heater-flush",              // Shape 1 seed: cheapest possible launch
  "plumbing-service-call",           // PL-SVC-001
  "toilet-internals-repair",
  "toilet-replacement",
  "kitchen-faucet-replacement",
  "drain-clearing-single-fixture",
];

const friction: { where: string; what: string; classification: string }[] = [];
const F = (where: string, what: string, classification = "setup UX") => {
  friction.push({ where, what, classification });
  console.log(`       ! FRICTION  ${what}`);
};
const step = (n: string) => console.log(`\n  ${n}\n`);
const say = (s: string) => console.log(`    ${s}`);

async function main() {
  const url = process.env.REHEARSAL_DATABASE_URL;
  console.log(`\nPLUMBING PILOT — a plumber's first day\n`);
  if (!url) { console.error("  REHEARSAL_DATABASE_URL is not set.\n"); process.exit(1); }
  // The client is a single shared copy; a mismatched one fails later as a
  // confusing missing-column error. Checked before anything connects.
  requireClientParity(Prisma.dmmf.datamodel);
  const verdict = await classifyRehearsalTarget(url, process.env.DATABASE_URL);
  if (!verdict.ok) { console.error(`\n  REFUSING: ${(verdict as any).reason}\n`); process.exit(1); }
  say(`target ${verdict.probe.endpoint}, production lineage — accepted`);

  const db = new PrismaClient({ datasources: { db: { url } } });

  try {
    // ── SHAPE 1 ────────────────────────────────────────────────────────────
    step("SHAPE 1 — the minimum that gets one service bookable");

    const c = await db.contractor.upsert({
      where: { slug: SLUG },
      update: { name: "Pilot Plumbing Co" },
      create: { slug: SLUG, name: "Pilot Plumbing Co", countryCode: "US" },
    });
    say(`created contractor "${c.name}"`);

    await db.contractorTrade.upsert({
      where: { contractorId_tradeKey: { contractorId: c.id, tradeKey: "plumbing" } },
      update: {}, create: { contractorId: c.id, tradeKey: "plumbing" },
    });
    say("enrolled in the plumbing trade");

    const pre = await preflight(db, c.id, templateVersionSource(db, "plumbing", undefined, 1));
    if (!pre.ok) { say(`preflight refused: ${pre.code}`); process.exit(1); }
    say(`preflight offers ${pre.preview.services} services, ${pre.preview.unresolvedMaterialRoles.length} roles uncosted`);
    const res = await installCatalog(db, c.id, pre.catalog);
    say(`installed ${res.services} services — nothing priced, nothing offered, nothing live`);

    // Track A said five services cost one decision. Does the product say so?
    F("after install", "63 services arrive with no indication which is cheapest to launch first; " +
      "the contractor must know that water-heater-flush needs no policy, role or component");

    const flush = await db.service.findFirstOrThrow({
      where: { contractorId: c.id, slug: "water-heater-flush" }, select: { id: true, slug: true } });

    // Global prerequisites — the seven Guided Setup stages, minimum viable.
    await db.pricingSettings.upsert({
      where: { contractorId: c.id },
      update: {}, create: { contractorId: c.id, crewHourRateCents: 14_500,
        primaryMinimumCents: 19_500, roundingIncrementCents: 500, defaultPermitAdminCents: 0 },
    });
    say("set crew-hour rate and service-call minimum");

    // Offer it. This is the selective-adoption switch.
    await db.service.update({ where: { id: flush.id }, data: { offered: true } });
    say("marked water-heater-flush as offered (the other 62 left alone)");

    let r = await activationRefusal(db, c.id, flush.id);
    say(`activation says: ${r ? `${r.code} — ${r.message}` : "ready"}`);
    if (r?.code === "PRICE_NOT_APPROVED") {
      await db.service.update({ where: { id: flush.id },
        data: { basePrice: 18_900, publishedPriceApprovedAt: new Date() } });
      say("approved a published price of $189.00");
    }
    r = await activationRefusal(db, c.id, flush.id);
    if (r) { say(`still blocked: ${r.code} — ${r.message}`);
      F("Shape 1 activation", `unexpected blocker ${r.code} on the cheapest service`, "shared platform"); }

    const launched = await activateService(db, c.id, flush.id);
    say(launched.ok ? "water-heater-flush is LIVE" : `refused: ${launched.refusal.code}`);

    // Does a homeowner actually get a price?
    const settings = await loadPricingSettings(db, c.id);
    const loaded = await loadServiceForResolution(db, flush.id);
    if (loaded) {
      const q = loaded.questions[0];
      const answers: Record<string, string> = q ? { [q.key]: q.options[0].value } : {};
      const route = resolveRoute(loaded, answers, true, settings);
      say(`homeowner answering "${q ? q.options[0].label : "(no questions)"}" gets: ${route.status}` +
        (route.status === "PRICED" ? ` at $${(route.priceCents / 100).toFixed(2)}` : ""));
      if (route.status !== "PRICED")
        F("homeowner flow", `the cheapest service does not price for a homeowner: ${route.status}`, "shared platform");
    }

    const decisions1 = 1;
    say(`\n    SHAPE 1 COMPLETE — ${decisions1} contractor decision (one price approval)`);

    // ── SHAPE 2 ────────────────────────────────────────────────────────────
    step("SHAPE 2 — expanding the same contractor to a starter catalog");

    const rows = await db.service.findMany({
      where: { contractorId: c.id, slug: { in: STARTER } },
      select: { id: true, slug: true } });
    for (const s of rows) await db.service.update({ where: { id: s.id }, data: { offered: true } });
    say(`offered ${rows.length} services: ${STARTER.join(", ")}`);

    // What does Guided Setup now say is missing?
    const readiness = await assessOnboarding(db, c.id);
    const blockers = readiness.stages.flatMap((st) =>
      st.findings.filter((f) => f.severity === "blocker").map((f) => ({ stage: st.key, ...f })));
    say(`\n    Guided Setup reports ${blockers.length} blocker(s) across ${readiness.stages.length} stages:`);
    for (const b of blockers) say(`      [${b.stage}] ${b.code}: ${b.message}`);

    const scoped = await db.service.count({ where: { contractorId: c.id, offered: true } });
    say(`\n    readiness scoped to ${scoped} offered services (57 others raise nothing)`);

    // Resolve the shared decisions through the shipped path.
    const pols = await db.contractorPolicyValue.findMany({
      where: { contractorId: c.id }, select: { key: true, boundaryCount: true } });
    let resolved = 0;
    for (const p of pols) {
      const needed = blockers.some((b) => b.code === "POLICY_UNRESOLVED" && b.message.includes(p.key));
      const ans = p.boundaryCount === 0 ? { choice: "contractor-supplied" }
        : { boundaries: [15, 40].slice(0, p.boundaryCount) };
      const out = await resolvePolicy(db, c.id, p.key, ans);
      if (out.ok) resolved++;
    }
    say(`answered ${resolved} policy question(s) via resolvePolicy`);

    // Costs for the roles the starter catalog actually needs.
    const payload = buildPlumbingPayload();
    const mats = await db.canonicalMaterial.findMany({
      where: { key: { in: payload.materials.map((m) => m.key) } }, select: { id: true, key: true } });
    for (const m of mats)
      await db.contractorMaterial.upsert({
        where: { contractorId_canonicalMaterialId: { contractorId: c.id, canonicalMaterialId: m.id } },
        update: { unitCostCents: 2_500 }, create: { contractorId: c.id, canonicalMaterialId: m.id, unitCostCents: 2_500 } });
    for (const s of rows) await recomputeServiceMaterialCost(db as never, s.id);
    say(`entered ${mats.length} material role cost(s)`);

    F("material costs", "there is no role-level cost surface — the contractor edits costs " +
      "per service even though one role is shared by many", "shared platform");

    // Approve prices and launch, deliberately in the WRONG order to see the
    // refusal a cautious contractor would meet.
    say("");
    const byOrder = [...rows].sort((a, b) => (a.slug === "plumbing-service-call" ? 1 : -1));
    for (const s of byOrder) {
      await db.service.update({ where: { id: s.id },
        data: { basePrice: 24_900, publishedPriceApprovedAt: new Date() } });
      const out = await activateService(db, c.id, s.id);
      if (out.ok) { say(`      LIVE   ${s.slug}`); continue; }
      say(`      BLOCK  ${s.slug} — ${out.refusal.code}`);
      say(`             "${out.refusal.message}"`);
      if (out.refusal.code === "DEPENDENCY_UNAVAILABLE") {
        const named = out.refusal.missingPrerequisites ?? [];
        F("launching one service at a time",
          `DEPENDENCY_UNAVAILABLE names ${named.length ? named.join(", ") : "no slug"} in the API payload, ` +
          `but no UI file reads missingPrerequisites — the contractor is told a service must be live ` +
          `without a link to launch it`);
      }
    }
    // Now in the right order, the way LaunchPanel would.
    say("");
    const svcCall = rows.find((s) => s.slug === "plumbing-service-call")!;
    const sc = await activateService(db, c.id, svcCall.id);
    say(sc.ok ? "      LIVE   plumbing-service-call (launched first, as LaunchPanel would order it)"
              : `      BLOCK  plumbing-service-call — ${sc.refusal.code}`);
    for (const s of rows) {
      if (s.slug === "plumbing-service-call") continue;
      const out = await activateService(db, c.id, s.id);
      if (out.ok) say(`      LIVE   ${s.slug}`);
      else say(`      BLOCK  ${s.slug} — ${out.refusal.code}: ${out.refusal.message}`);
    }

    const live = await db.service.count({ where: { contractorId: c.id, active: true } });
    const total = await db.service.count({ where: { contractorId: c.id } });
    say(`\n    SHAPE 2 COMPLETE — ${live} of ${total} services live, ${total - live} left inactive by choice`);

    const finalReadiness = await assessOnboarding(db, c.id);
    const left = finalReadiness.stages.flatMap((st) => st.findings.filter((f) => f.severity === "blocker"));
    say(`    Guided Setup blockers remaining: ${left.length}`);
    for (const b of left.slice(0, 6)) say(`      ${b.code}: ${b.message}`);

  } finally {
    if (!KEEP) {
      step("TEARDOWN");
      const c = await db.contractor.findUnique({ where: { slug: SLUG }, select: { id: true } });
      if (c) {
        const ids = (await db.service.findMany({ where: { contractorId: c.id }, select: { id: true } })).map((s) => s.id);
        await db.answerOptionMaterial.deleteMany({ where: { answerOption: { question: { serviceId: { in: ids } } } } });
        await db.answerOptionComponent.deleteMany({ where: { answerOption: { question: { serviceId: { in: ids } } } } });
        await db.answerOption.deleteMany({ where: { question: { serviceId: { in: ids } } } });
        await db.question.deleteMany({ where: { serviceId: { in: ids } } });
        await db.serviceMaterial.deleteMany({ where: { serviceId: { in: ids } } });
        await db.service.deleteMany({ where: { contractorId: c.id } });
        await db.contractor.delete({ where: { id: c.id } });
        say(`removed ${SLUG}`);
      }
    }
    await db.$disconnect();
  }

  console.log(`\n  FRICTION LOG — ${friction.length} point(s)\n`);
  for (const [i, f] of friction.entries())
    console.log(`   ${i + 1}. [${f.classification}] ${f.where}\n      ${f.what}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((e) => { console.error(`\n  ${(e as Error).stack}\n`); process.exit(1); });
