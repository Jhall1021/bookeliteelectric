/**
 * STAGE 1A IS A FIXED-PRICE PILOT — proven at every door, not asserted.
 *
 *   npx tsx scripts/verify-pilot-strategy-eligibility.ts
 *
 * Derived resolved-scope pricing produces a fixed total. A time-and-materials
 * storefront never shows one (it renders a labor range, with no booking action)
 * while /api/visit would still have recorded the fixed total. So the pilot is
 * bounded to FLAT_RATE contractors through ONE eligibility decision
 * (lib/electrical/pilotEligibility.ts), and this suite proves each door uses it:
 *
 *   1  a fixed-price contractor can enter the pilot
 *   2  a time-and-materials contractor cannot
 *   3  …cannot approve the derived price through the server decision
 *   4  …cannot activate the pilot service
 *   5  …and the staff diagnostic reports the unsupported state
 *   6  a fixed-price contractor still walks every existing readiness state
 *   7  the T&M pilot UI data never carries fixed-price-promising copy
 *   8  a null or unknown strategy fails safe
 *   9  the derived fixed total cannot reach a visit line for a T&M contractor
 *
 * A bounded pilot constraint, not a rule that Price2Book is fixed-price only.
 *
 * Runs against the rehearsal database with its own `rv2-pilot-rehearsal-*`
 * contractors, created and removed here — also on a crash.
 */
import { PrismaClient, PricingStrategy } from "@prisma/client";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { withContractor } from "../lib/tenantRoute";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";
import { writeComponentLabor, writeMaterialCost, writeMaterialSystem, writePricingSettingsField } from "../lib/admin/onboardingActions";
import { resolvePolicy } from "../lib/policyResolution";
import { activateService, activationRefusal } from "../lib/serviceActivation";
import { loadPilotDiagnostic } from "../lib/electrical/pilotDiagnostic";
import { loadFirstServiceWizard } from "../lib/electrical/firstServiceWizardData";
import { readFirstServiceReadiness } from "../lib/electrical/firstServiceReadiness";
import { decideDerivedPricingApproval } from "../lib/electrical/derivedPricingApproval";
import { pilotEligibility, loadPilotEligibility, PILOT_SUPPORTED_STRATEGIES } from "../lib/electrical/pilotEligibility";
import { resolveRouteWithDerivedPricing, derivedPlacementPrices } from "../lib/electrical/resolveWithDerivedPricing";
import { loadPilotReadiness, PILOT_ANSWERS } from "../lib/electrical/onboardingPilotReadiness";
import { resetPilotContractor } from "../lib/electrical/pilotReset";
import { liveEndpointOf, PILOT_REHEARSAL_PREFIX } from "../lib/electrical/pilotScope";
import { pilotSetupCopy, pricingCopy, FLAT_RATE_ASSUMPTIONS, type PilotSetupCopy } from "../lib/pricingCopy";
import { SURFACE_ROLES } from "../lib/electrical/surfaceRacewayTakeoff";
import { loadServiceForResolution, loadPricingSettings } from "../lib/routeResolver";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};
/* eslint-disable @typescript-eslint/no-explicit-any */
const as = <T>(id: string, fn: (db: any) => Promise<T>) => withContractor(id, "test", (db) => fn(db));
const LIVE = liveEndpointOf(process.env.DATABASE_URL ?? "");
const RUN = process.pid.toString(36);
const FIXED_SLUG = `${PILOT_REHEARSAL_PREFIX}strategy-${RUN}`;
const TM_SLUG = `${PILOT_REHEARSAL_PREFIX}strategy-tm-${RUN}`;

