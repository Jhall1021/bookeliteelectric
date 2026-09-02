/**
 * Track B — one plumbing contractor, through the shipped path, start to finish.
 *
 *   npx tsx scripts/pilot-plumbing-onboarding.ts          # Shape 1 then Shape 2
 *   npx tsx scripts/pilot-plumbing-onboarding.ts --keep   # leave the contractor
 *
 * NOT a pass/fail suite. It is a WALK: every step a real contractor would take,
 * in the order Guided Setup presents them, using only the shipped authorities —
 * preflight/installCatalog, resolvePolicy, activationRefusal/activateService,
 * assessOnboarding, resolveRoute.
 *
 * What it is actually measuring is FRICTION: each point where the contractor
 * needs a fact the interface never gave them. Those are recorded even when the
 * step succeeds, because knowing the workaround is not the same as the product
 * telling you.
 *
 * Refuses to run anywhere that is not a proven branch of production.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";
import { classifyRehearsalTarget } from "./_lineage";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";
import { resolvePolicy } from "../lib/policyResolution";
import { activationRefusal, activateService } from "../lib/serviceActivation";
import { assessOnboarding } from "../lib/onboardingReadiness";
import { loadServiceForResolution, resolveRoute, loadPricingSettings } from "../lib/routeResolver";
import { buildPlumbingPayload } from "../lib/plumbing/publish";

loadEnv();
const KEEP = process.argv.includes("--keep");
const SLUG = "zz-pilot-plumbing";

const friction: { step: string; needed: string; classify: string }[] = [];
const rub = (step: string, needed: string, classify: string) => {
  friction.push({ step, needed, classify });
  console.log(`    ~~ FRICTION [${classify}] ${needed}`);
};
const step = (n: string) => console.log(`\n  ${n}`);
const note = (s: string) => console.log(`     ${s}`);

/** What Guided Setup would show the contractor right now. */
async function whatTheyAreTold(db: PrismaClient, contractorId: string, label: string) {
  const r = await assessOnboarding(db, contractorId);
  const blockers = r.stages.flatMap((s) => s.findings.filter((f) => f.severity === "blocker").map((f) => `${s.key}: ${f.message}`));
  console.log(`     [${label}] ${blockers.length} blocker(s)`);
  for (const b of blockers.slice(0, 6)) console.log(`        - ${b}`);
  if (blockers.length > 6) console.log(`        ... and ${blockers.length - 6} more`);
  return blockers;
}

