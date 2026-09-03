/**
 * Two divergent contractors, one canonical Plumbing catalog.
 *
 *   npx tsx scripts/rehearse-plumbing-two-contractor.ts            # full run
 *   npx tsx scripts/rehearse-plumbing-two-contractor.ts --keep     # skip teardown
 *
 * NEVER RUNS ANYWHERE IT HAS NOT PROVED IS SAFE. The first thing it does is
 * scripts/_lineage.ts, which accepts only a branch of the current production
 * lineage — not production, not the archive, not an unidentified database.
 *
 * WHAT IT IS TRYING TO FALSIFY
 *
 * That Plumbing V1 is a true canonical template: identical for every
 * contractor, while every economic and policy decision stays contractor-owned.
 * So it deliberately configures the two contractors to disagree about
 * everything they are allowed to disagree about, then checks that the
 * canonical rows did not move and that neither can see the other.
 *
 * It reuses the SHIPPED authorities throughout — preflight/installCatalog for
 * provisioning, withTenantGuard/withTenant for isolation, activationRefusal
 * for activation. A proof that used its own copies would prove only that the
 * copies agree with each other.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";
import { classifyRehearsalTarget } from "./_lineage";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";
import { withTenantGuard } from "../lib/tenantGuard";
import { withTenant } from "../lib/tenantContext";
import { activationRefusal } from "../lib/serviceActivation";
import { recomputeServiceMaterialCost } from "../lib/materialCost";
import { activationMaterialRoles } from "../lib/materialResolution";
import { buildPlumbingPayload } from "../lib/plumbing/publish";
import { PLUMBING_SERVICES, service as canonicalService } from "../lib/plumbing/catalog";
import { composeService } from "../lib/plumbing/composition";
import { screenPlumbingEmergency, PLUMBING_INTENTS } from "../lib/plumbing/intents";
import { conditionGate, combustionGate, shutoffGate } from "../lib/plumbing/gates";
import { CONDITION_SCOPE } from "../lib/plumbing/mappings";

loadEnv();
const KEEP = process.argv.includes("--keep");
const A_SLUG = "zz-plumb-proof-north";
const B_SLUG = "zz-plumb-proof-south";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};
const group = (n: string) => console.log(`\n  ${n}\n`);

/** Deliberately different in every dimension a contractor owns. */
const ECONOMICS = {
  [A_SLUG]: {
    name: "North Plumbing Proof",
    crewHourRateCents: 18_500, primaryMinimumCents: 27_500,
    roundingIncrementCents: 500, defaultPermitAdminCents: 9_500,
    materialCost: 4_200, componentPrice: 21_500,
    runBoundaries: [25, 75], supply: "contractor-supplied",
    disposal: "We haul away and dispose of the old unit.",
    permit: "We pull the permit and bill it at cost.",
    serviceCallCents: 14_900,
    equipment: { brand: "Rheem", model: "PROG50-38N", label: "Rheem 50 gal atmospheric" },
  },
  [B_SLUG]: {
    name: "South Plumbing Proof",
    crewHourRateCents: 11_000, primaryMinimumCents: 9_500,
    roundingIncrementCents: 100, defaultPermitAdminCents: 0,
    materialCost: 1_150, componentPrice: 7_900,
    runBoundaries: [10, 30], supply: "customer-supplied",
    disposal: "Removal of the old unit is the homeowner's responsibility.",
    permit: "Permits are arranged by the homeowner.",
    serviceCallCents: 4_900,
    equipment: { brand: "Bradford White", model: "RG250T6N", label: "Bradford White 50 gal" },
  },
} as const;

