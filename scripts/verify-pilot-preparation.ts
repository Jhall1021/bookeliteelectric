/**
 * Controlled-pilot preparation: support status, fail-closed cases, audit, reset.
 *
 * Walks one DESIGNATED REHEARSAL contractor through the pilot using the same
 * functions the wizard's endpoints call, on the tenant-guarded client, and
 * reads the support diagnostic at every stage. Then proves that every case the
 * pilot must refuse still refuses, that a cost change leaves a durable record,
 * and that the reset returns the contractor to a state the real installer
 * accepts again — while refusing every contractor it must never touch.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { withContractor } from "../lib/tenantRoute";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";
import { writeComponentLabor, writeMaterialCost, writeMaterialSystem, writePricingSettingsField } from "../lib/admin/onboardingActions";
import { resolvePolicy } from "../lib/policyResolution";
import { activateService } from "../lib/serviceActivation";
import { loadPilotDiagnostic } from "../lib/electrical/pilotDiagnostic";
import { resetPilotContractor } from "../lib/electrical/pilotReset";
import { resetRefusal, liveEndpointOf, PILOT_REHEARSAL_PREFIX } from "../lib/electrical/pilotScope";
import { proposeDerivedScope } from "../lib/electrical/loadDerivedScope";
import { resolveRouteWithDerivedPricing } from "../lib/electrical/resolveWithDerivedPricing";
import { PILOT_ANSWERS } from "../lib/electrical/onboardingPilotReadiness";
import { SURFACE_ROLES } from "../lib/electrical/surfaceRacewayTakeoff";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../lib/routeResolver";
import { pilotLog } from "../lib/electrical/pilotLog";
import { SURFACE_KEYS } from "../prisma/_surfaceRouteModule";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};
const SLUG = `${PILOT_REHEARSAL_PREFIX}verify-${process.pid.toString(36)}`;
const LIVE = liveEndpointOf(process.env.DATABASE_URL ?? "");
/* eslint-disable @typescript-eslint/no-explicit-any */
const as = <T>(id: string, fn: (db: any) => Promise<T>) => withContractor(id, "test", (db) => fn(db));

const COSTS: [string, number, number, string][] = [
  [SURFACE_ROLES.channel, 1457, 5, "ft"], [SURFACE_ROLES.joint, 187, 1, "each"], [SURFACE_ROLES.supportClip, 57, 1, "each"],
  [SURFACE_ROLES.transition, 447, 1, "each"], [SURFACE_ROLES.insideElbow, 327, 1, "each"], [SURFACE_ROLES.outsideElbow, 327, 1, "each"],
  [SURFACE_ROLES.flatElbow, 317, 1, "each"], [SURFACE_ROLES.deviceBox, 647, 1, "each"],
  ["CONDUCTOR_THHN_12_UNGROUNDED", 8917, 500, "ft"], ["CONDUCTOR_THHN_12_GROUNDED", 8917, 500, "ft"], ["CONDUCTOR_THHN_12_EQUIPMENT_GROUND", 7417, 500, "ft"],
];
const LABOR: [string, number][] = [["ELEC_ROUTE_SURFACE_MOUNTED", 0], ["SURFACE_ROUTE_FT", 0.02], ["OUTLET_EXTENSION_CORE", 0.6], ["SURFACE_DEVICE_BOX_OUTLET", 0.2]];

async function homeowner(contractorId: string, answers = PILOT_ANSWERS) {
  const svc = await prisma.service.findFirstOrThrow({ where: { contractorId, slug: "new-120v-outlet" }, select: { id: true } });
  const loaded = await loadServiceForResolution(prisma, svc.id);
  let settings: unknown = null;
  try { settings = await loadPricingSettings(prisma, contractorId); } catch { settings = null; }
  if (!settings) return { status: "NO_SETTINGS" as const };
  return as(contractorId, (db) => resolveRouteWithDerivedPricing(db, loaded as never, answers, true, settings as never));
}