/** Promises only a fixed-price contractor may be given. The lint's own patterns, plus the pilot's phrasings. */
const PROMISES: RegExp[] = [
  ...FLAT_RATE_ASSUMPTIONS,
  /\bat your price\b/i, /\bprice you approved\b/i, /\bbook it at\b/i, /\binstant (customer )?price\b/i,
  /\bhomeowners get a fixed\b/i, /"fixed price"/i,
];
const promisesIn = (text: string) => PROMISES.filter((re) => re.test(text)).map(String);
const copyText = (c: PilotSetupCopy) => Object.values(c).filter((v) => typeof v === "string").join("\n");

const COSTS: [string, number, number, string][] = [
  [SURFACE_ROLES.channel, 1457, 5, "ft"], [SURFACE_ROLES.joint, 187, 1, "each"], [SURFACE_ROLES.supportClip, 57, 1, "each"],
  [SURFACE_ROLES.transition, 447, 1, "each"], [SURFACE_ROLES.insideElbow, 327, 1, "each"], [SURFACE_ROLES.outsideElbow, 327, 1, "each"],
  [SURFACE_ROLES.flatElbow, 317, 1, "each"], [SURFACE_ROLES.deviceBox, 647, 1, "each"],
  ["CONDUCTOR_THHN_12_UNGROUNDED", 8917, 500, "ft"], ["CONDUCTOR_THHN_12_GROUNDED", 8917, 500, "ft"], ["CONDUCTOR_THHN_12_EQUIPMENT_GROUND", 7417, 500, "ft"],
];
const LABOR: [string, number][] = [["ELEC_ROUTE_SURFACE_MOUNTED", 0], ["SURFACE_ROUTE_FT", 0.02], ["OUTLET_EXTENSION_CORE", 0.6], ["SURFACE_DEVICE_BOX_OUTLET", 0.2]];

async function createContractor(slug: string, pricingStrategy: PricingStrategy) {
  const c = await prisma.contractor.create({
    data: { slug, name: "Pilot Strategy Rehearsal (TEST)", active: true, countryCode: "US", trade: "residential electrician", pricingStrategy },
    select: { id: true } });
  await prisma.contractorSite.create({ data: { contractorId: c.id, hostedSlug: slug, publicId: `site_${randomBytes(16).toString("hex")}`, active: true } });
  await prisma.contractorTrade.create({ data: { contractorId: c.id, tradeKey: "electrical" } });
  return c.id;
}

async function remove(slug: string) {
  const c = await prisma.contractor.findUnique({ where: { slug }, select: { id: true } });
  if (!c) return;
  const r = await resetPilotContractor(prisma, { slug, liveEndpoint: LIVE, dryRun: false });
  if (!r.ok) throw new Error(`could not clean up ${slug}: ${r.refusal.code}`);
  await prisma.contractorSite.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractorTrade.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractor.delete({ where: { id: c.id } });
}

async function homeowner(cid: string, serviceId: string) {
  const loaded = await loadServiceForResolution(prisma, serviceId);
  const settings = await loadPricingSettings(prisma, cid);
  // The storefront's own guarded client, exactly as /api/visit holds it.
  return withContractor(cid, "site-identifier", async (db) => ({
    verdict: await resolveRouteWithDerivedPricing(db as never, loaded as never, PILOT_ANSWERS, true, settings) as any,
    placement: await derivedPlacementPrices(db as never, loaded as never, PILOT_ANSWERS, settings),
  }));
}

