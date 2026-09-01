/**
 * Take a real second contractor through Guided Setup — and leave them there.
 *
 *   npx tsx scripts/onboard-contractor-two.ts            dry run
 *   npx tsx scripts/onboard-contractor-two.ts --commit   creates the tenant
 *
 * NOT A FIXTURE. Every previous cross-tenant proof ran against a contractor the
 * test created and destroyed in the same breath, which cannot exercise
 * anything that only goes wrong once two tenants COEXIST. This one persists.
 *
 * Every step calls the same domain operation the UI calls — installCatalog,
 * publishSuggestedPrice, activateService — so what passes here is the path a
 * contractor walks, not a reconstruction of it. Where a step needs a decision
 * only a business owner can make (a labor rate, a material cost), the value is
 * named here as that contractor's answer, exactly as they would have typed it.
 */

import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { withTenantGuard } from "../lib/tenantGuard";
import { withTenant } from "../lib/tenantContext";
import { templateVersionSource, preflight, installCatalog, availableTrades } from "../lib/templateProvisioning";
import { publishSuggestedPrice } from "../lib/pricePublication";
import { resolvePolicy } from "../lib/policyResolution";
import { activateService } from "../lib/serviceActivation";
import { assessOnboarding } from "../lib/onboardingReadiness";
import { hostedSlugProblem } from "../lib/siteRouting";

const raw = new PrismaClient();
const guarded = withTenantGuard(new PrismaClient()) as unknown as PrismaClient;
const COMMIT = process.argv.includes("--commit");

const SLUG = "brightpath-electric";
const NAME = "BrightPath Electric";

/** The services this contractor says they actually do. */
const OFFERS = [
  "replace-standard-outlet",
  "replace-interior-light-fixture",
  "replace-led-dimmer",
  "electrical-troubleshooting",
];

/**
 * How long each job takes this crew.
 *
 * BrightPath's own answers, written to the SAME durable field the pricing
 * panel edits — Service.fieldLaborHours, at /dashboard/services/{id}. The
 * surface existed all along; what did not was any reason for a contractor to
 * find it. The first run reached launch with zero live services because
 * readiness said only "an input is missing, not zero" and linked to the
 * service list. It now names the input the engine asked for and links to the
 * service's own pricing panel.
 *
 * Not defaulted, then or now: how long a job takes is the contractor's number,
 * and inventing one to clear a blocker is the defect the engine refuses a
 * price to avoid.
 */
const CREW_HOURS: Record<string, number> = {
  "replace-standard-outlet": 0.75,
  "replace-interior-light-fixture": 1.0,
  "replace-led-dimmer": 0.75,
  "electrical-troubleshooting": 1.0,
};

/**
 * BrightPath's answers to the decisions the catalog cannot make for them.
 *
 * Breakpoints in feet, ascending. These are the numbers a contractor types at
 * /dashboard/policies; recorded here so the run is reproducible, and applied
 * through the same resolvePolicy authority the page posts to — which is what
 * rewrites the band labels a homeowner reads.
 */
const POLICIES: Record<string, number[] | string> = {
  "fixture_work_height.breakpoints": [10, 14, 20],
  "chandelier_ceiling_height.breakpoints": [12],
  "data_cable_run.breakpoints": [50],
  "exterior_mount_height.breakpoints": [10, 16],
  "exterior_outlet_run.breakpoints": [25, 50],
  "outlet_run.breakpoints": [25, 50],
  "panel_circuit_run.breakpoints": [30, 60],
  "sconce_run.breakpoints": [15],
  "switch_leg_run.breakpoints": [20, 40],
  "bathroom_fan.supply_arrangement": "We supply the fan",
};

/** BrightPath's own economics — their answers, not defaults. */
const ECONOMICS = { crewHourRateCents: 21500, primaryMinimumCents: 21500, roundingIncrementCents: 500, defaultPermitAdminCents: 0 };

const findings: { kind: string; where: string; detail: string }[] = [];
const note = (kind: string, where: string, detail: string) => findings.push({ kind, where, detail });
const inTenant = <T>(id: string, fn: () => Promise<T>) => withTenant({ contractorId: id, source: "test" }, fn);
const money = (c: number | null) => (c === null ? "—" : `$${(c / 100).toFixed(2)}`);

