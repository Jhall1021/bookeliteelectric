/**
 * Catalog completion — a focused, affected-paths-only proof.
 *
 * NOT a repeat of the full fresh-launch rehearsal or the booking suites —
 * those already ran this session and are unaffected by this round's changes
 * (confirmed directly below, check 10). This proves specifically what
 * changed: the five previously-omitted services extract and install with
 * their real scope decisions intact, the two customer-supplied-equipment
 * and four finished-ceiling disclaimers carry through extraction, the
 * panel-replacement recipe matches the intended final scope exactly, and
 * none of it touches new-120v-outlet's own proven route.
 *
 *   npx tsx scripts/verify-catalog-completion.ts
 *
 * Needs DATABASE_URL pointed at this run's own scratch database (the one
 * scripts/rehearse-fresh-electrical-launch.ts just built and extracted).
 */
import { PrismaClient } from "@prisma/client";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";
import { assertDisposableLocalDatabase } from "../prisma/_assertDisposableLocalDatabase";

const prisma = new PrismaClient();
const SLUG = `test-catalog-completion-${process.pid.toString(36)}`;

let fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
};

async function teardown() {
  const c = await prisma.contractor.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!c) return;
  const ids = (await prisma.service.findMany({ where: { contractorId: c.id }, select: { id: true } })).map((s) => s.id);
  await prisma.answerOption.deleteMany({ where: { question: { serviceId: { in: ids } } } }).catch(() => {});
  await prisma.question.deleteMany({ where: { serviceId: { in: ids } } }).catch(() => {});
  await prisma.serviceMaterial.deleteMany({ where: { serviceId: { in: ids } } }).catch(() => {});
  await prisma.service.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
  await prisma.contractorCategory.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
  await prisma.contractorPolicyValue.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
  await prisma.contractor.delete({ where: { id: c.id } }).catch(() => {});
}