async function main() {
  const url = process.env.REHEARSAL_DATABASE_URL;
  console.log(`\nPLUMBING V1 — TWO-CONTRACTOR REHEARSAL\n`);

  // ── PHASE 0: refuse to run anywhere unproved ────────────────────────────
  group("PHASE 0 — TARGET");
  if (!url) { console.error("  REHEARSAL_DATABASE_URL is not set.\n"); process.exit(1); }
  const verdict = await classifyRehearsalTarget(url, process.env.DATABASE_URL);
  ok(verdict.ok, `target accepted as a production branch`, verdict.ok ? "" : (verdict as any).reason);
  if (!verdict.ok) { console.error(`\n  Refusing to continue.\n`); process.exit(1); }
  console.log(`       ${verdict.probe.endpoint}  lineage ${verdict.probe.lineage}`);

  const db = new PrismaClient({ datasources: { db: { url } } });

  // A fresh branch descends from production, and production does not yet carry
  // the branch-material primitive. Detected rather than pushed: `prisma db push`
  // is the caller's decision on a database this script did not create.
  try {
    await db.$queryRawUnsafe("select 1 from answer_option_materials limit 1");
    await db.$queryRawUnsafe("select 1 from template_answer_option_materials limit 1");
    ok(true, "the branch carries the AnswerOptionMaterial primitive");
  } catch {
    ok(false, "the branch carries the AnswerOptionMaterial primitive",
      `Missing answer_option_materials / template_answer_option_materials.\n` +
      `         Apply the schema to the branch first:\n` +
      `           DATABASE_URL="$REHEARSAL_DATABASE_URL" npx prisma db push --skip-generate`);
    await db.$disconnect();
    console.log(`\n  ${pass} passed, ${fail} failed.\n`);
    process.exit(1);
  }
  const guarded = withTenantGuard(new PrismaClient({ datasources: { db: { url } } })) as unknown as PrismaClient;

  // Canonical fingerprint BEFORE anything a contractor does.
  const fingerprint = async () => {
    const v = await db.templateVersion.findFirstOrThrow({ where: { trade: "plumbing", version: 1 } });
    const svcs = await db.templateService.findMany({
      where: { templateVersionId: v.id },
      select: { key: true, name: true, bookingType: true, photoState: true, isPrimaryEligible: true,
        questions: { select: { key: true, prompt: true, options: { select: { value: true, label: true, routeAction: true } } } } },
      orderBy: { key: "asc" },
    });
    return { versionId: v.id, kind: v.kind, json: JSON.stringify(svcs), count: svcs.length };
  };
  const before = await fingerprint();

  try {
    // ── PHASE 1: two contractors, same template ──────────────────────────
    group("PHASE 1 — PROVISIONING");
    const ids: Record<string, string> = {};
    for (const slug of [A_SLUG, B_SLUG]) {
      const e = ECONOMICS[slug as keyof typeof ECONOMICS];
      const c = await db.contractor.upsert({
        where: { slug }, update: { name: e.name }, create: { slug, name: e.name },
      });
      ids[slug] = c.id;
      // A is fully costed BEFORE provisioning, so its services resolve and the
      // isolated guard tests in Phase 5 have exactly one blocker at a time.
      // B is left uncosted, which is what makes an uncosted role visible as
      // unresolvedMaterialKeys rather than as a silent zero.
      if (slug === A_SLUG) {
        const roles = await db.canonicalMaterial.findMany({
          where: { key: { in: buildPlumbingPayload().materials.map((m) => m.key) } }, select: { id: true } });
        for (const r of roles)
          await db.contractorMaterial.upsert({
            where: { contractorId_canonicalMaterialId: { contractorId: c.id, canonicalMaterialId: r.id } },
            update: { unitCostCents: e.materialCost },
            create: { contractorId: c.id, canonicalMaterialId: r.id, unitCostCents: e.materialCost },
          });
      }
      await db.contractorTrade.upsert({
        where: { contractorId_tradeKey: { contractorId: c.id, tradeKey: "plumbing" } },
        update: {}, create: { contractorId: c.id, tradeKey: "plumbing" },
      });
      const src = templateVersionSource(db, "plumbing", undefined, 1);
      const pre = await preflight(db, c.id, src);
      if (!pre.ok) { ok(false, `${slug}: preflight`, `${pre.code}: ${pre.message}`); continue; }
      ok(pre.preview.services === 63, `${slug}: preflight offers all 63 services`, `got ${pre.preview.services}`);
      const res = await installCatalog(db, c.id, pre.catalog);
      ok(res.services === 63, `${slug}: installed 63 services`, `got ${res.services}`);
      const live = await db.service.count({ where: { contractorId: c.id } });
      ok(live === 63, `${slug}: 63 service rows exist`, `got ${live}`);
      const q = await db.question.count({ where: { service: { contractorId: c.id } } });
      const o = await db.answerOption.count({ where: { question: { service: { contractorId: c.id } } } });
      ok(q === 196 && o === 927, `${slug}: composed tree matches composeAll (196q/927o)`, `got ${q}q/${o}o`);
    }

    // Both got the SAME canonical shape.
    const shapeOf = async (cid: string) => {
      const rows = await db.service.findMany({
        where: { contractorId: cid },
        select: {
          slug: true, bookingType: true,
          questions: { select: { key: true, options: { select: { value: true, routeAction: true } } } },
        },
        orderBy: { slug: "asc" },
      });
      // Sorted at every level: row order is the database's business, and a
      // shape comparison that depended on it would fail for the wrong reason.
      return JSON.stringify(rows.map((r) => ({
        slug: r.slug, bookingType: r.bookingType,
        questions: r.questions
          .map((q) => ({ key: q.key, options: [...q.options].sort((x, y) => x.value.localeCompare(y.value)) }))
          .sort((x, y) => x.key.localeCompare(y.key)),
      })));
    };
    ok(await shapeOf(ids[A_SLUG]) === await shapeOf(ids[B_SLUG]),
      "both contractors received an identical canonical catalog");

    // Repeat provisioning must not duplicate.
    const srcAgain = templateVersionSource(db, "plumbing", undefined, 1);
    const again = await preflight(db, ids[A_SLUG], srcAgain);
    ok(!again.ok && again.code === "CATALOG_ALREADY_INSTALLED",
      "re-provisioning is refused rather than duplicating",
      again.ok ? "preflight allowed a second install" : `code=${again.code}`);
    ok(await db.service.count({ where: { contractorId: ids[A_SLUG] } }) === 63,
      "still exactly 63 rows after the retry attempt");

    // Nothing priced on arrival.
    for (const slug of [A_SLUG, B_SLUG]) {
      const priced = await db.service.count({
        where: { contractorId: ids[slug], OR: [{ basePrice: { not: null } }, { publishedPriceApprovedAt: { not: null } }] } });
      ok(priced === 0, `${slug}: nothing arrives priced or approved`, `${priced} priced`);
      const activeCount = await db.service.count({ where: { contractorId: ids[slug], active: true } });
      const offeredCount = await db.service.count({ where: { contractorId: ids[slug], offered: true } });
      ok(activeCount === 0 && offeredCount === 0,
        `${slug}: nothing arrives offered or active`, `active=${activeCount} offered=${offeredCount}`);
    }

    // ── PHASE 2: make them disagree ──────────────────────────────────────
    group("PHASE 2 — DIVERGENT ECONOMICS");
    for (const slug of [A_SLUG, B_SLUG]) {
      const e = ECONOMICS[slug as keyof typeof ECONOMICS];
      const cid = ids[slug];
      await db.pricingSettings.upsert({
        where: { contractorId: cid },
        update: { crewHourRateCents: e.crewHourRateCents, primaryMinimumCents: e.primaryMinimumCents,
          roundingIncrementCents: e.roundingIncrementCents, defaultPermitAdminCents: e.defaultPermitAdminCents },
        create: { contractorId: cid, crewHourRateCents: e.crewHourRateCents, primaryMinimumCents: e.primaryMinimumCents,
          roundingIncrementCents: e.roundingIncrementCents, defaultPermitAdminCents: e.defaultPermitAdminCents },
      });
      // Material + component costs: contractor-owned, different figures.
      const mats = await db.canonicalMaterial.findMany({ where: { key: { in: ["gas_flex_connector", "vent_pipe_pvc", "fixture_stop_valve"] } } });
      for (const m of mats)
        await db.contractorMaterial.upsert({
          where: { contractorId_canonicalMaterialId: { contractorId: cid, canonicalMaterialId: m.id } },
          update: { unitCostCents: e.materialCost }, create: { contractorId: cid, canonicalMaterialId: m.id, unitCostCents: e.materialCost },
        });
      const comps = await db.canonicalComponent.findMany({ where: { key: { in: ["stop_valve_replacement", "power_vent_termination"] } } });
      for (const c of comps)
        await db.contractorComponent.upsert({
          where: { contractorId_canonicalComponentId: { contractorId: cid, canonicalComponentId: c.id } },
          update: { approvedPriceCents: e.componentPrice, labelOverride: e.equipment.label },
          create: { contractorId: cid, canonicalComponentId: c.id, approvedPriceCents: e.componentPrice, labelOverride: e.equipment.label },
        });
      // Policy boundaries: the numbers the template refused to ship.
      await db.contractorPolicyValue.updateMany({
        where: { contractorId: cid, key: "plumbing_run.breakpoints" },
        data: { boundaries: [...e.runBoundaries], resolvedAt: new Date() },
      });
      await db.contractorPolicyValue.updateMany({
        where: { contractorId: cid, key: "fixture.supply_arrangement" },
        data: { choice: e.supply, resolvedAt: new Date() },
      });
      ok(true, `${slug}: economics, policies and equipment configured`);
    }

    // One deactivates a service the other keeps.
    const heaterA = await db.service.findFirstOrThrow({ where: { contractorId: ids[A_SLUG], slug: "tank-water-heater-replacement-gas" } });
    const heaterB = await db.service.findFirstOrThrow({ where: { contractorId: ids[B_SLUG], slug: "tank-water-heater-replacement-gas" } });
    await db.service.update({ where: { id: heaterA.id }, data: { offered: true } });
    ok((await db.service.findUniqueOrThrow({ where: { id: heaterB.id } })).offered === false,
      "one contractor offering a service leaves the other's untouched");

    // Divergence is real.
    const psA = await db.pricingSettings.findUniqueOrThrow({ where: { contractorId: ids[A_SLUG] } });
    const psB = await db.pricingSettings.findUniqueOrThrow({ where: { contractorId: ids[B_SLUG] } });
    ok(psA.crewHourRateCents !== psB.crewHourRateCents && psA.primaryMinimumCents !== psB.primaryMinimumCents,
      `labor economics diverge (${psA.crewHourRateCents} vs ${psB.crewHourRateCents} per crew-hour)`);
    const polA = await db.contractorPolicyValue.findFirstOrThrow({ where: { contractorId: ids[A_SLUG], key: "plumbing_run.breakpoints" } });
    const polB = await db.contractorPolicyValue.findFirstOrThrow({ where: { contractorId: ids[B_SLUG], key: "plumbing_run.breakpoints" } });
    ok(JSON.stringify(polA.boundaries) !== JSON.stringify(polB.boundaries),
      `included-run policy diverges ([${polA.boundaries}] vs [${polB.boundaries}])`);

    // ── PHASE 3: canonical immutability ──────────────────────────────────
    group("PHASE 3 — CANONICAL TEMPLATE UNCHANGED");
    const after = await fingerprint();
    ok(before.json === after.json, "the canonical template is byte-identical after both installs");
    ok(after.count === 63 && after.kind === "SNAPSHOT", "still 63 services, still a SNAPSHOT");
    const leak = await db.templateAnswerOption.findFirst({
      where: { OR: [{ label: { contains: "Rheem" } }, { label: { contains: "Bradford" } }] } });
    ok(leak === null, "no contractor equipment brand reached the canonical template");
    const bands = await db.templateAnswerOption.findMany({ where: { labelPattern: { not: null } }, select: { label: true } });
    ok(bands.every((b) => /\{b\d/.test(b.label)),
      "canonical band answers still hold their holes — no contractor boundary leaked",
      bands.filter((b) => !/\{b\d/.test(b.label)).map((b) => b.label).join(" | "));

    // ── PHASE 4: tenant isolation, both directions ───────────────────────
    group("PHASE 4 — TENANT ISOLATION (shared guard)");
    // AWAIT INSIDE THE CONTEXT, not outside it.
    //
    // A PrismaPromise is lazy: it does not run until something calls .then().
    // Handing `() => guarded.service.count()` to withTenant returns the promise
    // from inside the context and executes it outside, where the guard finds no
    // contractor and throws. The guard was right and the harness was wrong —
    // which is the failure mode this whole layer exists to produce.
    const inTenant = <T>(cid: string, fn: () => Promise<T>) =>
      withTenant({ contractorId: cid, source: "test" }, async () => await fn());
    const asA = <T>(fn: () => Promise<T>) => inTenant(ids[A_SLUG], fn);
    const asB = <T>(fn: () => Promise<T>) => inTenant(ids[B_SLUG], fn);

    const aSeesOwn = await asA(() => guarded.service.count());
    ok(aSeesOwn === 63, "A sees exactly its own 63 services through the guard", `saw ${aSeesOwn}`);
    const aSeesB = await asA(() => guarded.service.findFirst({ where: { id: heaterB.id } }));
    ok(aSeesB === null, "A cannot read B's service by its real id");
    const bSeesA = await asB(() => guarded.service.findFirst({ where: { id: heaterA.id } }));
    ok(bSeesA === null, "B cannot read A's service by its real id");

    const aWroteB = await asA(async () => (await guarded.service.updateMany({ where: { id: heaterB.id }, data: { offered: true } })).count);
    ok(aWroteB === 0, "A cannot mutate B's service", `updated ${aWroteB} row(s)`);
    ok((await db.service.findUniqueOrThrow({ where: { id: heaterB.id } })).offered === false,
      "and B's row is genuinely unchanged");

    /**
     * The guard turned out to be STRONGER than this proof first assumed.
     *
     * Naming another contractor's id explicitly does not quietly return
     * nothing — it throws CrossTenantError. That is the better behavior: a
     * silent empty result reads like "they have no data", while a throw says
     * "you asked the wrong question". So both are asserted, because they are
     * different defenses:
     *
     *   explicit foreign filter  -> refused outright
     *   no filter at all         -> scoped, so only own rows come back
     */
    const refused = async (fn: () => Promise<unknown>) => {
      try { await fn(); return false; } catch (e) { return (e as Error).name === "CrossTenantError"; }
    };
    const B = ids[B_SLUG];
    ok(await asA(() => refused(() => guarded.pricingSettings.findFirst({ where: { contractorId: B } }))),
      "A naming B's labor economics is refused outright");
    ok(await asA(() => refused(() => guarded.contractorMaterial.count({ where: { contractorId: B } }))),
      "A naming B's material costs is refused outright");
    ok(await asA(() => refused(() => guarded.contractorComponent.count({ where: { contractorId: B } }))),
      "A naming B's equipment prices is refused outright");
    ok(await asA(() => refused(() => guarded.contractorPolicyValue.count({ where: { contractorId: B } }))),
      "A naming B's policies is refused outright");
    ok(await asA(() => refused(() => guarded.contractorTrade.count({ where: { contractorId: B } }))),
      "A naming B's trade enrollment is refused outright");

    // Unfiltered, from inside A: the scope must exclude B rather than leak it.
    const ownSettings = await asA(() => guarded.pricingSettings.findMany({ select: { contractorId: true } }));
    ok(ownSettings.length === 1 && ownSettings[0].contractorId === ids[A_SLUG],
      "an unfiltered read from A returns only A's economics", `saw ${ownSettings.length} row(s)`);
    const ownComponents = await asA(() => guarded.contractorComponent.findMany({ select: { contractorId: true } }));
    ok(ownComponents.every((c) => c.contractorId === ids[A_SLUG]),
      "an unfiltered read from A returns none of B's equipment prices");
    const ownPolicies = await asA(() => guarded.contractorPolicyValue.findMany({ select: { contractorId: true } }));
    ok(ownPolicies.length > 0 && ownPolicies.every((c) => c.contractorId === ids[A_SLUG]),
      "an unfiltered read from A returns only A's policies");

    // The incumbent production tenants are equally invisible.
    const elite = await db.contractor.findUnique({ where: { slug: "elite-electric" }, select: { id: true } });
    if (elite) {
      ok(await asA(() => refused(() => guarded.service.count({ where: { contractorId: elite.id } }))),
        "A naming the incumbent tenant's services is refused outright");
      const seen = await asA(() => guarded.service.findMany({ select: { contractorId: true } }));
      ok(seen.every((x) => x.contractorId === ids[A_SLUG]) && seen.length === 63,
        "and an unfiltered service read from A returns only its own 63", `saw ${seen.length}`);
    }

    // ── PHASE 5: readiness / activation, fail closed ─────────────────────
    group("PHASE 5 — GUARDS, ISOLATED ONE AT A TIME");

    // Relationships survived publisher -> install.
    const linkedMaterials = await db.serviceMaterial.count({ where: { service: { contractorId: ids[A_SLUG] } } });
    ok(linkedMaterials > 0, `required material roles installed as ServiceMaterial links (${linkedMaterials})`,
      "DEFECT: the shared readiness authority would see no materials to demand costs for");
    /**
     * The EXACT set, not "more than zero".
     *
     * `> 0` was too weak to be worth asserting: a partial install — 27 of 135,
     * the number you get when only two of the seven components happen to be
     * priced — passed it just as happily as a complete one. The identity of
     * every link is checked against what the publisher declares, so a
     * structural hole has to show up as a missing identity rather than a
     * smaller number nobody reads.
     */
    const expectedComponentLinks = new Set<string>();
    for (const svc of buildPlumbingPayload().services)
      for (const q of svc.questions)
        for (const o of q.options)
          for (const ck of o.componentKeys)
            expectedComponentLinks.add(`${svc.key}/${q.key}/${o.value}/${ck}`);
    const installedComponentRows = await db.answerOptionComponent.findMany({
      where: { answerOption: { question: { service: { contractorId: ids[A_SLUG] } } } },
      select: {
        canonicalComponent: { select: { key: true } },
        answerOption: { select: { value: true, question: { select: { key: true, service: { select: { templateKey: true } } } } } },
      },
    });
    const installedComponentLinks = new Set(installedComponentRows.map((r) =>
      `${r.answerOption.question.service.templateKey}/${r.answerOption.question.key}/${r.answerOption.value}/${r.canonicalComponent?.key ?? "<null>"}`));
    const missingLinks = [...expectedComponentLinks].filter((k) => !installedComponentLinks.has(k));
    const excessLinks = [...installedComponentLinks].filter((k) => !expectedComponentLinks.has(k));
    ok(installedComponentRows.length === expectedComponentLinks.size
       && missingLinks.length === 0 && excessLinks.length === 0,
      `answer-selected components installed as AnswerOptionComponent links (${installedComponentRows.length}/${expectedComponentLinks.size} exact)`,
      `DEFECT: components declared by mappings did not survive publication. ` +
      `missing ${missingLinks.length}${missingLinks.length ? ` e.g. ${missingLinks.slice(0, 3).join(", ")}` : ""}` +
      `; excess ${excessLinks.length}${excessLinks.length ? ` e.g. ${excessLinks.slice(0, 3).join(", ")}` : ""}`);

    const resolveCount = await db.answerOption.count({
      where: { routeAction: { in: ["RESOLVE_INSTANT", "RESOLVE_ADJUSTED"] },
        question: { service: { contractorId: ids[A_SLUG] } } } });
    ok(resolveCount > 0, `priced terminals installed (${resolveCount} RESOLVE options)`,
      "DEFECT: routes.priced would be zero and §1.4 would never fire");
    const strandedDb = await db.answerOption.count({
      where: { routeAction: "CONTINUE", nextQuestionId: null,
        question: { service: { contractorId: ids[A_SLUG] } } } });
    ok(strandedDb === 0, "no installed CONTINUE is stranded", `${strandedDb} stranded`);

    // ── BRANCH-SPECIFIC DEPENDENCIES SURVIVE ─────────────────────────────
    //
    // Atmospheric and power vent are mutually exclusive. The service must not
    // globally require both, and neither dependency may vanish merely because
    // it is absent from the service-level intersection.
    const recipeRows = await db.canonicalComponentMaterial.count();
    ok(recipeRows > 0, `component material recipes installed (${recipeRows} rows)`,
      "DEFECT: branch-specific roles would reach nothing");

    const heaterSvc = await db.service.findFirstOrThrow({
      where: { contractorId: ids[A_SLUG], slug: "tank-water-heater-replacement-gas" },
      select: { id: true, materials: { select: { canonicalMaterial: { select: { key: true } } } } },
    });
    const heaterRoles = heaterSvc.materials.map((m) => m.canonicalMaterial?.key).filter(Boolean);
    ok(!heaterRoles.includes("vent_pipe_pvc") && !heaterRoles.includes("vent_connector_metal"),
      "the heater does not globally require both vent configurations", heaterRoles.join(", "));

    const ventOption = async (value: string) => db.answerOption.findFirst({
      where: { value, question: { key: "appliance_venting", service: { id: heaterSvc.id } } },
      select: { components: { select: { canonicalComponent: { select: { key: true,
        materials: { select: { canonicalMaterial: { select: { key: true } } } } } } } } },
    });
    const atm = await ventOption("atmospheric");
    const pv = await ventOption("power_vent");
    const rolesOf = (o: typeof atm) =>
      (o?.components ?? []).flatMap((c) => (c.canonicalComponent?.materials ?? []).map((m) => m.canonicalMaterial.key));
    const atmRoles = rolesOf(atm), pvRoles = rolesOf(pv);
    ok(atmRoles.includes("vent_connector_metal"),
      "selecting ATMOSPHERIC exposes its own vent dependency", atmRoles.join(", "));
    ok(pvRoles.includes("vent_pipe_pvc"),
      "selecting POWER VENT exposes its own vent dependency", pvRoles.join(", "));
    ok(!atmRoles.includes("vent_pipe_pvc") && !pvRoles.includes("vent_connector_metal"),
      "neither configuration acquires the other's dependency");

    // ── PL-SVC-001 prices the VISIT, and nothing else ────────────────────
    const plSvc001 = await db.service.findFirstOrThrow({
      where: { contractorId: ids[A_SLUG], slug: "plumbing-service-call" },
      select: { id: true, bookingType: true,
        materials: { select: { id: true } },
        questions: { select: { options: { select: { routeAction: true, components: { select: { id: true } } } } } } },
    });
    const svcCallOptions = plSvc001.questions.flatMap((q) => q.options);
    ok(svcCallOptions.some((o) => String(o.routeAction) === "RESOLVE_INSTANT"),
      "PL-SVC-001 terminates in RESOLVE_INSTANT (the approved visit fee)");
    ok(svcCallOptions.every((o) => o.components.length === 0),
      "PL-SVC-001 attaches no component — no repair is selected");
    ok(plSvc001.materials.length === 0,
      "PL-SVC-001 infers no material role from the symptom", `${plSvc001.materials.length} role(s)`);

    // ── BRANCH BASE MATERIAL: copper vs PEX ──────────────────────────────
    //
    // The shape the shared primitive was added for. Neither branch may acquire
    // the other's roles, and a missing cost on either must block activation on
    // its own.
    const pipeSvc = await db.service.findFirstOrThrow({
      where: { contractorId: ids[A_SLUG], slug: "pipe-section-repair" },
      select: { id: true, slug: true },
    });
    const branchRoles = async (value: string) => {
      const opt = await db.answerOption.findFirst({
        where: { value, question: { key: "existing_pipe_material", service: { id: pipeSvc.id } } },
        select: { id: true, materials: { select: { canonicalMaterial: { select: { key: true } } } } },
      });
      return { id: opt?.id, keys: (opt?.materials ?? []).map((m) => m.canonicalMaterial.key) };
    };
    const copper = await branchRoles("copper");
    const pex = await branchRoles("pex");
    ok(copper.keys.includes("copper_fitting") && copper.keys.includes("solder_or_press_consumable"),
      "COPPER branch exposes its copper roles", copper.keys.join(", "));
    ok(pex.keys.includes("pex_fitting") && pex.keys.includes("pex_ring"),
      "PEX branch exposes its PEX roles", pex.keys.join(", "));
    ok(!copper.keys.some((k) => k.startsWith("pex_")) && !pex.keys.some((k) => k.startsWith("copper_")),
      "neither branch consumes the other's roles");

    // Reachability: a review-only branch must not create a requirement.
    const galv = await branchRoles("galvanized");
    const galvOpt = await db.answerOption.findFirst({
      where: { value: "galvanized", question: { key: "existing_pipe_material", service: { id: pipeSvc.id } } },
      select: { routeAction: true } });
    ok(String(galvOpt?.routeAction) === "REMOTE_QUOTE",
      "the galvanized branch is quote-only, so it should not gate activation",
      String(galvOpt?.routeAction));
    const activationKeys = (await activationMaterialRoles(db as never, pipeSvc.id)).map((r) => r.key);
    ok(!activationKeys.some((k) => k === "dielectric_union" || k === "threaded_adapter"),
      "a quote-only branch contributes no activation requirement", activationKeys.join(", "));
    ok(activationKeys.includes("copper_fitting") && activationKeys.includes("pex_ring"),
      "both priceable branches DO contribute", activationKeys.join(", "));

    // Missing cost on ONE branch role blocks activation on its own.
    await db.service.update({ where: { id: pipeSvc.id },
      data: { basePrice: 21_900, publishedPriceApprovedAt: new Date() } });
    const copperRole = await db.canonicalMaterial.findUniqueOrThrow({ where: { key: "copper_fitting" }, select: { id: true } });
    await db.contractorMaterial.deleteMany({ where: { contractorId: ids[A_SLUG], canonicalMaterialId: copperRole.id } });
    const rBranch = await activationRefusal(db, ids[A_SLUG], pipeSvc.id);
    ok(rBranch?.code === "MATERIALS_UNRESOLVED" && (rBranch.unresolvedMaterialKeys ?? []).includes("copper_fitting"),
      "an uncosted COPPER role blocks activation by itself",
      `got ${rBranch?.code}: ${(rBranch?.unresolvedMaterialKeys ?? []).join(", ")}`);
    const svcRow = await db.service.findUniqueOrThrow({ where: { id: pipeSvc.id }, select: { materialCostCents: true } });
    ok(svcRow.materialCostCents !== 0,
      "NO-ZERO: the uncosted branch role never became a $0 material cost",
      `materialCostCents = ${svcRow.materialCostCents}`);
    await db.contractorMaterial.create({
      data: { contractorId: ids[A_SLUG], canonicalMaterialId: copperRole.id, unitCostCents: 2_400 } });
    const rCleared = await activationRefusal(db, ids[A_SLUG], pipeSvc.id);
    ok(rCleared === null, "supplying the COPPER cost clears that blocker", `still ${rCleared?.code}`);

    // ── COMPONENT RECIPE MATERIAL reaches activation ─────────────────────
    const heaterForRecipe = await db.service.findFirstOrThrow({
      where: { contractorId: ids[A_SLUG], slug: "tank-water-heater-replacement-gas" }, select: { id: true } });
    await db.service.update({ where: { id: heaterForRecipe.id },
      data: { basePrice: 289_000, publishedPriceApprovedAt: new Date() } });
    const heaterKeys = (await activationMaterialRoles(db as never, heaterForRecipe.id)).map((r) => r.key);
    ok(heaterKeys.includes("vent_pipe_pvc") && heaterKeys.includes("vent_connector_metal"),
      "both vent configurations' recipe materials reach activation readiness", heaterKeys.join(", "));
    const pvcRole = await db.canonicalMaterial.findUniqueOrThrow({ where: { key: "vent_pipe_pvc" }, select: { id: true } });
    await db.contractorMaterial.deleteMany({ where: { contractorId: ids[A_SLUG], canonicalMaterialId: pvcRole.id } });
    const rRecipe = await activationRefusal(db, ids[A_SLUG], heaterForRecipe.id);
    ok(rRecipe?.code === "MATERIALS_UNRESOLVED" && (rRecipe.unresolvedMaterialKeys ?? []).includes("vent_pipe_pvc"),
      "an uncosted component-recipe material blocks activation",
      `got ${rRecipe?.code}: ${(rRecipe?.unresolvedMaterialKeys ?? []).join(", ")}`);
    await db.contractorMaterial.create({
      data: { contractorId: ids[A_SLUG], canonicalMaterialId: pvcRole.id, unitCostCents: 5_600 } });
    ok((await activationRefusal(db, ids[A_SLUG], heaterForRecipe.id)) === null,
      "supplying the recipe material cost clears that blocker");

    // ── TENANT ISOLATION of the new primitive ────────────────────────────
    const bKeys = (await activationMaterialRoles(db as never,
      (await db.service.findFirstOrThrow({ where: { contractorId: ids[B_SLUG], slug: "pipe-section-repair" }, select: { id: true } })).id
    )).map((r) => r.key);
    ok(bKeys.includes("copper_fitting"), "B's copy of the service requires the same canonical roles");
    const bSvc = await db.service.findFirstOrThrow({ where: { contractorId: ids[B_SLUG], slug: "pipe-section-repair" }, select: { id: true } });
    await db.service.update({ where: { id: bSvc.id }, data: { basePrice: 9_900, publishedPriceApprovedAt: new Date() } });
    const rB = await activationRefusal(db, ids[B_SLUG], bSvc.id);
    ok(rB?.code === "MATERIALS_UNRESOLVED",
      "A's costs do not satisfy B's readiness — B still blocked", `got ${rB?.code ?? "null (activation allowed)"}`);

    // ── CANONICAL INDEPENDENCE ───────────────────────────────────────────
    const tplBranchMats = await db.templateAnswerOptionMaterial.count();
    ok(tplBranchMats > 0, `template branch-material rows exist (${tplBranchMats})`);
    const tplWithCost = await db.$queryRawUnsafe<{ n: bigint }[]>(
      "select count(*)::int as n from template_answer_option_materials where quantity <= 0");
    ok(Number(tplWithCost[0].n) === 0, "no template branch-material row carries a non-positive quantity");

    // ── GUARD 1: price approval, in isolation ────────────────────────────
    //
    // Everything else satisfied. The ONLY outstanding blocker is the approved
    // price, so a refusal proves the price guard fired rather than some other
    // check happening to stop it — which is exactly how POLICY_UNRESOLVED
    // masked this the first time.
    const priced = await db.service.findFirst({
      where: { contractorId: ids[A_SLUG], unresolvedPolicyKeys: { isEmpty: true },
        materialCostResolved: true, publishedPriceApprovedAt: null,
        questions: { some: { options: { some: { routeAction: { in: ["RESOLVE_INSTANT", "RESOLVE_ADJUSTED"] } } } } } },
      select: { id: true, slug: true },
    });
    ok(priced !== null, "found a service with a priced route and no other blocker",
      "no service had a reachable priced terminal with all other prerequisites met");
    if (priced) {
      const r1 = await activationRefusal(db, ids[A_SLUG], priced.id);
      ok(r1?.code === "PRICE_NOT_APPROVED",
        `${priced.slug}: refuses with PRICE_NOT_APPROVED when only the price is missing`,
        `got ${r1?.code ?? "null (activation allowed)"}`);
      await db.service.update({ where: { id: priced.id }, data: { basePrice: 24_900, publishedPriceApprovedAt: new Date() } });
      const r2 = await activationRefusal(db, ids[A_SLUG], priced.id);
      ok(r2 === null, `${priced.slug}: approving the price clears that blocker`, `still ${r2?.code}`);
    }

    // ── GUARD 2: required material cost, in isolation ────────────────────
    // ServiceMaterial.canonicalMaterialId is nullable — a legacy link need not
    // name a canonical role — so the canonical ones are selected explicitly
    // rather than assumed.
    const withRole = await db.service.findFirst({
      where: {
        contractorId: ids[A_SLUG], unresolvedPolicyKeys: { isEmpty: true },
        materials: { some: { canonicalMaterialId: { not: null } } },
      },
      select: {
        id: true, slug: true,
        materials: {
          where: { canonicalMaterialId: { not: null } },
          select: { canonicalMaterialId: true, canonicalMaterial: { select: { key: true } } }, take: 1,
        },
      },
    });
    const role0 = withRole?.materials[0];
    ok(withRole !== null && role0?.canonicalMaterialId != null,
      "found a service with an installed required role");
    if (withRole && role0?.canonicalMaterialId) {
      const roleId: string = role0.canonicalMaterialId;
      const roleKey = role0.canonicalMaterial?.key ?? roleId;
      await db.service.update({ where: { id: withRole.id }, data: { basePrice: 19_900, publishedPriceApprovedAt: new Date() } });
      const okBefore = await activationRefusal(db, ids[A_SLUG], withRole.id);
      ok(okBefore === null, `${withRole.slug}: activates once priced and fully costed`, `blocked by ${okBefore?.code}`);

      // Remove exactly one contractor cost. Nothing else changes.
      await db.contractorMaterial.deleteMany({ where: { contractorId: ids[A_SLUG], canonicalMaterialId: roleId } });
      await recomputeServiceMaterialCost(db as never, withRole.id);
      const after = await db.service.findUniqueOrThrow({ where: { id: withRole.id },
        select: { materialCostResolved: true, materialCostCents: true, unresolvedMaterialKeys: true } });
      const r3 = await activationRefusal(db, ids[A_SLUG], withRole.id);
      ok(r3?.code === "MATERIALS_UNRESOLVED",
        `${withRole.slug}: refuses with MATERIALS_UNRESOLVED when only "${roleKey}" is uncosted`,
        `got ${r3?.code ?? "null (activation allowed)"}`);
      ok(after.materialCostResolved === false,
        "and the service is marked unresolved rather than costed");
      ok(after.materialCostCents !== 0,
        "NO-ZERO: an uncosted role never becomes a $0 material cost",
        `materialCostCents = ${after.materialCostCents}`);

      // Supply the cost; the blocker clears.
      await db.contractorMaterial.create({
        data: { contractorId: ids[A_SLUG], canonicalMaterialId: roleId, unitCostCents: 3_300 } });
      await recomputeServiceMaterialCost(db as never, withRole.id);
      const r4 = await activationRefusal(db, ids[A_SLUG], withRole.id);
      ok(r4 === null, `${withRole.slug}: supplying the cost clears that blocker`, `still ${r4?.code}`);
    }

    // ── GUARD 3: B was never costed, so its roles are visibly unresolved ──
    const bUnresolved = await db.service.count({
      where: { contractorId: ids[B_SLUG], NOT: { unresolvedMaterialKeys: { isEmpty: true } } } });
    ok(bUnresolved > 0, `an uncosted contractor carries unresolved roles (${bUnresolved} services)`,
      "DEFECT: uncosted roles were invisible to readiness");
    const bZero = await db.service.count({ where: { contractorId: ids[B_SLUG], materialCostCents: 0, materialCostResolved: true } });
    ok(bZero === 0, "NO-ZERO: no uncosted service claims a resolved $0 material cost", `${bZero} such services`);

    // ── Still fails closed on everything else ────────────────────────────
    const zeroPriced = await db.service.count({ where: { contractorId: ids[B_SLUG], basePrice: 0 } });
    ok(zeroPriced === 0, "no service was given a $0 price to fill a gap", `${zeroPriced} at zero`);
    const anyActive = await db.service.count({ where: { contractorId: ids[B_SLUG], active: true } });
    ok(anyActive === 0, "nothing became publicly reachable by provisioning alone", `${anyActive} active`);
    const offeredNotActive = await db.service.count({ where: { contractorId: ids[A_SLUG], offered: true, active: false } });
    ok(offeredNotActive === 1, "'offered' does not imply 'active' — the storefront gate is separate", `${offeredNotActive}`);

    // ── PHASE 6: homeowner behavior, from the composed tree ──────────────
    group("PHASE 6 — HOMEOWNER FLOWS");
    const families = [
      ["direct", "toilet-internals-repair"],
      ["simple replacement", "kitchen-faucet-replacement"],
      ["canonical variant", "tank-water-heater-replacement-gas"],
      ["existing connection", "fixture-shutoff-valve-replacement"],
      ["accessible component", "shower-valve-cartridge-replacement"],
      ["contractor-directed", "gas-line-extension-appliance"],
      ["new work, existing infra", "refrigerator-water-line-installation"],
      ["project review", "whole-home-repipe-assessment"],
      ["existing_condition", "toilet-replacement"],
    ] as const;
    for (const [family, key] of families) {
      const svc = canonicalService(key);
      const composed = composeService(svc);
      const row = await db.service.findFirst({ where: { contractorId: ids[A_SLUG], slug: key },
        select: { slug: true, bookingType: true, questions: { select: { key: true } } } });
      ok(row !== null && row.questions.length === composed.questions.length,
        `${family}: ${key} provisioned with its composed questions (${composed.questions.length})`,
        row ? `db=${row.questions.length}` : "missing");
    }

    ok(conditionGate("ACTIVE_FAILURE").action === "ON_SITE_SERVICE",
      "an observed active failure routes to a neutral on-site service call");
    ok(CONDITION_SCOPE.DEGRADED.components.length === 0 && CONDITION_SCOPE.DEGRADED.materialRoles.length === 0,
      "an observed condition still selects no repair component");
    ok(combustionGate("UNKNOWN", { serviceExpects: ["GAS_ATMOSPHERIC"] }).action !== "CONTINUE",
      "an unestablished vent type still refuses to price");
    ok(shutoffGate("UNKNOWN", { valveReplacementIsInScope: false }).action !== "CONTINUE",
      "an unchecked shutoff still refuses to price");

    const symptomIntents = ["something is leaking somewhere", "not sure what is wrong", "need someone to look at it"];
    const svcCall = PLUMBING_INTENTS.find((i) => i.serviceKey === "plumbing-service-call")!;
    ok(symptomIntents.every((p) => svcCall.phrases.includes(p)),
      "symptom phrasing routes to the neutral service call, not a repair");
    const repairIntent = PLUMBING_INTENTS.find((i) => i.phrases.some((p) => /leaking somewhere|not sure what is wrong/.test(p)) && i.serviceKey !== "plumbing-service-call");
    ok(!repairIntent, "no symptom phrase routes to a component-specific repair", repairIntent?.serviceKey ?? "");
    ok(screenPlumbingEmergency("sewage is backing up into my bathtub").isEmergency,
      "safety routing still fires on a plumbing emergency");

    const serviceCallRow = await db.service.findFirst({ where: { contractorId: ids[A_SLUG], slug: "plumbing-service-call" },
      select: { bookingType: true, active: true } });
    ok(serviceCallRow?.bookingType === "TROUBLESHOOT_ONLY",
      "the service-call destination provisioned as a non-fixed-price outcome", String(serviceCallRow?.bookingType));

  } finally {
    if (!KEEP) {
      group("PHASE 7 — TEARDOWN");
      for (const slug of [A_SLUG, B_SLUG]) {
        const c = await db.contractor.findUnique({ where: { slug }, select: { id: true } });
        if (!c) { ok(true, `${slug}: nothing to remove`); continue; }
        const sids = (await db.service.findMany({ where: { contractorId: c.id }, select: { id: true } })).map((s) => s.id);
        await db.answerOption.deleteMany({ where: { question: { serviceId: { in: sids } } } });
        await db.question.deleteMany({ where: { serviceId: { in: sids } } });
        await db.serviceMaterial.deleteMany({ where: { serviceId: { in: sids } } });
        await db.service.deleteMany({ where: { contractorId: c.id } });
        await db.contractor.delete({ where: { id: c.id } });
        ok((await db.contractor.findUnique({ where: { slug } })) === null, `${slug}: torn down`);
      }
      const stillThere = await db.templateVersion.count({ where: { trade: "plumbing" } });
      ok(stillThere === 1, "the canonical template survives teardown (contractor data only)", `${stillThere}`);
    }
    await db.$disconnect();
  }

  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((e) => { console.error(`\n  ${(e as Error).stack}\n`); process.exit(1); });