async function approve(contractorId: string) {
  const svc = await prisma.service.findFirstOrThrow({ where: { contractorId, slug: "new-120v-outlet" },
    select: { id: true, isPrimaryEligible: true, materialMultiplier: true, permitAdminCents: true, otherDirectCostCents: true } });
  const loaded = await loadServiceForResolution(prisma, svc.id);
  const settings = await loadPricingSettings(prisma, contractorId);
  const comps = ((resolveRoute(loaded as never, PILOT_ANSWERS, true, settings) as any).config.components) as { key: string; quantity: number }[];
  // Mirrors /api/admin/derived-pricing-approval: evaluate server-side, refuse unless priceable.
  return as(contractorId, async (db) => {
    const { proposal, basisFingerprint } = await proposeDerivedScope(db, { contractorId, serviceId: svc.id, components: comps,
      routeFeet: 31, turnCount: 0,
      context: { isPrimary: true, isPrimaryEligible: svc.isPrimaryEligible, servicePermitAdminEstablished: svc.permitAdminCents !== null },
      service: { materialMultiplier: svc.materialMultiplier, permitAdminCents: svc.permitAdminCents, otherDirectCostCents: svc.otherDirectCostCents, isPrimaryEligible: svc.isPrimaryEligible } });
    if (proposal.kind !== "PRICED") return null;
    const data = { approvedBasisFingerprint: basisFingerprint, approvedTotalCents: proposal.totalCents,
      approvedLaborCents: Math.round(proposal.breakdown.laborCents), approvedMaterialCents: proposal.breakdown.materialCents, approvedAt: new Date() };
    await db.contractorDerivedPricingApproval.upsert({ where: { contractorId_serviceId: { contractorId, serviceId: svc.id } },
      update: data, create: { contractorId, serviceId: svc.id, ...data } });
    return proposal.totalCents;
  });
}

/** Leave nothing behind — also on a crash. Throws if it cannot, rather than hiding it. */
async function removeRehearsalContractor() {
  const c = await prisma.contractor.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!c) return;
  const r = await resetPilotContractor(prisma, { slug: SLUG, liveEndpoint: LIVE, dryRun: false });
  if (!r.ok) throw new Error(`could not clean up ${SLUG}: ${r.refusal.code}`);
  await prisma.contractorSite.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractorTrade.deleteMany({ where: { contractorId: c.id } });
  await prisma.contractor.delete({ where: { id: c.id } });
}