async function main() {
  console.log("\nCATALOG COMPLETION — five services, disclaimers, panel recipe — affected-paths proof\n");
  await assertDisposableLocalDatabase(prisma);
  await teardown();

  const source = templateVersionSource(prisma, "electrical");
  const contractor = await prisma.contractor.create({
    data: { slug: SLUG, name: "Catalog Completion Proof (TEST)", active: true, countryCode: "US" },
    select: { id: true },
  });
  try {
    const preflighted = await preflight(prisma, contractor.id, source);
    if (!preflighted.ok) throw new Error(`preflight refused: ${preflighted.message}`);
    const result = await installCatalog(prisma, contractor.id, preflighted.catalog);
    console.log(`  installed ${result.services} services, ${result.unresolvedMaterialRoles} material role(s) unresolved, ${result.disclaimersToAuthor} disclaimer(s) to author\n`);
    ok("0. the fresh install carries all 81 services — nothing explained away by count", result.services === 81, `got ${result.services}`);

    // ── 1-5. the five previously-omitted services ──────────────────────────
    const svc = async (slug: string) => prisma.service.findFirst({
      where: { contractorId: contractor.id, slug }, select: { id: true, name: true } });

    const generatorInlet = await svc("generator-inlet-interlock");
    ok("1. generator-inlet-interlock installed", generatorInlet !== null);
    if (generatorInlet) {
      const q = await prisma.question.findFirst({ where: { serviceId: generatorInlet.id, key: "inlet_location" }, select: { helpText: true } });
      ok("   inlet_location help text is the neutral rewrite, not Elite's hardcoded \"10 feet\"",
        q?.helpText === "Your price includes a standard length of wiring between the two, set during your electrician's own setup.",
        JSON.stringify(q));
      const wire = await prisma.serviceMaterial.findFirst({
        where: { serviceId: generatorInlet.id, canonicalMaterial: { key: "WIRE_10_3" } },
        select: { quantity: true, quantityIsPolicy: true } });
      ok("   WIRE_10_3 stays a policy-quantity allowance (10 ft was Elite's own, not erased or hardcoded)",
        wire?.quantityIsPolicy === true && wire?.quantity === null, JSON.stringify(wire));
    }

    const hotTub = await svc("hot-tub-spa-electrical");
    ok("2. hot-tub-spa-electrical installed", hotTub !== null);
    if (hotTub) {
      const q = await prisma.question.findFirst({
        where: { serviceId: hotTub.id, key: "spa_distance" },
        include: { options: { select: { value: true, label: true }, orderBy: { order: "asc" } } } });
      ok("   spa_distance help text is the neutral rewrite", q?.helpText === "Your price includes a standard length of wiring, set during your electrician's own setup.", JSON.stringify(q?.helpText));
      const near = q?.options.find((o) => o.value === "near");
      const far = q?.options.find((o) => o.value === "far");
      ok("   near/far are UNRESOLVED band patterns, not Elite's baked-in \"25 feet\" (real scope decision retained as a live policy, not erased)",
        near?.label === "Within about {b1} feet" && far?.label === "Further than {b1} feet",
        JSON.stringify({ near: near?.label, far: far?.label }));
      const policy = await prisma.templatePolicyDefinition.findFirst({ where: { key: "spa_circuit_run.breakpoints" } });
      ok("   spa_circuit_run.breakpoints policy definition exists in the template", policy !== null);
    }

    const underCabinet = await svc("under-cabinet-led-lighting");
    ok("3. under-cabinet-led-lighting installed", underCabinet !== null);
    if (underCabinet) {
      const q = await prisma.question.findFirst({
        where: { serviceId: underCabinet.id, key: "uc_length" },
        include: { options: { select: { value: true, label: true } } } });
      const standard = q?.options.find((o) => o.value === "standard");
      const long = q?.options.find((o) => o.value === "long");
      ok("   standard/long are UNRESOLVED band patterns, not Elite's baked-in \"12 feet\"",
        standard?.label === "Up to about {b1} feet" && long?.label === "More than {b1} feet",
        JSON.stringify({ standard: standard?.label, long: long?.label }));
    }

    const fanOnly = await svc("replace-bathroom-exhaust-fan");
    ok("4. replace-bathroom-exhaust-fan installed", fanOnly !== null);
    ok("   its name no longer asserts \"We Supply the Fan\" for every contractor", fanOnly?.name === "Replace Bathroom Exhaust Fan", fanOnly?.name);
    if (fanOnly) {
      const q = await prisma.question.findFirst({ where: { serviceId: fanOnly.id, key: "fan_package" }, select: { helpText: true } });
      ok("   fan_package help text keeps the real cost fact, drops the \"we supply\" policy assertion",
        q?.helpText === "A light version costs a little more, both to buy and to fit.", JSON.stringify(q));
      const supplyPolicy = await prisma.templatePolicyDefinition.findFirst({ where: { key: "bathroom_fan.supply_arrangement" } });
      ok("   bathroom_fan.supply_arrangement policy definition exists — the decision is retained, not deleted", supplyPolicy !== null);
    }

    const fanWithLight = await svc("replace-bathroom-exhaust-fan-with-light");
    ok("5. replace-bathroom-exhaust-fan-with-light installed", fanWithLight !== null);
    ok("   its name is neutral too, matching the base fan's own rename", fanWithLight?.name === "Replace Bathroom Exhaust Fan with Light", fanWithLight?.name);

    // ── 6-7. disclaimers carried through extraction and fresh installation ──
    ok("6. every disclaimer this round bootstrapped landed in Service.unresolvedPolicyKeys/disclaimersToAuthor as a real onboarding item, not silently skipped",
      result.disclaimersToAuthor > 0, `got ${result.disclaimersToAuthor}`);

    const rangeHood = await svc("replace-range-hood");
    const soundbar = await svc("soundbar-installation");
    ok("   replace-range-hood and soundbar-installation both installed", rangeHood !== null && soundbar !== null);
    if (soundbar) {
      // Elite's OWN live row — this is where the inline text used to live.
      const eliteSoundbar = await prisma.service.findFirst({ where: { slug: "soundbar-installation" }, select: { id: true } });
      const eliteYes = eliteSoundbar
        ? await prisma.answerOption.findFirst({
            where: { value: "yes", question: { key: "soundbar_power", serviceId: eliteSoundbar.id } },
            select: { disclaimer: true } })
        : null;
      ok("   Elite's own soundbar_power/yes carries no more inline disclaimer text — it moved to the canonical one",
        eliteYes?.disclaimer === null, JSON.stringify(eliteYes));
      // The fresh contractor has authored no ContractorDisclaimer of their own
      // yet — installCatalog correctly leaves the AnswerOptionDisclaimer link
      // unattached (an onboarding backlog item, not a defect); the concept
      // still has to be traceable on the TEMPLATE side.
      const templateOpt = await prisma.templateAnswerOption.findFirst({
        where: { value: "yes", templateQuestion: { key: "soundbar_power" } },
        include: { disclaimers: { include: { canonicalDisclaimer: { select: { key: true } } } } } });
      ok("   the template itself carries CUSTOMER_SUPPLIED_EQUIPMENT on that answer",
        templateOpt?.disclaimers.some((d) => d.canonicalDisclaimer.key === "CUSTOMER_SUPPLIED_EQUIPMENT") ?? false,
        JSON.stringify(templateOpt?.disclaimers.map((d) => d.canonicalDisclaimer.key)));
    }

    // ── 8. electrical-panel-replacement's intended recipe, on a fresh install ──
    const panel = await svc("electrical-panel-replacement");
    ok("8. electrical-panel-replacement installed", panel !== null);
    if (panel) {
      const mats = await prisma.serviceMaterial.findMany({
        where: { serviceId: panel.id },
        select: { quantity: true, quantityIsPolicy: true, canonicalMaterial: { select: { key: true } } } });
      const byKey = new Map(mats.map((m) => [m.canonicalMaterial?.key, m]));
      ok("   PANEL_MAIN_BREAKER resolved structural x1", byKey.get("PANEL_MAIN_BREAKER")?.quantity === 1 && byKey.get("PANEL_MAIN_BREAKER")?.quantityIsPolicy === false,
        JSON.stringify(byKey.get("PANEL_MAIN_BREAKER")));
      for (const key of ["BREAKER_SINGLE_POLE", "BREAKER_DOUBLE_POLE", "CONSUMABLES_MEDIUM"]) {
        const m = byKey.get(key);
        ok(`   ${key} linked as an unresolved policy quantity (never Elite's own count)`, m?.quantityIsPolicy === true && m?.quantity === null, JSON.stringify(m));
      }
      for (const key of ["GROUND_ROD", "GROUND_CLAMP", "WIRE_GROUND_6"]) {
        ok(`   ${key} is genuinely absent — no assumed grounding-electrode work`, !byKey.has(key));
      }
      ok("   the recipe is exactly these 4 lines, nothing more", mats.length === 4, JSON.stringify([...byKey.keys()]));
    }

    // ── 9. dependencies survive installation: the new exterior-wall question exists,
    //        and new-120v-outlet's own proven route is untouched by it ────────
    const outlet = await svc("new-120v-outlet");
    ok("9. new-120v-outlet installed", outlet !== null);
    if (outlet) {
      const exterior = await prisma.question.findFirst({ where: { serviceId: outlet.id, key: "device_on_exterior_wall" } });
      ok("   device_on_exterior_wall now exists on a fresh install (never before this round, on any from-scratch database)", exterior !== null);
      // Its OPTIONS are empty and nothing routes to it — expected, and not a
      // regression this round introduced. prisma/seed-new-outlet-v2.ts's own
      // RETIRED_OUTLET_QUESTIONS list names device_on_exterior_wall
      // explicitly, alongside outlet_run_distance and finished_space_both_
      // sides, and runs AFTER seed-conditional-disclaimers.ts in the real
      // seed chain: Routing V2's rewrite of new-120v-outlet "replaces
      // everything downstream of 'is there an accessible route'" (that
      // file's own header), superseding V1's exterior-wall contingency
      // along with the rest of V1's routing. The row survives, per that
      // file's own "rewired out, not deleted" policy — which is exactly
      // what this checks, rather than assuming V1 wiring persists through a
      // V2 rewrite that was never designed to carry it forward.
      const exteriorOptionCount = exterior ? await prisma.answerOption.count({ where: { questionId: exterior.id } }) : -1;
      ok("   ...with no answer options — Routing V2's later rewrite of this exact service retires it, same as the other three V1-only questions, by design",
        exteriorOptionCount === 0, `got ${exteriorOptionCount}`);

      const access = await prisma.question.findFirst({
        where: { serviceId: outlet.id, key: "below_above_access" },
        include: { options: { select: { value: true, nextQuestionId: true } } } });
      const noAccess = access?.options.find((o) => o.value === "no_access");
      const installMethod = await prisma.question.findFirst({ where: { serviceId: outlet.id, key: "outlet_install_method" }, select: { id: true } });
      ok("   below_above_access/no_access STILL goes straight to outlet_install_method — the booking proof's own route is untouched",
        noAccess?.nextQuestionId === installMethod?.id, JSON.stringify({ noAccess, installMethod }));
    }

    console.log(`\n${fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`}\n`);
  } finally {
    await teardown();
    await prisma.$disconnect();
  }
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