async function main() {
  const url = process.env.REHEARSAL_DATABASE_URL;
  if (!url) { console.error("\n  REHEARSAL_DATABASE_URL is not set.\n"); process.exit(1); }
  const v = await classifyRehearsalTarget(url, process.env.DATABASE_URL);
  console.log(`\nPLUMBING PILOT — ONBOARDING WALK\n`);
  if (!v.ok) { console.error(`  REFUSING (${(v as any).code}): ${(v as any).reason}\n`); process.exit(1); }
  console.log(`  target ${v.probe.endpoint}  lineage ${v.probe.lineage}\n`);

  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    // ── BUSINESS ─────────────────────────────────────────────────────────
    step("STAGE 1 — Business");
    const c = await db.contractor.upsert({
      where: { slug: SLUG },
      update: { name: "Pilot Plumbing Co" },
      create: { slug: SLUG, name: "Pilot Plumbing Co", countryCode: "US", phone: "555-0100" },
    });
    // contractorId is not unique on ContractorSite — a contractor may have more
    // than one storefront — so this is find-then-create, not upsert.
    const existingSite = await db.contractorSite.findFirst({ where: { contractorId: c.id }, select: { id: true } });
    if (!existingSite)
      await db.contractorSite.create({
        data: { contractorId: c.id, publicId: `pilot-${Date.now()}`, hostedSlug: SLUG },
      });
    note("name, country, phone, storefront created");
    await whatTheyAreTold(db, c.id, "after business");

    // ── TRADE ────────────────────────────────────────────────────────────
    step("STAGE 2 — Trade: enrol in Plumbing and install the catalog");
    await db.contractorTrade.upsert({
      where: { contractorId_tradeKey: { contractorId: c.id, tradeKey: "plumbing" } },
      update: {}, create: { contractorId: c.id, tradeKey: "plumbing" },
    });
    const pre = await preflight(db, c.id, templateVersionSource(db, "plumbing", undefined, 1));
    if (!pre.ok) { console.error(`  preflight refused: ${pre.code}`); process.exit(1); }
    const inst = await installCatalog(db, c.id, pre.catalog);
    note(`installed ${inst.services} services, ${inst.unresolvedMaterialRoles} material role(s) unresolved`);
    rub("trade", "63 services arrive at once with no suggestion of where to start, and no statement that leaving most inactive is a complete setup.", "setup UX");
    await whatTheyAreTold(db, c.id, "after install");

    // ── PRICING FOUNDATION ───────────────────────────────────────────────
    step("STAGE 3 — Pricing foundation");
    await db.pricingSettings.upsert({
      where: { contractorId: c.id },
      update: {}, create: { contractorId: c.id, crewHourRateCents: 14_500, primaryMinimumCents: 19_500,
        roundingIncrementCents: 500, defaultPermitAdminCents: 0 },
    });
    note("crew-hour rate 145.00, service-call minimum 195.00");

    // ── SHAPE 1 ──────────────────────────────────────────────────────────
    step("SHAPE 1 — one bookable service: water-heater-flush");
    const flush = await db.service.findFirstOrThrow({
      where: { contractorId: c.id, slug: "water-heater-flush" }, select: { id: true, slug: true } });
    await db.service.update({ where: { id: flush.id }, data: { offered: true } });
    note("offered");
    const r1 = await activationRefusal(db, c.id, flush.id);
    note(`activation before price: ${r1 ? r1.code : "ALLOWED"}`);
    if (r1) note(`   "${r1.message}"`);
    await db.service.update({ where: { id: flush.id }, data: { basePrice: 24_900, publishedPriceApprovedAt: new Date() } });
    const go1 = await activateService(db, c.id, flush.id);
    note(`activation after price approval: ${go1.ok ? "LIVE" : go1.refusal.code}`);
    if (!go1.ok) rub("shape 1", `blocked: ${go1.refusal.message}`, "setup UX");

    // ── HOMEOWNER ────────────────────────────────────────────────────────
    step("HOMEOWNER — can a customer actually get a price?");
    const loaded = await loadServiceForResolution(db, flush.id);
    const settings = await loadPricingSettings(db, c.id);
    if (loaded && settings) {
      const q = loaded.questions[0];
      const answers: Record<string, string> = q ? { [q.key]: q.options.find((o) => o.routeAction !== "PHOTO_REVIEW")!.value } : {};
      const route = resolveRoute(loaded as never, answers, true, settings as never);
      note(`answered ${JSON.stringify(answers)}`);
      note(`route: ${route.status}${route.status === "PRICED" ? ` — $${(route.priceCents / 100).toFixed(2)}` : ""}`);
      if (route.status !== "PRICED") rub("homeowner", `Shape 1 service did not price: ${(route as any).reason ?? route.status}`, "shared platform");
    }

    // ── SHAPE 2 ──────────────────────────────────────────────────────────
    step("SHAPE 2 — starter catalog");
    const STARTER = ["plumbing-service-call", "toilet-internals-repair", "toilet-replacement",
      "kitchen-faucet-replacement", "drain-clearing-single-fixture", "water-heater-flush"];
    const rows = await db.service.findMany({ where: { contractorId: c.id, slug: { in: STARTER } },
      select: { id: true, slug: true } });
    await db.service.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { offered: true } });
    note(`offered ${rows.length} services`);
    const told = await whatTheyAreTold(db, c.id, "starter catalog offered");

    // Resolve exactly what the readiness engine asked for.
    const pols = await db.contractorPolicyValue.findMany({ where: { contractorId: c.id }, select: { key: true, boundaryCount: true } });
    for (const p of pols) {
      const res = await resolvePolicy(db, c.id, p.key,
        p.boundaryCount === 0 ? { choice: "contractor-supplied" } : { boundaries: [25, 75].slice(0, p.boundaryCount) });
      if (!res.ok) note(`   resolvePolicy(${p.key}) refused: ${JSON.stringify(res.refusal)}`);
    }
    note(`answered ${pols.length} policy question(s)`);

    const payload = buildPlumbingPayload();
    const mats = await db.canonicalMaterial.findMany({ where: { key: { in: payload.materials.map((m) => m.key) } }, select: { id: true } });
    for (const m of mats)
      await db.contractorMaterial.upsert({
        where: { contractorId_canonicalMaterialId: { contractorId: c.id, canonicalMaterialId: m.id } },
        update: { unitCostCents: 1_800 }, create: { contractorId: c.id, canonicalMaterialId: m.id, unitCostCents: 1_800 } });
    const comps = await db.canonicalComponent.findMany({ where: { key: { in: payload.components.map((x) => x.key) } }, select: { id: true } });
    for (const cc of comps)
      await db.contractorComponent.upsert({
        where: { contractorId_canonicalComponentId: { contractorId: c.id, canonicalComponentId: cc.id } },
        update: { approvedPriceCents: 8_900 }, create: { contractorId: c.id, canonicalComponentId: cc.id, approvedPriceCents: 8_900 } });
    note(`costed ${mats.length} material role(s), priced ${comps.length} component(s)`);
    rub("shape 2", "Material and component costs were entered globally here. In the product there is no role-level surface — the contractor must open a service's Materials panel to cost a role shared by many services.", "shared platform");

    for (const r of rows)
      await db.service.update({ where: { id: r.id }, data: { basePrice: 21_900, publishedPriceApprovedAt: new Date() } });
    note(`approved ${rows.length} prices`);

    // LAUNCH — one at a time, the cautious path, NOT the ordered bulk launch.
    step("LAUNCH — one at a time (the cautious contractor's path)");
    const cautious = rows.filter((r) => r.slug !== "plumbing-service-call");
    let hitDependency = false;
    for (const r of cautious) {
      const res = await activateService(db, c.id, r.id);
      console.log(`     ${res.ok ? "LIVE  " : "BLOCK "} ${r.slug}${res.ok ? "" : `  ${res.refusal.code}`}`);
      if (!res.ok && res.refusal.code === "DEPENDENCY_UNAVAILABLE") {
        hitDependency = true;
        note(`        "${res.refusal.message}"`);
        note(`        missingPrerequisites: ${JSON.stringify(res.refusal.missingPrerequisites ?? [])}`);
      }
    }
    if (hitDependency)
      rub("launch", "DEPENDENCY_UNAVAILABLE names the prerequisite in prose and in missingPrerequisites, but no UI renders that field and nothing offers to launch it. The contractor must know PL-SVC-001 goes first.", "setup UX");

    step("LAUNCH — then the prerequisite, then retry");
    const sc = rows.find((r) => r.slug === "plumbing-service-call")!;
    const scGo = await activateService(db, c.id, sc.id);
    console.log(`     ${scGo.ok ? "LIVE  " : "BLOCK "} ${sc.slug}`);
    for (const r of cautious) {
      const svc = await db.service.findUniqueOrThrow({ where: { id: r.id }, select: { active: true } });
      if (svc.active) continue;
      const res = await activateService(db, c.id, r.id);
      console.log(`     ${res.ok ? "LIVE  " : "BLOCK "} ${r.slug}${res.ok ? " (retry)" : `  ${res.refusal.code}`}`);
    }

    const liveCount = await db.service.count({ where: { contractorId: c.id, active: true } });
    const offeredCount = await db.service.count({ where: { contractorId: c.id, offered: true } });
    const totalCount = await db.service.count({ where: { contractorId: c.id } });
    step("RESULT");
    note(`${liveCount} live of ${offeredCount} offered of ${totalCount} provisioned`);
    await whatTheyAreTold(db, c.id, "final");

    step("FRICTION LOG");
    if (friction.length === 0) note("none recorded");
    friction.forEach((f, i) => console.log(`     ${i + 1}. [${f.classify}] ${f.step} — ${f.needed}`));
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
        note("pilot contractor removed");
      }
    } else note("kept (--keep)");
    await db.$disconnect();
  }
  console.log();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((e) => { console.error(`\n  ${(e as Error).stack}\n`); process.exit(1); });