async function main() {
  console.log(`\nCONTROLLED PILOT PREPARATION\n  rehearsal contractor ${SLUG}\n`);

  console.log("  A  RESET ELIGIBILITY — WHO MAY NEVER BE RESET\n");
  const copied = { key: "price2book-production", neonEndpoint: "ep-some-production-endpoint" };
  ok(resetRefusal({ slug: "elite-electric", identity: copied, liveEndpoint: LIVE })?.code === "PROTECTED_TENANT", "A  Elite is refused");
  ok(resetRefusal({ slug: "brightpath-electric", identity: copied, liveEndpoint: LIVE })?.code === "PROTECTED_TENANT", "A  BrightPath is refused");
  ok(resetRefusal({ slug: "joes-electric", identity: copied, liveEndpoint: LIVE })?.code === "NOT_A_REHEARSAL_CONTRACTOR", "A  an arbitrary business is refused");
  ok(resetRefusal({ slug: "cmtx7wsgu000010svck53gtnz", identity: copied, liveEndpoint: LIVE })?.code === "NOT_A_REHEARSAL_CONTRACTOR", "A  a raw contractor id is refused");
  ok(resetRefusal({ slug: `${PILOT_REHEARSAL_PREFIX}x`, identity: { key: "price2book-production", neonEndpoint: LIVE }, liveEndpoint: LIVE })?.code === "PRODUCTION_DATABASE",
    "A  a rehearsal slug on the stamped production database is refused");
  ok(resetRefusal({ slug: `${PILOT_REHEARSAL_PREFIX}x`, identity: null, liveEndpoint: LIVE })?.code === "DATABASE_IDENTITY_UNKNOWN", "A  an unidentified database is refused");
  ok(resetRefusal({ slug: `${PILOT_REHEARSAL_PREFIX}x`, identity: copied, liveEndpoint: LIVE }) === null,
    "A  a rehearsal slug on a copied (non-matching) identity is allowed");
  const identity = await prisma.databaseIdentity.findUnique({ where: { id: "singleton" }, select: { key: true, neonEndpoint: true } });
  ok(!!identity && identity.neonEndpoint !== LIVE, `A  this database is a rehearsal copy (connected ${LIVE}, stamped ${identity?.neonEndpoint})`);
  const eliteBefore = await prisma.service.count({ where: { contractor: { slug: "elite-electric" } } });
  const eliteReset = await resetPilotContractor(prisma, { slug: "elite-electric", liveEndpoint: LIVE, dryRun: false });
  ok(!eliteReset.ok && eliteReset.refusal.code === "PROTECTED_TENANT", "A  resetting Elite against the real database is refused");
  ok(await prisma.service.count({ where: { contractor: { slug: "elite-electric" } } }) === eliteBefore, `A  …and Elite still has all ${eliteBefore} services`);

  // ── a rehearsal contractor, set up the sanctioned way ──
  const old = await prisma.contractor.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (old) await resetPilotContractor(prisma, { slug: SLUG, liveEndpoint: LIVE, dryRun: false });
  const c = old ?? await prisma.contractor.create({ data: { slug: SLUG, name: "Pilot Rehearsal (TEST)", active: true, countryCode: "US", trade: "residential electrician" }, select: { id: true } });
  const cid = c.id;
  if (!old) {
    await prisma.contractorSite.create({ data: { contractorId: cid, hostedSlug: SLUG, publicId: `site_${randomBytes(16).toString("hex")}`, active: true } });
    await prisma.contractorTrade.create({ data: { contractorId: cid, tradeKey: "electrical" } });
  }

  console.log("\n  B  SUPPORT STATUS AT EVERY STAGE\n");
  const status = async () => as(cid, (db) => loadPilotDiagnostic(db, cid));
  let d = await status();
  ok(d.status === "Catalog not installed", `B  fresh: "${d.status}"`);
  const pf = await preflight(prisma, cid, templateVersionSource(prisma, "electrical"));
  if (!pf.ok) throw new Error(pf.message);
  await installCatalog(prisma, cid, pf.catalog);
  d = await status();
  ok(d.status === "Materials incomplete", `B  after install: "${d.status}"`);
  ok(d.checks.find((x) => x.label === "Pilot service present")?.ok === true, "B  …pilot service present and on pilot pricing");
  ok(d.missing.includes("Wire size") && d.missing.some((m) => m.startsWith("Price for Raceway channel")), "B  …missing items named in plain words", JSON.stringify(d.missing.slice(0, 4)));

  await as(cid, (db) => writeMaterialSystem(db, { contractorId: cid }, { systemKey: "SURFACE_RACEWAY", groundingStrategy: "SEPARATE_EQUIPMENT_GROUNDING_CONDUCTOR",
    supportSpacingFt: 5, supportAtEachTerminus: true, sourceTermination: "FITTING_REQUIRED", sourceTerminationRole: SURFACE_ROLES.transition, destinationTermination: "DIRECT_ENTRY" }));
  await as(cid, (db) => resolvePolicy(db, cid, "surface_outlet.branch_conductor_spec", { choice: "12" }));
  await as(cid, (db) => resolvePolicy(db, cid, "surface_raceway.conductor_slack_per_termination", { measurement: 0.5 }));
  for (const [roleKey, packagePriceCents, packageQuantity, packageUnit] of COSTS) {
    const r = await as(cid, (db) => writeMaterialCost(db, { contractorId: cid }, { roleKey, packagePriceCents, packageQuantity, packageUnit }));
    if (!r.ok) ok(false, `cost ${roleKey}`, r.error);
  }
  d = await status();
  ok(d.status === "Labor incomplete", `B  after materials: "${d.status}"`);
  const events = await prisma.materialCostEvent.count({ where: { contractorId: cid } });
  ok(events >= COSTS.length, `B  every wizard cost write left a durable cost event (${events})`);

  for (const [componentKey, hours] of LABOR) await as(cid, (db) => writeComponentLabor(db, { contractorId: cid }, { action: "set", componentKey, hours }));
  d = await status();
  ok(d.status === "Pricing setup incomplete", `B  after labor: "${d.status}"`);

  for (const [field, value] of [["crewHourRateCents", 18500], ["primaryMinimumCents", 19500], ["roundingIncrementCents", 500], ["defaultPermitAdminCents", 0]] as const)
    await as(cid, (db) => writePricingSettingsField(db, { contractorId: cid }, { action: "set", field, value }));
  d = await status();
  ok(d.status === "Price ready to approve", `B  after pricing: "${d.status}"`);
  ok(d.audit.currentProposedCents === 76000, `B  …with the proposed price visible before approval ($${(d.audit.currentProposedCents ?? 0) / 100})`);
  ok(d.audit.storefrontVerdict === "REVIEW", "B  …and homeowners still get a review, not a price");

  const approved = await approve(cid);
  d = await status();
  ok(approved === 76000 && d.status === "Ready to activate", `B  after approval: "${d.status}"`);

  const svc = await prisma.service.findFirstOrThrow({ where: { contractorId: cid, slug: "new-120v-outlet" }, select: { id: true } });
  const act = await activateService(prisma, cid, svc.id);
  d = await status();
  ok(act.ok && d.status === "Live", `B  after activation: "${d.status}"`);
  ok(d.audit.storefrontVerdict === "PRICED", "B  …homeowners get a fixed price");
  ok(d.checks.every((x) => x.ok), "B  …every readiness check passes", JSON.stringify(d.checks.filter((x) => !x.ok)));

  console.log("\n  C  NO INTERNAL LANGUAGE IN THE SUPPORT VIEW\n");
  const text = JSON.stringify(d) + JSON.stringify((await (async () => { await as(cid, (db) => writeComponentLabor(db, { contractorId: cid }, { action: "clear", componentKey: "OUTLET_EXTENSION_CORE" })); return status(); })()));
  ok(!/SURFACE_RACEWAY|CONDUCTOR_THHN|ELEC_ROUTE|OUTLET_EXTENSION|SURFACE_ROUTE|SURFACE_DEVICE/.test(text.replace(/"(serviceId|contractorId)":"[^"]*"/g, "")), "C  no role or component keys", text.match(/SURFACE_\w+|CONDUCTOR_\w+|OUTLET_\w+/)?.[0] ?? "");
  ok(!/fingerprint|basis|policy|canonical|resolved scope/i.test(text), "C  no fingerprint, policy or architecture words");
  await as(cid, (db) => writeComponentLabor(db, { contractorId: cid }, { action: "set", componentKey: "OUTLET_EXTENSION_CORE", hours: 0.6 }));

  console.log("\n  D  FAIL-CLOSED CASES — NONE BECOMES A GUESSED PRICE\n");
  const v0 = await homeowner(cid);
  ok(v0.status === "PRICED", "D  control: the straight pilot route prices");
  const turned = { ...PILOT_ANSWERS, [SURFACE_KEYS.inside]: "2", [SURFACE_KEYS.flat]: "1" };
  const vTurn = await homeowner(cid, turned);
  ok(vTurn.status === "REVIEW", "D  a turned route goes to REVIEW", String(vTurn.status));

  await as(cid, (db) => writeComponentLabor(db, { contractorId: cid }, { action: "clear", componentKey: "SURFACE_ROUTE_FT" }));
  const vLabor = await homeowner(cid);
  ok(vLabor.status === "REVIEW", "D  unresolved labor → REVIEW", String(vLabor.status));
  await as(cid, (db) => writeComponentLabor(db, { contractorId: cid }, { action: "set", componentKey: "SURFACE_ROUTE_FT", hours: 0.02 }));

  await as(cid, (db) => writeMaterialSystem(db, { contractorId: cid }, { systemKey: "SURFACE_RACEWAY", groundingStrategy: null }));
  const vMat = await homeowner(cid);
  ok(vMat.status === "REVIEW", "D  unresolved material configuration → REVIEW", String(vMat.status));
  await as(cid, (db) => writeMaterialSystem(db, { contractorId: cid }, { systemKey: "SURFACE_RACEWAY", groundingStrategy: "SEPARATE_EQUIPMENT_GROUNDING_CONDUCTOR" }));

  await as(cid, (db) => writePricingSettingsField(db, { contractorId: cid }, { action: "clear", field: "crewHourRateCents" }));
  const vSet = await homeowner(cid);
  ok(vSet.status !== "PRICED", "D  incomplete pricing settings → no price", String(vSet.status));
  d = await status();
  ok(d.status === "Pricing setup incomplete" && d.audit.storefrontVerdict !== "PRICED", `D  …support shows "${d.status}"`);
  await as(cid, (db) => writePricingSettingsField(db, { contractorId: cid }, { action: "set", field: "crewHourRateCents", value: 18500 }));

  // The earlier edits changed the basis; a real contractor would re-approve.
  await approve(cid);
  const vBack = await homeowner(cid);
  ok(vBack.status === "PRICED", "D  restored and re-approved: prices again");

  await as(cid, (db) => writeMaterialCost(db, { contractorId: cid }, { roleKey: SURFACE_ROLES.channel, packagePriceCents: 1699, packageQuantity: 5, packageUnit: "ft" }));
  const vStale = await homeowner(cid);
  ok(vStale.status === "REVIEW" && (vStale as any).derivedRefusalCode === "DERIVED_PRICING_APPROVAL_STALE", "D  a cost change → stale → REVIEW", JSON.stringify((vStale as any).derivedRefusalCode));
  d = await status();
  ok(d.status === "Price needs review", `D  …support shows "${d.status}"`);
  ok(d.audit.costChangesSinceApproval >= 1, `D  …and the durable history shows ${d.audit.costChangesSinceApproval} cost change(s) since approval`);
  ok(d.audit.active === true, "D  …while the service stays live");
  ok(d.audit.approvedTotalCents === 76000 && d.audit.currentProposedCents === 78500,
    `D  …old $${(d.audit.approvedTotalCents ?? 0) / 100} vs new $${(d.audit.currentProposedCents ?? 0) / 100}`);
  const resolverSrc = readFileSync("lib/electrical/resolveWithDerivedPricing.ts", "utf8") + readFileSync("lib/electrical/pilotDiagnostic.ts", "utf8");
  ok(!/basePrice \?\?|priceCents: .*\?\? *\d|legacyModifier/.test(resolverSrc.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "")), "D  no fallback price path exists in the derived resolver or diagnostic");

  console.log("\n  E  AUDIT LOG LINES CARRY NO SENSITIVE DATA\n");
  const lines: string[] = [];
  const orig = console.info; console.info = (m: unknown) => { lines.push(String(m)); };
  // Deliberately smuggle fields the type does not allow, as a careless caller might.
  const smuggled = { contractorId: cid, serviceId: svc.id, step: "visit", outcome: "REVIEW", code: "DERIVED_PRICING_APPROVAL_STALE",
    email: "someone@example.com", answers: PILOT_ANSWERS, sessionId: "abc" } as unknown as Parameters<typeof pilotLog>[1];
  pilotLog("homeowner_price", smuggled);
  console.info = orig;
  ok(lines.length === 1 && lines[0].startsWith("[onboarding-pilot] "), "E  one tagged line per event");
  ok(!/example\.com|sessionId|answers|surface_route_feet/.test(lines[0]), "E  extra fields (email, answers, session) are dropped by the allowlist", lines[0]);
  // The approval decision (and its events) moved out of the route into
  // lib/electrical/derivedPricingApproval.ts; the route is a thin door to it.
  ok(/decideDerivedPricingApproval\(/.test(readFileSync("app/api/admin/derived-pricing-approval/route.ts", "utf8")),
    "E  admin/derived-pricing-approval/route.ts delegates to the approval decision");
  for (const f of ["lib/electrical/derivedPricingApproval.ts", "app/api/admin/services/[serviceId]/route.ts", "app/api/visit/route.ts",
                   "app/api/admin/component-labor/route.ts", "app/api/admin/materials/route.ts", "app/api/admin/pricing-settings-fields/route.ts",
                   "app/api/admin/material-system/route.ts", "app/api/admin/policies/route.ts"]) {
    ok(/pilotLog\(/.test(readFileSync(f, "utf8")), `E  ${f.replace("app/api/", "").replace("lib/electrical/", "")} emits pilot events`);
  }

  console.log("\n  F  RESET — BOUNDED, REPEATABLE, REFUSES BOOKINGS\n");
  const dry = await resetPilotContractor(prisma, { slug: SLUG, liveEndpoint: LIVE, dryRun: true });
  ok(dry.ok && dry.dryRun && (dry.counts.services ?? 0) > 0, `F  dry run reports ${dry.ok ? dry.counts.services : "?"} services it would remove`);
  ok(await prisma.service.count({ where: { contractorId: cid } }) > 0, "F  …and removes nothing");

  const area = await prisma.serviceArea.create({ data: { contractorId: cid, name: "Rehearsal area (TEST)" }, select: { id: true } });
  const win = await prisma.arrivalWindow.create({ data: { serviceAreaId: area.id, date: new Date(), startTime: "08:00", endTime: "10:00", capacityTotal: 1 }, select: { id: true } });
  const cust = await prisma.customer.create({ data: { contractorId: cid }, select: { id: true } });
  const visit = await prisma.visit.create({ data: { contractorId: cid }, select: { id: true } });
  const booking = await prisma.booking.create({ data: { visitId: visit.id, customerId: cust.id, address: "1 Rehearsal St (TEST)", zipCode: "00000",
    arrivalWindowId: win.id, totalCents: 1, paymentModel: "REMOTE_QUOTE_NO_UPFRONT" }, select: { id: true } });
  const servicesBefore = await prisma.service.count({ where: { contractorId: cid } });
  try {
    // A THROWN reset is not a refusal. Under a mutation that removed the booking
    // check, the database's own RESTRICT key rolled the transaction back and the
    // suite CRASHED instead of failing — a weaker signal, and it left the
    // contractor and this booking behind. Caught here so it fails by name.
    let refusedByName = false; let threw = false;
    try {
      const withBooking = await resetPilotContractor(prisma, { slug: SLUG, liveEndpoint: LIVE, dryRun: false });
      refusedByName = !withBooking.ok && withBooking.refusal.code === "HAS_REAL_BOOKINGS";
    } catch { threw = true; }
    ok(refusedByName && !threw, "F  a rehearsal contractor WITH a booking is refused by name, not by a database error",
      threw ? "reset threw (the booking check did not run)" : "not refused");
    ok(await prisma.booking.count({ where: { id: booking.id } }) === 1, "F  …the booking still exists");
    ok(await prisma.service.count({ where: { contractorId: cid } }) === servicesBefore, "F  …and nothing was deleted");
  } finally {
    await prisma.booking.deleteMany({ where: { id: booking.id } });
    await prisma.visit.deleteMany({ where: { id: visit.id } });
    await prisma.customer.deleteMany({ where: { id: cust.id } });
    await prisma.arrivalWindow.deleteMany({ where: { id: win.id } });
    await prisma.serviceArea.deleteMany({ where: { id: area.id } });
  }

  const reset = await resetPilotContractor(prisma, { slug: SLUG, liveEndpoint: LIVE, dryRun: false });
  ok(reset.ok && !reset.dryRun, "F  reset succeeds for a designated rehearsal contractor");
  const after = {
    services: await prisma.service.count({ where: { contractorId: cid } }),
    materials: await prisma.contractorMaterial.count({ where: { contractorId: cid } }),
    labor: await prisma.contractorComponent.count({ where: { contractorId: cid } }),
    systems: await prisma.contractorMaterialSystem.count({ where: { contractorId: cid } }),
    policies: await prisma.contractorPolicyValue.count({ where: { contractorId: cid } }),
    settings: await prisma.pricingSettings.count({ where: { contractorId: cid } }),
    approvals: await prisma.contractorDerivedPricingApproval.count({ where: { contractorId: cid } }),
    categories: await prisma.contractorCategory.count({ where: { contractorId: cid } }),
  };
  ok(Object.values(after).every((n) => n === 0), "F  …every onboarding-owned row is gone", JSON.stringify(after));
  ok(await prisma.contractor.count({ where: { id: cid } }) === 1 && await prisma.contractorSite.count({ where: { contractorId: cid } }) === 1
     && await prisma.contractorTrade.count({ where: { contractorId: cid } }) === 1, "F  …contractor, storefront and trade enrolment kept");
  d = await status();
  ok(d.status === "Catalog not installed", `F  support status back to "${d.status}"`);
  const again = await preflight(prisma, cid, templateVersionSource(prisma, "electrical"));
  ok(again.ok, "F  the real installer accepts it again — onboarding is repeatable", again.ok ? "" : again.message);
  if (again.ok) {
    await installCatalog(prisma, cid, again.catalog);
    d = await status();
    ok(d.status === "Materials incomplete", `F  …and a second walk starts at "${d.status}"`);
  }

  await removeRehearsalContractor();
  ok(await prisma.contractor.count({ where: { slug: SLUG } }) === 0, "F  rehearsal contractor removed at the end");

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await removeRehearsalContractor().catch((t) => console.error("CLEANUP FAILED:", t)); await prisma.$disconnect(); process.exit(1); });
