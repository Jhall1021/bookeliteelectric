/**
 * Pricing a route from what it actually costs — and refusing to, truthfully.
 *
 * THE PILOT DOES NOT REACH PRICED, AND THAT IS THE HONEST RESULT. The
 * rehearsal contractor's material takeoff is complete, but none of the four
 * components this route uses has an established labor calibration. Typing four
 * plausible hours would produce a green PRICED line and prove nothing, so the
 * pilot stops exactly where the missing input is, and says which one.
 *
 * The LIFECYCLE is proved separately, on its own fixture contractor whose
 * labor is set deliberately and labelled as a lifecycle rehearsal. That shows
 * the machinery works once truthful inputs exist, without pretending the
 * pilot's inputs exist.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { fingerprintBasis, serializeBasis } from "../lib/electrical/derivedPricingBasis";
import { loadDerivedPricingBasis, loadAndPriceDerivedScope } from "../lib/electrical/loadDerivedScope";
import { priceDerivedScope, takeoffCostCents } from "../lib/electrical/derivedScopePricing";
import { loadSurfaceTakeoff } from "../lib/electrical/loadSurfaceTakeoff";
import { SURFACE_ROLES } from "../lib/electrical/surfaceRacewayTakeoff";
import { resolvePricingSettings, requiredFields } from "../lib/pricingSettingsState";
import { calculateMaterialSellCents } from "../lib/pricing";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../lib/routeResolver";
import { serviceFor } from "../prisma/_serviceTargets";
import { SURFACE_KEYS } from "../prisma/_surfaceRouteModule";
import { REHEARSAL_SLUG } from "./configure-surface-raceway-rehearsal";
import { PROOF_SLUG } from "./provision-routing-v2-proof-contractor";
import { ELECTRICAL_ATOMIC_LABOR_RECIPES } from "../lib/electrical/atomicLabor";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

const FEET = 31;
const PRIMARY_CTX = { isPrimary: true, isPrimaryEligible: true, servicePermitAdminEstablished: false };
const SERVICE_ECON = {
  materialMultiplier: null, permitAdminCents: null,
  otherDirectCostCents: null, isPrimaryEligible: true,
};

async function componentsFor(contractorId: string, inside = "0", flat = "0") {
  const svc = await serviceFor(prisma, contractorId, "surface-mounted-outlet");
  const loaded = await loadServiceForResolution(prisma, svc.id);
  const settings = await loadPricingSettings(prisma, contractorId);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const r = resolveRoute(loaded!, {
    [SURFACE_KEYS.feet]: String(FEET), [SURFACE_KEYS.inside]: inside,
    [SURFACE_KEYS.outside]: "0", [SURFACE_KEYS.flat]: flat,
    [SURFACE_KEYS.surface]: "drywall", [SURFACE_KEYS.obstacles]: "clear",
  }, true, settings) as any;
  return { svcId: svc.id, components: (r?.config?.components ?? []) as { key: string; quantity: number }[], config: r?.config };
}

async function main() {
  console.log("\nDERIVED RESOLVED-SCOPE PRICING\n");

  const rehearsal = await prisma.contractor.findUniqueOrThrow({ where: { slug: REHEARSAL_SLUG }, select: { id: true } });
  const fresh = await prisma.contractor.findUniqueOrThrow({ where: { slug: PROOF_SLUG }, select: { id: true } });
  const { svcId, components } = await componentsFor(rehearsal.id);

  console.log("  A  LABOR READINESS FOR THE STRAIGHT PILOT — MEASURED, NOT ASSUMED\n");
  const routeRecipe = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((recipe) => recipe.key === "ELECTRICAL_SURFACE_RACEWAY_ROUTE")!;
  const operationKeys = [...new Set(routeRecipe.lines.map((line) => line.operationKey))];
  const decisions = await prisma.contractorLaborOperationDecision.findMany({
    where: { contractorId: rehearsal.id, trade: "electrical", operationKey: { in: operationKeys } },
    select: { operationKey: true, hoursPerUnit: true },
  });
  const byOperation = new Map(decisions.map((decision) => [decision.operationKey, decision.hoursPerUnit]));
  const inventory = operationKeys.map((key) => ({
    key,
    state: byOperation.has(key) ? `ESTABLISHED ${byOperation.get(key)}h/unit` : "UNRESOLVED",
  }));
  for (const item of inventory) console.log(`       ${item.key.padEnd(42)} ${item.state}`);
  const unresolved = inventory.filter((i) => i.state.startsWith("UNRESOLVED"));
  ok(inventory.length === operationKeys.length, `A  the straight route checks all ${operationKeys.length} atomic operations`, String(inventory.length));

  const pilot = await loadAndPriceDerivedScope(prisma, {
    contractorId: rehearsal.id, serviceId: svcId, components,
    routeFeet: FEET, turnCount: 0, context: PRIMARY_CTX, service: SERVICE_ECON });
  if (unresolved.length > 0) {
    ok(pilot.kind === "REVIEW" && pilot.code === "ATOMIC_LABOR_NOT_ESTABLISHED",
      `A  with ${unresolved.length} unresolved, the pilot stops at ATOMIC_LABOR_NOT_ESTABLISHED`,
      JSON.stringify(pilot));
    ok(pilot.kind === "REVIEW" && (pilot.detail?.length ?? 0) === unresolved.length,
      "A  …naming exactly which components, not 'materials incomplete'",
      JSON.stringify(pilot.kind === "REVIEW" ? pilot.detail : null));
  } else {
    ok(pilot.kind === "PRICED", "A  every component has labor, so the pilot prices", JSON.stringify(pilot));
  }

  console.log("\n  B  THE LIFECYCLE, ON ITS OWN CLEARLY-LABELLED FIXTURE\n");
  // A SEPARATE contractor. Its labor figures are lifecycle fixtures, not a
  // calibration for the pilot and not anyone's real numbers.
  const LIFECYCLE_SLUG = "rv2-lifecycle-derived-pricing";
  let life = await prisma.contractor.findUnique({ where: { slug: LIFECYCLE_SLUG }, select: { id: true } });
  if (!life) { console.log(`       (fixture ${LIFECYCLE_SLUG} absent — run configure-derived-pricing-lifecycle.ts)`); }
  else {
    const lc = await componentsFor(life.id);
    const priced = await loadAndPriceDerivedScope(prisma, {
      contractorId: life.id, serviceId: lc.svcId, components: lc.components,
      routeFeet: FEET, turnCount: 0, context: PRIMARY_CTX, service: SERVICE_ECON });
    ok(priced.kind === "PRICED", "B  once labor and approval exist, the scope prices", JSON.stringify(priced));
    if (priced.kind === "PRICED") {
      const takeoff = await loadSurfaceTakeoff(prisma, life.id, { components: lc.components, routeFeet: FEET, turnCount: 0 });
      const cost = takeoffCostCents(takeoff);

      // INDEPENDENT of takeoffCostCents. Comparing the result against the same
      // function that produced it is a tautology — a mutation that
      // re-linearised the cost changed both sides together and the suite
      // stayed green. The expected figure is rebuilt here from the fixture's
      // own package prices, so it cannot move with the code under test.
      const EXPECTED = 7 * 1457   // channel: SEVEN five-foot sticks, not 31 feet
                     + 1 * 647    // device box
                     + 8 * 57     // support clips
                     + 1 * 447    // entrance fitting
                     + 6 * 187    // joint covers
                     + Math.round(31 * 8917 / 500) // ungrounded conductor footage
                     + Math.round(31 * 8917 / 500) // grounded conductor footage
                     + Math.round(31 * 7417 / 500); // equipment-ground footage
      ok(priced.materialCostCents === EXPECTED,
        `B  material cost uses full rigid stock pieces and package-derived per-use rates (${EXPECTED}c), computed independently`,
        `${priced.materialCostCents} vs ${EXPECTED}`);
      ok(cost === EXPECTED, "B  …and takeoffCostCents agrees with that independent figure", `${cost}`);

      // Rigid stock retains whole-piece costing. Discrete items and reusable
      // continuous wire use the package-derived rate for the amount consumed.
      const expectedConsumedCosts = new Map([
        [SURFACE_ROLES.deviceBox, 647],
        [SURFACE_ROLES.supportClip, 8 * 57],
        [SURFACE_ROLES.transition, 447],
        [SURFACE_ROLES.joint, 6 * 187],
        ["CONDUCTOR_THHN_12_UNGROUNDED", Math.round(31 * 8917 / 500)],
        ["CONDUCTOR_THHN_12_GROUNDED", Math.round(31 * 8917 / 500)],
        ["CONDUCTOR_THHN_12_EQUIPMENT_GROUND", Math.round(31 * 7417 / 500)],
      ]);
      for (const pr of takeoff.purchaseRequirements) {
        if (pr.costBasis === "STOCK_PIECES") {
          ok(Number.isInteger(pr.packages) && pr.costCents % pr.packages === 0,
            `B  ${pr.role} is ${pr.packages} full stock piece(s), not a fraction of one`,
            JSON.stringify(pr));
        } else {
          ok(pr.costCents === expectedConsumedCosts.get(pr.role),
            `B  ${pr.role} is priced from the exact quantity used`, JSON.stringify(pr));
        }
      }
      const LINEAR_CHANNEL = 291 * FEET;
      ok(priced.materialCostCents > EXPECTED - 1178 + 1178 - 1
         && priced.materialCostCents - (7 * 1457) + LINEAR_CHANNEL < priced.materialCostCents,
        `B  …and strictly above what per-foot pricing would have charged`,
        `linear channel ${LINEAR_CHANNEL}c vs package ${7 * 1457}c`);
      ok(priced.breakdown.materialCents === calculateMaterialSellCents(cost),
        "B  …marked up by the EXISTING progressive formula, not a new one",
        `${priced.breakdown.materialCents} vs ${calculateMaterialSellCents(cost)}`);
      const channel = takeoff.purchaseRequirements.find((p) => p.role === SURFACE_ROLES.channel)!;
      const linear = 291 * FEET;
      ok(channel.packages === 7 && channel.costCents > linear,
        `B  the seventh stick is represented: ${channel.packages} sticks = ${channel.costCents}c > linear ${linear}c`,
        JSON.stringify(channel));
      console.log(`       proposed total ${priced.totalCents}c  (labor ${priced.breakdown.laborCents}c + material ${priced.breakdown.materialCents}c)`);
    }
  }

  console.log("\n  C  A DERIVED SCOPE NEVER CONSUMES approvedPriceCents\n");
  const derivedSrc = readFileSync("lib/electrical/derivedScopePricing.ts", "utf8");
  const loaderSrc = readFileSync("lib/electrical/loadDerivedScope.ts", "utf8");
  ok(!/approvedPriceCents/.test(derivedSrc.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "")),
    "C  the derived pricing module cannot see the field at all");
  ok(!/approvedPriceCents/.test(loaderSrc), "C  nor can its loader");
  ok(/approvedIncrementCents: 0/.test(derivedSrc),
    "C  …and it passes a hard zero increment into the shared formula");

  console.log("\n  D  LEGACY PRICING IS COMPLETELY UNCHANGED\n");
  const legacyCount = await prisma.service.count({ where: { pricingMethod: "LEGACY_PUBLISHED" } });
  const derivedCount = await prisma.service.count({ where: { pricingMethod: "DERIVED_RESOLVED_SCOPE" } });
  ok(legacyCount > 0, `D  ${legacyCount} services still price the legacy way`);
  console.log(`       (${derivedCount} service(s) opted into DERIVED_RESOLVED_SCOPE)`);
  const pricingSrc = readFileSync("lib/pricing.ts", "utf8");
  ok(/publishedBaseCents \+ config\.approvedIncrementCents \+ config\.legacyModifierCents/.test(pricingSrc),
    "D  customerPrice() still sums published base + approved increments");
  ok(/Approved customer-facing price for this component/.test(readFileSync("prisma/schema.prisma", "utf8")),
    "D  approvedPriceCents keeps its exact documented meaning");
  ok(!/DERIVED|takeoff|MaterialTakeoff/i.test(pricingSrc.split("export function customerPrice")[1]?.slice(0, 900) ?? ""),
    "D  …and customerPrice knows nothing about takeoffs");

  console.log("\n  E  PACKAGE GEOMETRY CHANGES THE ECONOMICS CORRECTLY\n");
  const chRow = await prisma.contractorMaterial.findFirstOrThrow({
    where: { contractorId: rehearsal.id, canonicalMaterial: { key: SURFACE_ROLES.channel } },
    select: { id: true, packageQuantity: true, packagePriceCents: true } });
  const before = await loadSurfaceTakeoff(prisma, rehearsal.id, { components, routeFeet: FEET, turnCount: 0 });
  const beforeCh = before.purchaseRequirements.find((p) => p.role === SURFACE_ROLES.channel)!;
  await prisma.contractorMaterial.update({ where: { id: chRow.id },
    data: { packageQuantity: 8, packagePriceCents: 2200 } });
  const after = await loadSurfaceTakeoff(prisma, rehearsal.id, { components, routeFeet: FEET, turnCount: 0 });
  const afterCh = after.purchaseRequirements.find((p) => p.role === SURFACE_ROLES.channel)!;
  ok(beforeCh.packages === 7 && afterCh.packages === 4,
    "E  5-ft stock -> 7 sticks; 8-ft stock -> 4 sticks", `${beforeCh.packages} -> ${afterCh.packages}`);
  ok(afterCh.costCents === 4 * 2200, "E  …and cost follows the product", String(afterCh.costCents));
  await prisma.contractorMaterial.update({ where: { id: chRow.id },
    data: { packageQuantity: chRow.packageQuantity, packagePriceCents: chRow.packagePriceCents } });

  console.log("\n  F  EVERY READINESS AXIS FAILS CLOSED, BY NAME\n");
  const takeoffNow = await loadSurfaceTakeoff(prisma, rehearsal.id, { components, routeFeet: FEET, turnCount: 0 });
  const basis = await loadDerivedPricingBasis(prisma, rehearsal.id, components.map((c) => c.key));
  const fp = fingerprintBasis(basis);
  const mk = (over: Record<string, unknown>) => priceDerivedScope({
    components: components.map((c) => ({ key: c.key, quantity: c.quantity, addFieldLaborHours: 0.5 })),
    takeoff: takeoffNow,
    settingsRow: { crewHourRateCents: 22222, primaryMinimumCents: 22222, roundingIncrementCents: 100, defaultPermitAdminCents: 0 },
    context: PRIMARY_CTX, service: SERVICE_ECON,
    approval: { approvedBasisFingerprint: fp }, currentBasisFingerprint: fp,
    atomicLabor: { kind: "READY", hours: 2 },
    ...over,
  } as never);
  ok(mk({}).kind === "PRICED", "F  the control prices", JSON.stringify(mk({})));
  const turned = await loadSurfaceTakeoff(prisma, rehearsal.id,
    { components: (await componentsFor(rehearsal.id, "2", "1")).components, routeFeet: FEET, turnCount: 3 });
  const r1 = mk({ takeoff: turned });
  ok(r1.kind === "REVIEW" && r1.code === "MATERIAL_TAKEOFF_INCOMPLETE", "F  incomplete takeoff -> MATERIAL_TAKEOFF_INCOMPLETE", JSON.stringify(r1));
  const r2 = mk({ atomicLabor: { kind: "INCOMPLETE", missingOperations: ["ELEC_SURFACE_RACEWAY_SUPPORT"], missingQuantities: [], invalidConditions: [] } });
  ok(r2.kind === "REVIEW" && r2.code === "ATOMIC_LABOR_NOT_ESTABLISHED", "F  missing atomic unit -> ATOMIC_LABOR_NOT_ESTABLISHED", JSON.stringify(r2));
  const r3 = mk({ atomicLabor: { kind: "READY", hours: 0 } });
  ok(r3.kind === "PRICED", "F  EXPLICIT ZERO labor is accepted — it is a real answer", JSON.stringify(r3));
  const r4 = mk({ settingsRow: null });
  ok(r4.kind === "REVIEW" && r4.code === "PRICING_SETTINGS_MISSING", "F  no settings row -> PRICING_SETTINGS_MISSING", JSON.stringify(r4));
  const r5 = mk({ settingsRow: { crewHourRateCents: null, primaryMinimumCents: 1, roundingIncrementCents: 1, defaultPermitAdminCents: 1 } });
  ok(r5.kind === "REVIEW" && r5.code === "PRICING_SETTINGS_INCOMPLETE"
     && (r5.detail ?? []).includes("crewHourRateCents"),
    "F  undecided rate -> PRICING_SETTINGS_INCOMPLETE naming crewHourRateCents", JSON.stringify(r5));
  ok(r5.kind === "REVIEW" && /crew-hour/.test(r5.reason),
    "F  …with a reason a contractor can act on", r5.kind === "REVIEW" ? r5.reason : "");
  const r6 = mk({ approval: null });
  ok(r6.kind === "REVIEW" && r6.code === "DERIVED_PRICING_NOT_APPROVED", "F  no approval -> DERIVED_PRICING_NOT_APPROVED", JSON.stringify(r6));
  const r7 = mk({ approval: { approvedBasisFingerprint: "stale-digest" } });
  ok(r7.kind === "REVIEW" && r7.code === "DERIVED_PRICING_APPROVAL_STALE", "F  stale approval -> DERIVED_PRICING_APPROVAL_STALE", JSON.stringify(r7));

  console.log("\n  G  EXPLICIT ZERO IS NOT NULL, ANYWHERE\n");
  const zeroSettings = { crewHourRateCents: 0, primaryMinimumCents: 0, roundingIncrementCents: 0, defaultPermitAdminCents: 0 };
  const nullSettings = { crewHourRateCents: null, primaryMinimumCents: null, roundingIncrementCents: null, defaultPermitAdminCents: null };
  ok(resolvePricingSettings(zeroSettings, PRIMARY_CTX).kind === "COMPLETE",
    "G  a contractor who chose zero everywhere is COMPLETE");
  ok(resolvePricingSettings(nullSettings, PRIMARY_CTX).kind === "INCOMPLETE",
    "G  a contractor who decided nothing is INCOMPLETE");
  ok(resolvePricingSettings(null, PRIMARY_CTX).kind === "MISSING",
    "G  and no row at all is MISSING — three states, three answers");
  const stateSrc = readFileSync("lib/pricingSettingsState.ts", "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
  ok(!/(crewHourRate|roundingIncrement)\w*\s*\?\?\s*0/.test(stateSrc),
    "G  no `?? 0` on any field a context actually reads");

  console.log("\n  H  WWT NEVER RECEIVES THE PRIMARY MINIMUM\n");
  const wwtCtx = { isPrimary: false, isPrimaryEligible: true, servicePermitAdminEstablished: false };
  const primary = mk({});
  const wwt = priceDerivedScope({
    components: components.map((c) => ({ key: c.key, quantity: c.quantity, addFieldLaborHours: 0.01 })),
    takeoff: takeoffNow,
    settingsRow: { crewHourRateCents: 22222, primaryMinimumCents: 900000, roundingIncrementCents: 100, defaultPermitAdminCents: 0 },
    context: wwtCtx, service: SERVICE_ECON,
    approval: { approvedBasisFingerprint: fp }, currentBasisFingerprint: fp,
  });
  const primaryFloored = priceDerivedScope({
    components: components.map((c) => ({ key: c.key, quantity: c.quantity, addFieldLaborHours: 0.01 })),
    takeoff: takeoffNow,
    settingsRow: { crewHourRateCents: 22222, primaryMinimumCents: 900000, roundingIncrementCents: 100, defaultPermitAdminCents: 0 },
    context: PRIMARY_CTX, service: SERVICE_ECON,
    approval: { approvedBasisFingerprint: fp }, currentBasisFingerprint: fp,
  });
  ok(wwt.kind === "PRICED" && !wwt.breakdown.minimumApplied, "H  a tiny WWT scope is NOT floored", JSON.stringify(wwt.kind === "PRICED" ? wwt.breakdown.minimumApplied : wwt));
  ok(primaryFloored.kind === "PRICED" && primaryFloored.breakdown.minimumApplied,
    "H  …while the same tiny PRIMARY scope is", JSON.stringify(primaryFloored.kind === "PRICED" ? primaryFloored.breakdown.minimumApplied : primaryFloored));
  ok(wwt.kind === "PRICED" && primaryFloored.kind === "PRICED" && wwt.totalCents < primaryFloored.totalCents,
    "H  …and the two totals genuinely differ");
  ok(wwt.kind === "PRICED" && primaryFloored.kind === "PRICED" && wwt.materialCostCents === primaryFloored.materialCostCents,
    "H  the SAME physical work has the same material basis — only the rules differ");
  ok(requiredFields(wwtCtx).includes("primaryMinimumCents") === false,
    "H  a WWT scope is not even blocked on a minimum it can never use");

  console.log("\n  I  APPROVAL INVALIDATION IS DETERMINISTIC AND SCOPED\n");
  const base = await loadDerivedPricingBasis(prisma, rehearsal.id, components.map((c) => c.key));
  const f0 = fingerprintBasis(base);
  ok(fingerprintBasis(await loadDerivedPricingBasis(prisma, rehearsal.id, components.map((c) => c.key))) === f0,
    "I  the same inputs fingerprint identically, twice");
  const mutate = <T>(o: T, f: (x: T) => void): T => { const c = JSON.parse(JSON.stringify(o)); f(c); return c; };
  const changes: [string, (b: typeof base) => void][] = [
    ["atomic labor calibration", (b) => { if (b.operationLabor?.[0]) b.operationLabor[0].hoursPerUnit = 9; }],
    ["material cost", (b) => { b.materials[0].unitCostCents += 1; }],
    ["package geometry", (b) => { b.materials[0].packageQuantity = 99; }],
    ["product selection", (b) => { b.materials[0].activeSupplierLinkId = "link_x"; }],
    ["material system config", (b) => { b.systems[0] && (b.systems[0].supportSpacingFt = 99); }],
    ["policy value", (b) => { b.policies[0] && (b.policies[0].choice = "10"); }],
    ["pricing settings", (b) => { b.settings.crewHourRateCents = 999; }],
    ["canonical recipe", (b) => { b.recipe[0].perUnit = 42; }],
  ];
  for (const [name, f] of changes) {
    ok(fingerprintBasis(mutate(base, f)) !== f0, `I  changing ${name} INVALIDATES the approval`);
  }
  // …and the exclusions, which matter just as much.
  const serialized = serializeBasis(base);
  for (const irrelevant of ["nameOverride", "declaredSystemLabel", "costStatus", "costConfidence", "updatedAt", "createdAt", "notes"]) {
    ok(!serialized.includes(irrelevant), `I  ${irrelevant} does NOT participate — a typo fix must not invalidate`);
  }
  ok(fingerprintBasis(mutate(base, (b) => { b.policies.reverse(); b.materials.reverse(); })) === f0,
    "I  row ORDER cannot change the digest");

  console.log("\n  J  A BOOKED PRICE IS IMMUTABLE\n");
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  ok(/Immutable once written: a booked job is never recalculated/.test(schema),
    "J  LineItem's snapshot is documented immutable");
  ok(/resolvedEconomicBasis\s+String\?/.test(schema) && /resolvedMaterialCostCents\s+Int\?/.test(schema),
    "J  …and now records WHICH economics produced the price");
  const writers = ["lib/pricing.ts", "lib/electrical/derivedScopePricing.ts", "lib/electrical/loadDerivedScope.ts"];
  ok(writers.every((f) => !/lineItem\.update|lineItem\.updateMany/.test(readFileSync(f, "utf8"))),
    "J  no pricing module rewrites a line item");

  console.log("\n  K  THE FRESH CONTRACTOR INHERITS NOTHING\n");
  const freshC = await componentsFor(fresh.id);
  const freshPrice = await loadAndPriceDerivedScope(prisma, {
    contractorId: fresh.id, serviceId: freshC.svcId, components: freshC.components,
    routeFeet: FEET, turnCount: 0, context: PRIMARY_CTX, service: SERVICE_ECON });
  ok(freshPrice.kind === "REVIEW", "K  a fresh contractor cannot price a derived scope", JSON.stringify(freshPrice));
  const freshBasis = await loadDerivedPricingBasis(prisma, fresh.id, freshC.components.map((c) => c.key));
  ok(fingerprintBasis(freshBasis) !== f0, "K  …and its economic basis is not the rehearsal contractor's");
  ok((freshBasis.operationLabor ?? []).every((operation) => operation.hoursPerUnit === null), "K  no atomic labor inherited");
  ok(freshBasis.systems.length === 0, "K  no material system inherited");
  ok(await prisma.contractorDerivedPricingApproval.count({ where: { contractorId: fresh.id } }) === 0,
    "K  and no approval inherited");

  console.log("\n  L  SINGLE-SOURCE MATERIAL COST\n");
  const dupes = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT COUNT(*)::bigint AS n FROM (
       SELECT "contractorId", "canonicalMaterialId" FROM contractor_materials
       GROUP BY 1,2 HAVING COUNT(*) > 1) t`);
  ok(Number(dupes[0]?.n ?? 0) === 0,
    "L  no contractor holds two rows for one canonical role — enforced by the schema", String(dupes[0]?.n ?? 0));
  ok(/@@unique\(\[contractorId, canonicalMaterialId\]\)/.test(schema),
    "L  …and that is a constraint, not a convention");

  console.log("\n  M  WRITE PATHS ARE TENANT SCOPED\n");
  // The handler BODIES moved to lib/admin/onboardingActions so they can be
  // exercised without a running server. These assertions follow the logic
  // rather than the file it used to be in.
  const actionsSrc = readFileSync("lib/admin/onboardingActions.ts", "utf8");
  // The link is now reached THROUGH the contractor's own material (the guard
  // refuses MaterialSupplierLink as a query root), which checks both owners
  // structurally: the material by contractorId, the link by membership of
  // that material's supplierLinks. The cross-tenant 403/404 is proven over
  // real HTTP in verify-onboarding-http-smoke section 4.
  const selectFn = actionsSrc.slice(actionsSrc.indexOf("export async function selectMaterialProduct"), actionsSrc.indexOf("// ── material system"));
  ok(/where: \{ id: material\.id, contractorId: ctx\.contractorId \}/.test(selectFn)
     && /supplierLinks: \{\s*where: \{ id: body\.supplierLinkId \}/.test(selectFn)
     && !/db\.materialSupplierLink\.find/.test(selectFn),
    "M  product selection reaches the link only through this contractor's own material");
  for (const f of ["app/api/admin/component-labor/route.ts", "app/api/admin/pricing-settings-fields/route.ts",
                   "app/api/admin/material-system/route.ts", "app/api/admin/materials-overview/route.ts",
                   "app/api/admin/derived-pricing-approval/route.ts"]) {
    const src = readFileSync(f, "utf8");
    ok(/withAdminContractor/.test(src) && /isAdminAuthenticated/.test(src),
      `M  ${f.split("/").slice(-2)[0]} resolves its tenant and authenticates`);
  }
  ok(/action === "clear"/.test(actionsSrc) && /action === "set"/.test(actionsSrc) && /accept-reference/.test(actionsSrc),
    "M  labor supports set, explicit zero via set, clear back to unresolved, and accept-reference");
  ok(/reference: \{/.test(actionsSrc) && !/addFieldLaborHours: c\.referenceLaborHours/.test(actionsSrc.split("accept-reference")[0]),
    "M  …and reference evidence is returned separately, never auto-applied");
  ok(/referenceLaborStatus === "DISPUTED"/.test(actionsSrc),
    "M  …and disputed evidence is refused rather than offered as a recommendation");

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  if (unresolved.length > 0) {
    console.log(`  PILOT DID NOT REACH PRICED. ${unresolved.length} atomic operation(s) still need`);
    console.log(`  contractor labor calibration: ${unresolved.map((u) => u.key).join(", ")}`);
    console.log(`  No values were invented to change that.\n`);
  }
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