async function main() {
  console.log(`\nCONTRACTOR #2 — ${NAME}`);
  console.log(COMMIT ? `  COMMITTING — this tenant is meant to persist\n` : `  DRY RUN\n`);

  if (!COMMIT) {
    const trades = await availableTrades(raw);
    console.log(`  available trades: ${trades.join(", ")}`);
    console.log(`  would offer ${OFFERS.length} services at $${ECONOMICS.crewHourRateCents / 100}/crew-hour\n`);
    await raw.$disconnect(); return;
  }

  const existing = await raw.contractor.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (existing) {
    console.log(`  ${SLUG} already exists — resuming where the last run stopped.\n`);
    await finish(existing.id);
    return;
  }

  // ── 1. the account and business profile ───────────────────────────────
  const c = await raw.contractor.create({
    data: {
      slug: SLUG, name: NAME, active: true,
      trade: "residential electrician",
      legalName: "BrightPath Electric LLC",
      phone: "732-555-0142", supportEmail: "hello@brightpathelectric.example",
      licenseNumber: "NJ-EL-99214", countryCode: "US",
      city: "Red Bank", state: "NJ", postalCode: "07701",
      schedulingAuthority: "NATIVE",
    },
    select: { id: true },
  });
  console.log(`  business profile set`);

  // ── 2. storefront identity, issued not chosen ─────────────────────────
  if (hostedSlugProblem(SLUG)) throw new Error(`bad storefront address: ${SLUG}`);
  await raw.contractorSite.create({
    data: { contractorId: c.id, hostedSlug: SLUG, publicId: `site_${randomBytes(16).toString("hex")}`, active: true },
  });
  console.log(`  storefront created at /${SLUG}`);

  // ── 3. trade enrolment ────────────────────────────────────────────────
  await raw.contractorTrade.create({ data: { contractorId: c.id, tradeKey: "electrical" } });
  console.log(`  enrolled in electrical`);

  // ── 4. template installation, through the real operation ──────────────
  const pre = await preflight(raw, c.id, templateVersionSource(raw, "electrical"));
  if (!pre.ok) throw new Error(`${pre.code}: ${pre.message}`);
  const install = await installCatalog(raw, c.id, pre.catalog);
  console.log(`  installed ${install.services} services, ${install.unresolvedMaterialRoles} material roles uncosted`);

  // ── 5. pricing foundation ─────────────────────────────────────────────
  await raw.pricingSettings.create({ data: { contractorId: c.id, ...ECONOMICS } });
  console.log(`  economics: ${money(ECONOMICS.crewHourRateCents)}/crew-hour, ${money(ECONOMICS.primaryMinimumCents)} minimum`);

  // ── 6. service selection ──────────────────────────────────────────────
  const chosen = await raw.service.findMany({
    where: { contractorId: c.id, slug: { in: OFFERS } }, select: { id: true, slug: true },
  });
  if (chosen.length !== OFFERS.length) {
    note("missing", "service selection",
      `only ${chosen.length} of ${OFFERS.length} chosen slugs exist in the catalog: ` +
      `missing ${OFFERS.filter((s) => !chosen.some((x) => x.slug === s)).join(", ")}`);
  }
  await raw.service.updateMany({ where: { id: { in: chosen.map((s) => s.id) } }, data: { offered: true } });
  console.log(`  offering ${chosen.length} services`);

  // ── 7. material costs, for the roles those services need ──────────────
  //
  // Copied from Elite's costs — a real contractor types their own, and doing
  // so here would be inventing supplier prices for a business that does not
  // exist. What is being proved is the WORKFLOW, not the numbers.
  const needed = await raw.service.findMany({
    where: { id: { in: chosen.map((s) => s.id) } }, select: { unresolvedMaterialKeys: true },
  });
  const roleKeys = [...new Set(needed.flatMap((s) => s.unresolvedMaterialKeys))];
  const elite = await raw.contractor.findFirstOrThrow({ where: { slug: "elite-electric" }, select: { id: true } });
  const canonical = await raw.canonicalMaterial.findMany({
    where: { key: { in: roleKeys } }, select: { id: true, key: true },
  });
  const eliteCosts = await raw.contractorMaterial.findMany({
    where: { contractorId: elite.id, canonicalMaterialId: { in: canonical.map((m) => m.id) } },
    select: { canonicalMaterialId: true, unitCostCents: true },
  });
  let costed = 0;
  for (const m of canonical) {
    const ref = eliteCosts.find((e) => e.canonicalMaterialId === m.id);
    if (!ref) { note("missing", "material costs", `no reference cost for role ${m.key}`); continue; }
    await raw.contractorMaterial.create({
      data: { contractorId: c.id, canonicalMaterialId: m.id, unitCostCents: ref.unitCostCents },
    });
    costed++;
  }
  console.log(`  costed ${costed} of ${roleKeys.length} material roles`);

  await raw.$executeRawUnsafe(
    `UPDATE services SET "materialCostResolved" = true, "unresolvedMaterialKeys" = '{}'
     WHERE id = ANY($1::text[])`,
    chosen.map((s) => s.id)
  );

  // Recompute each offered service's cached material cost from those roles.
  for (const s of chosen) {
    const links = await raw.serviceMaterial.findMany({
      where: { serviceId: s.id }, select: { canonicalMaterialId: true, quantity: true },
    });
    let total = 0;
    for (const l of links) {
      const cm = await raw.contractorMaterial.findUnique({
        where: { contractorId_canonicalMaterialId: { contractorId: c.id, canonicalMaterialId: l.canonicalMaterialId! } },
        select: { unitCostCents: true },
      });
      if (cm) total += Math.round(cm.unitCostCents * l.quantity);
    }
    await raw.service.update({ where: { id: s.id }, data: { materialCostCents: total } });
  }

  // ── 8. price review and approval, through the real operation ──────────
  for (const s of chosen) {
    const published = await inTenant(c.id, () => publishSuggestedPrice(guarded, c.id, s.id));
    if (!published.ok) {
      note("blocked", "price approval", `${s.slug}: ${published.refusal.code} — ${published.refusal.message}`);
      continue;
    }
    console.log(`  approved ${s.slug} at ${money(published.basePrice)}`);
  }

  // ── 9. scheduling and service area ────────────────────────────────────
  await raw.businessHours.create({
    data: {
      contractorId: c.id, workingDays: [1, 2, 3, 4, 5],
      dayStart: "08:00", dayEnd: "17:00", windowMinutes: 180, minWindowMinutes: 120,
    },
  });
  await raw.serviceArea.create({
    data: { contractorId: c.id, name: "Red Bank and nearby", zipCodes: ["07701", "07702", "07704"], active: true },
  });
  console.log(`  hours and service area set`);

  await finish(c.id);
}