async function main() {
  console.log("\nSTAGE 1A — FIXED-PRICE PILOT ELIGIBILITY\n");

  // ── 8, and the decision itself, without a database ──
  console.log("  U  THE ONE DECISION\n");
  const fixed = pilotEligibility("FLAT_RATE");
  ok(fixed.eligible, "U  FLAT_RATE is eligible");
  const tm = pilotEligibility("TIME_AND_MATERIALS");
  ok(!tm.eligible && tm.code === "PILOT_STRATEGY_NOT_SUPPORTED" && tm.strategy === "TIME_AND_MATERIALS",
    "U  TIME_AND_MATERIALS is refused with PILOT_STRATEGY_NOT_SUPPORTED, naming the strategy", JSON.stringify(tm));
  ok(!tm.eligible && tm.supportStatus === "Not available for time-and-materials pricing",
    "U  …with the staff state \"Not available for time-and-materials pricing\"");
  ok(!tm.eligible && /fixed-price services/.test(tm.message) && /Time-and-materials setup will be supported separately/.test(tm.message),
    "U  …and a bounded contractor message that does not call T&M unsupported by Price2Book", !tm.eligible ? tm.message : "");
  for (const bad of [null, undefined, "", "flat_rate", "FLAT RATE", "HOURLY", "constructor", "__proto__", 42, {}, ["FLAT_RATE"]]) {
    const e = pilotEligibility(bad);
    const c = pilotSetupCopy(bad);
    ok(!e.eligible && e.code === "PILOT_STRATEGY_UNKNOWN" && e.strategy === null && !c.available && !c.promisesFixedPrice
      && promisesIn(copyText(c)).length === 0,
      `8  ${JSON.stringify(bad) ?? "undefined"} fails safe: refused as unknown, copy promises nothing`, JSON.stringify({ e, p: promisesIn(copyText(c)) }));
  }
  ok(pricingCopy(null).strategy === "FLAT_RATE",
    "8  the established STOREFRONT fallback is unchanged — only the pilot accessor refuses to default");

  for (const s of Object.values(PricingStrategy)) {
    const e = pilotEligibility(s); const c = pilotSetupCopy(s);
    ok(e.eligible === c.available && c.promisesFixedPrice === e.eligible,
      `U  ${s}: eligibility and its copy agree (eligible=${e.eligible}, promises fixed price=${c.promisesFixedPrice})`);
    ok(e.eligible === PILOT_SUPPORTED_STRATEGIES.includes(s), `U  ${s}: eligible exactly when it is a supported pilot strategy`);
  }
  const flat = pilotSetupCopy("FLAT_RATE");
  ok(flat.reviewStepTitle === "Review your price" && flat.homeownerPricedCheck === "Homeowners get a fixed price"
    && /book it at your price/.test(flat.wizardIntro) && /price you approved/.test(flat.goLiveBody),
    "U  FLAT_RATE keeps the existing truthful fixed-price language");
  ok(promisesIn(copyText(pilotSetupCopy("TIME_AND_MATERIALS"))).length === 0,
    "7  the TIME_AND_MATERIALS pilot copy promises no fixed price", promisesIn(copyText(pilotSetupCopy("TIME_AND_MATERIALS"))).join(", "));
  const unknownContractor = await loadPilotEligibility(prisma, "no-such-contractor-id");
  ok(!unknownContractor.eligible && unknownContractor.code === "PILOT_STRATEGY_UNKNOWN", "8  a contractor that cannot be read is unknown, never eligible");

  console.log("\n  S  ONE SOURCE — EVERY DOOR ASKS THE SAME DECISION\n");
  const src = (f: string) => readFileSync(f, "utf8");
  for (const [file, what] of [
    ["lib/electrical/firstServiceWizardData.ts", "wizard entry"],
    ["lib/electrical/firstServiceReadiness.ts", "readiness API"],
    ["lib/electrical/onboardingPilotReadiness.ts", "readiness model"],
    ["lib/electrical/derivedPricingApproval.ts", "approval"],
    ["lib/serviceActivation.ts", "activation"],
    ["lib/electrical/resolveWithDerivedPricing.ts", "homeowner pricing (visit, quotes, diagnostic)"],
    ["lib/electrical/pilotDiagnostic.ts", "staff diagnostic"],
  ] as const) {
    const t = src(file);
    ok(/loadPilotEligibility\(/.test(t) && !/pricingStrategy\s*[!=]==|"TIME_AND_MATERIALS"|"FLAT_RATE"/.test(t),
      `S  ${what} uses the shared eligibility decision and no strategy check of its own`);
  }
  ok(/from "\.\.\/pricingCopy"/.test(src("lib/electrical/firstServiceWizardData.ts")) && /pilotSetupCopy\(/.test(src("lib/electrical/firstServiceWizardData.ts")),
    "S  the wizard's copy comes from pilotSetupCopy in lib/pricingCopy");
  ok(/w\.copy\.homeownerPricedCheck/.test(src("lib/electrical/pilotDiagnostic.ts")) && /w\.copy\.homeownerPricedOutcome/.test(src("lib/electrical/pilotDiagnostic.ts")),
    "S  the staff diagnostic reads the SAME copy object the wizard receives");
  const wizardSrc = src("app/dashboard/first-service/FirstServiceWizard.tsx");
  ok(/data\.copy\.reviewStepTitle/.test(wizardSrc) && /if \(!data\.pilotAvailable\) return <NotAvailable/.test(wizardSrc),
    "S  the wizard renders copy from data and stops an unavailable contractor at its first branch");
  ok(/storefrontOutcome/.test(src("app/platform/onboarding/[contractorId]/page.tsx")) && !/"fixed price"/.test(src("app/platform/onboarding/[contractorId]/page.tsx")),
    "S  the staff page shows the diagnostic's strategy-true outcome, not a hardcoded one");
  const visitSrc = src("app/api/visit/route.ts");
  ok(/newCand\.basePrice === null && newCand\.whileWeThereBasePrice === null/.test(visitSrc) && /error: "REVIEW_REQUIRED"/.test(visitSrc)
    && /computedPriceCents: resolved\.priceCents/.test(visitSrc) && /const resolved = await resolveRouteWithDerivedPricing\(/.test(visitSrc),
    "S  /api/visit: a new derived line with no computable price returns REVIEW_REQUIRED, and a stored price only ever comes from resolveRouteWithDerivedPricing");
  ok(/resolveRouteWithDerivedPricing\(/.test(src("app/api/quotes/route.ts")), "S  /api/quotes prices through the same guarded resolver");

  await remove(FIXED_SLUG);
  await remove(TM_SLUG);
  try {
    // ── 1 and 6: a fixed-price contractor walks the pilot ──
    console.log("\n  F  A FIXED-PRICE CONTRACTOR — EVERY EXISTING STATE\n");
    const cid = await createContractor(FIXED_SLUG, "FLAT_RATE");
    const status = async () => as(cid, (db) => loadPilotDiagnostic(db, cid));
    const w0 = await as(cid, (db) => loadFirstServiceWizard(db, cid));
    ok(w0.pilotAvailable === true && w0.catalogInstalled === false, "1  fixed-price contractor enters the pilot (catalog step first)", JSON.stringify(w0).slice(0, 120));
    ok((await status()).status === "Catalog not installed", "6  fresh: Catalog not installed");

    const pf = await preflight(prisma, cid, templateVersionSource(prisma, "electrical"));
    if (!pf.ok) throw new Error(pf.message);
    await installCatalog(prisma, cid, pf.catalog);
    ok((await status()).status === "Materials incomplete", "6  after install: Materials incomplete");
    const enter = await as(cid, (db) => readFirstServiceReadiness(db, cid));
    ok(enter.status === 200 && enter.body.resumeAt === "MATERIALS", "1  the readiness API admits them (200, resume at MATERIALS)", JSON.stringify(enter).slice(0, 160));

    await as(cid, (db) => writeMaterialSystem(db, { contractorId: cid }, { systemKey: "SURFACE_RACEWAY", groundingStrategy: "SEPARATE_EQUIPMENT_GROUNDING_CONDUCTOR",
      supportSpacingFt: 5, supportAtEachTerminus: true, sourceTermination: "FITTING_REQUIRED", sourceTerminationRole: SURFACE_ROLES.transition, destinationTermination: "DIRECT_ENTRY" }));
    await as(cid, (db) => resolvePolicy(db, cid, "surface_outlet.branch_conductor_spec", { choice: "12" }));
    await as(cid, (db) => resolvePolicy(db, cid, "surface_raceway.conductor_slack_per_termination", { measurement: 0.5 }));
    for (const [roleKey, packagePriceCents, packageQuantity, packageUnit] of COSTS) {
      const r = await as(cid, (db) => writeMaterialCost(db, { contractorId: cid }, { roleKey, packagePriceCents, packageQuantity, packageUnit }));
      if (!r.ok) ok(false, `cost ${roleKey}`, r.error);
    }
    ok((await status()).status === "Labor incomplete", "6  after materials: Labor incomplete");
    for (const [componentKey, hours] of LABOR) await as(cid, (db) => writeComponentLabor(db, { contractorId: cid }, { action: "set", componentKey, hours }));
    ok((await status()).status === "Pricing setup incomplete", "6  after labor: Pricing setup incomplete");
    for (const [field, value] of [["crewHourRateCents", 18500], ["primaryMinimumCents", 19500], ["roundingIncrementCents", 500], ["defaultPermitAdminCents", 0]] as const)
      await as(cid, (db) => writePricingSettingsField(db, { contractorId: cid }, { action: "set", field, value }));
    ok((await status()).status === "Price ready to approve", "6  after pricing: Price ready to approve");

    const svc = await prisma.service.findFirstOrThrow({ where: { contractorId: cid, slug: "new-120v-outlet" }, select: { id: true } });
    const approved = await as(cid, (db) => decideDerivedPricingApproval(db, { contractorId: cid, userId: null }, { action: "approve", serviceId: svc.id }));
    ok(approved.status === 200 && approved.body.approvedTotalCents === 76000, "1  the SERVER approval decision approves for a fixed-price contractor ($760)", JSON.stringify(approved));
    ok((await status()).status === "Ready to activate", "6  after approval: Ready to activate");
    const act = await activateService(prisma, cid, svc.id);
    let d = await status();
    ok(act.ok && d.status === "Live" && d.audit.storefrontVerdict === "PRICED" && d.audit.storefrontOutcome === "fixed price",
      "6  after activation: Live, homeowners get a fixed price", JSON.stringify({ act, s: d.status, o: d.audit.storefrontOutcome }));
    const wLive = await as(cid, (db) => loadFirstServiceWizard(db, cid));
    ok(wLive.pilotAvailable && wLive.copy.promisesFixedPrice && /at your price/.test(wLive.copy.wizardIntro),
      "1  …and the wizard carries the fixed-price copy for them");
    const legacy = await prisma.service.findFirstOrThrow({ where: { contractorId: cid, pricingMethod: { not: "DERIVED_RESOLVED_SCOPE" }, active: false }, select: { id: true } });
    const legacyRefusalFixed = await activationRefusal(prisma, cid, legacy.id);

    // ── 2–5, 7, 9: the SAME contractor, now pricing time and materials ──
    // The hardest case: an approval already recorded and the service already
    // live. Nothing the pilot granted before may keep working.
    console.log("\n  T  THE SAME CONTRACTOR, NOW TIME AND MATERIALS\n");
    await prisma.contractor.update({ where: { id: cid }, data: { pricingStrategy: "TIME_AND_MATERIALS" } });
    const approvalBefore = await prisma.contractorDerivedPricingApproval.findUniqueOrThrow({
      where: { contractorId_serviceId: { contractorId: cid, serviceId: svc.id } }, select: { approvedAt: true, approvedTotalCents: true } });

    const w = await as(cid, (db) => loadFirstServiceWizard(db, cid));
    const wJson = JSON.stringify(w);
    ok(w.pilotAvailable === false, "2  T&M contractor cannot enter: the wizard receives the unavailable state");
    ok(!/"steps"|"parts"|"labor"|"proposal"|"approvalToken"|"serviceId"/.test(wJson),
      "2  …and no steps, parts, labor, proposal, approval token or service id travel to the page", wJson.slice(0, 200));
    ok(!w.pilotAvailable && w.unavailable.code === "PILOT_STRATEGY_NOT_SUPPORTED"
      && w.unavailable.message === "This guided setup is currently available for fixed-price services. Time-and-materials setup will be supported separately.",
      "2  …with the named code and the bounded message");
    ok(promisesIn(wJson).length === 0, "7  the T&M wizard data contains no fixed-price promise anywhere", promisesIn(wJson).join(", "));
    const apiEnter = await as(cid, (db) => readFirstServiceReadiness(db, cid));
    ok(apiEnter.status === 409 && apiEnter.body.error === "PILOT_STRATEGY_NOT_SUPPORTED" && typeof apiEnter.body.message === "string"
      && !("approvalRequest" in apiEnter.body) && !("proposed" in apiEnter.body),
      "2  the readiness API refuses with 409 PILOT_STRATEGY_NOT_SUPPORTED, before any price or approval token", JSON.stringify(apiEnter));
    const readiness = await as(cid, (db) => loadPilotReadiness(db, cid, {
      components: [], context: { isPrimary: true, isPrimaryEligible: true, servicePermitAdminEstablished: false },
      service: { materialMultiplier: null, permitAdminCents: null, otherDirectCostCents: null, isPrimaryEligible: true } }));
    ok(readiness.steps.length === 1 && readiness.steps[0].key === "ELIGIBILITY" && !readiness.steps[0].done
      && readiness.resumeAt === "ELIGIBILITY" && readiness.live === false && readiness.proposed === null,
      "2  the readiness model has one step, ELIGIBILITY, never done: no approve step, no proposal, not live", JSON.stringify(readiness).slice(0, 200));

    const refusedApproval = await as(cid, (db) => decideDerivedPricingApproval(db, { contractorId: cid, userId: null }, { action: "approve", serviceId: svc.id }));
    ok(refusedApproval.status === 409 && refusedApproval.body.error === "PILOT_STRATEGY_NOT_SUPPORTED"
      && refusedApproval.body.pricingStrategy === "TIME_AND_MATERIALS" && typeof refusedApproval.body.message === "string",
      "3  the SERVER refuses approval: 409 PILOT_STRATEGY_NOT_SUPPORTED, with message and strategy", JSON.stringify(refusedApproval));
    const approvalAfter = await prisma.contractorDerivedPricingApproval.findUniqueOrThrow({
      where: { contractorId_serviceId: { contractorId: cid, serviceId: svc.id } }, select: { approvedAt: true, approvedTotalCents: true } });
    ok(approvalAfter.approvedAt.getTime() === approvalBefore.approvedAt.getTime(), "3  …and the approval record was not touched");

    d = await status();
    ok(d.status === "Not available for time-and-materials pricing", `5  staff diagnostic: "${d.status}"`);
    ok(!["Price ready to approve", "Ready to activate", "Live"].includes(d.status), "5  …never Price ready to approve, Ready to activate or Live");
    ok(d.checks[0].label === "Pricing model supported by this pilot" && d.checks[0].ok === false && d.checks[0].detail === "Time and materials",
      "5  …first check names the pricing model as unsupported", JSON.stringify(d.checks));
    ok(d.audit.storefrontVerdict === "REVIEW" && d.audit.storefrontOutcome !== "fixed price" && d.audit.currentProposedCents === null,
      "5  …and reports the storefront as it is now: review, no proposed price", JSON.stringify(d.audit));
    ok(promisesIn(JSON.stringify({ status: d.status, nextAction: d.nextAction, checks: d.checks, outcome: d.audit.storefrontOutcome })).length === 0,
      "7  the T&M staff view carries no fixed-price promise");

    const h = await homeowner(cid, svc.id);
    ok(h.verdict.status === "REVIEW" && h.verdict.derivedRefusalCode === "PILOT_STRATEGY_NOT_SUPPORTED" && h.verdict.priceCents === undefined
      && h.verdict.derivedBasisFingerprint === undefined,
      "9  the homeowner resolver computes no derived price for a T&M contractor (REVIEW, PILOT_STRATEGY_NOT_SUPPORTED)", JSON.stringify(h.verdict).slice(0, 200));
    ok(h.placement.basePrice === null && h.placement.whileWeThereBasePrice === null,
      "9  …so /api/visit's placement prices are both null — its REVIEW_REQUIRED branch, before any line is written");
    ok(!/fixed|time-and-materials|pilot/i.test(String(h.verdict.reason)), "9  …and the homeowner is told only that the job needs a review", String(h.verdict.reason));
    ok(await prisma.lineItem.count({ where: { service: { contractorId: cid }, resolvedEconomicBasis: { not: null } } }) === 0,
      "9  no visit line carrying a derived price exists for this contractor");

    await prisma.service.update({ where: { id: svc.id }, data: { active: false } });   // fixture: take it down to try again
    const refusal = await activationRefusal(prisma, cid, svc.id);
    ok(refusal?.code === "PILOT_STRATEGY_NOT_SUPPORTED" && !!refusal.message,
      "4  activation refuses PILOT_STRATEGY_NOT_SUPPORTED — even with an approval already on record", JSON.stringify(refusal));
    const reactivate = await activateService(prisma, cid, svc.id);
    const stillDown = await prisma.service.findUniqueOrThrow({ where: { id: svc.id }, select: { active: true } });
    ok(!reactivate.ok && stillDown.active === false, "4  activateService does not put it live", JSON.stringify(reactivate));
    const legacyRefusalTm = await activationRefusal(prisma, cid, legacy.id);
    ok(legacyRefusalTm?.code !== "PILOT_STRATEGY_NOT_SUPPORTED" && legacyRefusalTm?.code === legacyRefusalFixed?.code,
      "4  a NON-pilot service's activation answer is unchanged by the strategy", `${legacyRefusalFixed?.code} -> ${legacyRefusalTm?.code}`);

    // ── back to fixed price: the guard is keyed on strategy and nothing else ──
    console.log("\n  R  BACK TO FIXED PRICE\n");
    await prisma.contractor.update({ where: { id: cid }, data: { pricingStrategy: "FLAT_RATE" } });
    const back = await activateService(prisma, cid, svc.id);
    d = await status();
    ok(back.ok && d.status === "Live" && d.audit.storefrontVerdict === "PRICED",
      "6  restored to FLAT_RATE, the standing approval activates and prices again", JSON.stringify({ back, s: d.status }));

    // ── a contractor that was never fixed price ──
    console.log("\n  N  A NEW TIME-AND-MATERIALS CONTRACTOR\n");
    const tid = await createContractor(TM_SLUG, "TIME_AND_MATERIALS");
    const wt = await as(tid, (db) => loadFirstServiceWizard(db, tid));
    ok(wt.pilotAvailable === false && wt.catalogInstalled === false, "2  a new T&M contractor is stopped before even the catalog step");
    const dt = await as(tid, (db) => loadPilotDiagnostic(db, tid));
    ok(dt.status === "Not available for time-and-materials pricing", `5  …staff see "${dt.status}", not "Catalog not installed"`);
  } finally {
    await remove(FIXED_SLUG);
    await remove(TM_SLUG);
    const left = await prisma.contractor.count({ where: { slug: { in: [FIXED_SLUG, TM_SLUG] } } });
    ok(left === 0, "   every rehearsal contractor this run created is gone", `${left} left`);
  }

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await remove(FIXED_SLUG).catch(() => {}); await remove(TM_SLUG).catch(() => {}); await prisma.$disconnect(); process.exit(1); });