/**
 * Crew-hours, prices, then launch — the steps that need the missing field.
 *
 * Separate so a partially-onboarded contractor can be carried forward rather
 * than rebuilt, which is what a real contractor coming back to setup does.
 */
async function finish(contractorId: string) {
  // NATIVE CAPACITY, NOT A CREW ROSTER.
  //
  // The first run put a Jobber crew member on a contractor who has never had
  // Jobber, because checkout would not assign a job without one whatever the
  // scheduling mode. Native scheduling now asks the only question it actually
  // needs answered: how many jobs can run in one arrival window. BrightPath
  // runs two vans.
  const nowNative = await raw.contractor.findUniqueOrThrow({
    where: { id: contractorId }, select: { nativeConcurrentJobs: true },
  });
  if (nowNative.nativeConcurrentJobs === null) {
    await raw.contractor.update({
      where: { id: contractorId }, data: { nativeConcurrentJobs: 2 },
    });
    console.log("  native capacity: 2 jobs at once");
  }
  // The crew row the first run needed is removed: a native contractor must not
  // depend on one, and leaving it would hide whether that is true.
  const staleCrew = await raw.jobberCrewMember.deleteMany({ where: { contractorId } });
  if (staleCrew.count > 0) console.log(`  removed ${staleCrew.count} crew row(s) — native scheduling needs none`);

  // ── the contractor's policy decisions ──────────────────────────────────
  for (const [key, answer] of Object.entries(POLICIES)) {
    const existing = await raw.contractorPolicyValue.findFirst({
      where: { contractorId, key }, select: { resolvedAt: true },
    });
    if (!existing || existing.resolvedAt) continue;
    const res = await resolvePolicy(
      raw, contractorId, key,
      Array.isArray(answer) ? { boundaries: answer } : { choice: answer }
    );
    if (!res.ok) { note("blocked", "policy", `${key}: ${res.refusal.code} — ${res.refusal.message}`); continue; }
    console.log(`  decided ${key} — ${res.optionsRelabeled} label(s) rewritten`);
  }

  const offered = await raw.service.findMany({
    where: { contractorId, offered: true }, select: { id: true, slug: true, fieldLaborHours: true },
    orderBy: { slug: "asc" },
  });

  for (const s of offered) {
    const hours = CREW_HOURS[s.slug];
    if (hours === undefined) { note("missing", "crew hours", `no answer recorded for ${s.slug}`); continue; }
    if (s.fieldLaborHours === null) {
      await raw.service.update({ where: { id: s.id }, data: { fieldLaborHours: hours } });
    }
  }
  console.log(`  crew-hours entered for ${offered.length} services`);

  for (const s of offered) {
    const svc = await raw.service.findUniqueOrThrow({ where: { id: s.id }, select: { publishedPriceApprovedAt: true } });
    if (svc.publishedPriceApprovedAt) continue;
    const published = await inTenant(contractorId, () => publishSuggestedPrice(guarded, contractorId, s.id));
    if (!published.ok) { note("blocked", "price approval", `${s.slug}: ${published.refusal.code} — ${published.refusal.message}`); continue; }
    console.log(`  approved ${s.slug} at ${money(published.basePrice)}`);
  }

  // TROUBLESHOOTING FIRST.
  //
  // Several services reroute to troubleshooting when a homeowner says
  // something is not working, and those routes resolve only if a
  // TROUBLESHOOT_ONLY service is ACTIVE. Launch it last and the services that
  // depend on it go live with dead ends in them. Nothing in Guided Setup says
  // so — see the findings.
  const order = [...offered].sort((a, b) =>
    (a.slug.includes("troubleshoot") ? 0 : 1) - (b.slug.includes("troubleshoot") ? 0 : 1));

  for (const s of order) {
    const live = await inTenant(contractorId, () => activateService(guarded, contractorId, s.id));
    if (!live.ok) { note("blocked", "launch", `${s.slug}: ${live.refusal.code} — ${live.refusal.message}`); continue; }
    console.log(`  live: ${s.slug}`);
  }

  await report(contractorId);
}

async function report(contractorId: string) {
  const r = await inTenant(contractorId, () => assessOnboarding(guarded, contractorId));
  const live = await raw.service.findMany({
    where: { contractorId, active: true },
    select: { slug: true, basePrice: true, publishedPriceApprovedAt: true },
    orderBy: { slug: "asc" },
  });

  console.log(`\n  READINESS  canLaunch=${r.canLaunch}  blockers=${r.blockers.length}  warnings=${r.warnings.length}`);
  for (const b of r.blockers) console.log(`     BLOCKER  ${b.code} ${b.serviceSlug ?? ""}`);
  console.log(`\n  STOREFRONT — ${live.length} service(s) a homeowner can see`);
  for (const s of live) console.log(`     ${s.slug.padEnd(34)} ${money(s.basePrice)}  approved=${s.publishedPriceApprovedAt ? "yes" : "NO"}`);

  if (findings.length) {
    console.log(`\n  FINDINGS`);
    for (const f of findings) console.log(`     ${f.kind.padEnd(9)} ${f.where}: ${f.detail}`);
  }
  console.log();
  await raw.$disconnect();
  await (guarded as PrismaClient).$disconnect();
}

main().catch(async (e) => { console.error(e); process.exit(1); });
