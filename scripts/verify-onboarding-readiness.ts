/**
 * Does the readiness engine tell a live contractor from an unfinished one?
 *
 *   npx tsx scripts/verify-onboarding-readiness.ts
 *
 * Guided Setup orchestrates systems that already exist. The one way it can do
 * real harm is by disagreeing with them — telling a contractor they are ready
 * when §1.4, `connectReadiness` or the scheduling rules would refuse a real
 * homeowner. So the engine is checked against two contractors that genuinely
 * disagree:
 *
 *   Elite            fully configured and live. Must be launchable.
 *   fresh provision  the template installed and nothing else. Must be blocked,
 *                    on exactly the things provisioning deliberately leaves
 *                    unresolved — it refuses to write a single economic value.
 *
 * An engine that cannot separate those two is wrong, whatever its rules say.
 */

import { PrismaClient } from "@prisma/client";
import { withTenantGuard } from "../lib/tenantGuard";
import { withTenant } from "../lib/tenantContext";
import { assessOnboarding, type OnboardingReadiness } from "../lib/onboardingReadiness";
import { existsSync, readFileSync } from "node:fs";
import { provision, destroyContractor } from "./_throwaway";
import {
  availableTrades, provisionedFromTrade, templateVersionSource, preflight,
} from "../lib/templateProvisioning";
import { setTradeEnrolment } from "../lib/tradeEnrolment";

const raw = new PrismaClient();
const guarded = withTenantGuard(new PrismaClient()) as unknown as PrismaClient;
/**
 * RUN-UNIQUE, because the worktree and the database are shared.
 *
 * Both fixtures take the SAME run token, so one run's pair is trivially
 * distinguishable from another's. A fixed slug races whenever two runs
 * overlap — a Vercel build (npm run verify runs inside next build) and a
 * local run, or two workstreams — and the second starter's teardown deletes
 * the first's fixture mid-assertion.
 *
 * Same shape as verify-activation-dependencies, deliberately. The prefixes
 * stay fixed so fixtures from a crashed run are still sweepable.
 */
const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const FRESH_PREFIX = "test-onboarding-fresh";
const PROBE_PREFIX = "test-onboarding-probe";
const FRESH = `${FRESH_PREFIX}-${RUN}`;
const PROBE = `${PROBE_PREFIX}-${RUN}`;

let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };
const codes = (r: OnboardingReadiness, s: "blocker" | "warning") =>
  (s === "blocker" ? r.blockers : r.warnings).map((f) => f.code);
const assess = (id: string) =>
  withTenant({ contractorId: id, source: "test" }, () => assessOnboarding(guarded, id));

/**
 * Remove EVERYTHING this suite creates, not just the contractor.
 *
 * `destroyContractor` follows the service graph; it does not know about the
 * storefront and onboarding rows this suite adds. A crashed run once left a
 * third contractor owning `new-120v-outlet`, and the template suite then
 * asserted against the wrong tenant's price — a failure in a different file,
 * caused by debris from this one. Teardown has to cover what the test wrote.
 */
/**
 * Only what is genuinely abandoned — sweeping every sibling would delete a
 * CONCURRENT run's live fixture, reintroducing the collision by way of the
 * cleanup. Age separates "crashed" from "running".
 */
const STALE_AFTER_MS = 60 * 60 * 1000;

async function sweepStale() {
  const stale = await raw.contractor.findMany({
    where: {
      OR: [{ slug: { startsWith: FRESH_PREFIX } }, { slug: { startsWith: PROBE_PREFIX } }],
      NOT: { slug: { in: [FRESH, PROBE] } },
      createdAt: { lt: new Date(Date.now() - STALE_AFTER_MS) },
    },
    select: { slug: true },
  });
  for (const c of stale) await teardown(c.slug);
  if (stale.length) console.log(`  (swept ${stale.length} abandoned fixture(s))`);
}

async function teardown(slug: string) {
  await raw.contractorSite.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await raw.contractorOnboarding.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await raw.jobberConnection.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await destroyContractor(raw, slug).catch(() => {});
}

async function main() {
  console.log(`\nGUIDED SETUP — READINESS ENGINE\n`);
  await sweepStale();

  // ── fixture 1: Elite, live ─────────────────────────────────────────────
  const elite = await raw.contractor.findFirstOrThrow({ where: { slug: "elite-electric" }, select: { id: true } });
  const e = await assess(elite.id);
  console.log(`  ELITE   canLaunch=${e.canLaunch}  blockers=${e.blockers.length}  warnings=${e.warnings.length}  intended=${e.intended.length}`);
  ok(`1. a fully configured contractor can launch`, e.canLaunch, codes(e, "blocker").join(", "));
  ok(`   with no blockers at all`, e.blockers.length === 0);
  ok(`2. and warnings do not stop them`, e.warnings.length > 0 && e.canLaunch,
    `${e.warnings.length} warning(s)`);
  ok(`3. its live services are the intended set`, e.intended.length > 0);

  // ── fixture 2: freshly provisioned, nothing decided ────────────────────
  await teardown(FRESH);
  await raw.contractor.create({ data: { slug: FRESH, name: "Fresh electrical", active: false } });
  provision(FRESH);
  const fresh = await raw.contractor.findFirstOrThrow({ where: { slug: FRESH }, select: { id: true } });
  const f = await assess(fresh.id);
  console.log(`\n  FRESH   canLaunch=${f.canLaunch}  blockers=${f.blockers.length}  warnings=${f.warnings.length}  intended=${f.intended.length}`);
  for (const x of f.blockers) console.log(`            ${x.code}${x.serviceSlug ? ` (${x.serviceSlug})` : ""}`);

  ok(`4. a freshly provisioned contractor cannot launch`, !f.canLaunch);
  ok(`   and it has services to work with`,
    (await raw.service.count({ where: { contractorId: fresh.id } })) > 0);
  // provision-from-template refuses to write any economic value, so the price
  // foundation is exactly what it leaves behind.
  ok(`5. blocked on the economics provisioning deliberately did not write`,
    codes(f, "blocker").includes("PRICING_SETTINGS_MISSING"),
    codes(f, "blocker").join(", "));
  ok(`6. and on having nothing it could actually sell`,
    codes(f, "blocker").includes("NOTHING_ACTIVATABLE"));
  ok(`   because every provisioned service starts UNSELECTED`,
    (await raw.service.count({ where: { contractorId: fresh.id, offered: true } })) === 0,
    `${await raw.service.count({ where: { contractorId: fresh.id, offered: true } })} offered`);
  ok(`7. the two fixtures disagree, which is the point`,
    e.canLaunch && !f.canLaunch);

  // ── derived, not stored ────────────────────────────────────────────────
  //
  // No onboarding row exists for either contractor. Changing a domain fact
  // must move readiness on the next call, with nothing to invalidate.
  const before = codes(await assess(fresh.id), "blocker").includes("COUNTRY_MISSING");
  await raw.contractor.update({ where: { id: fresh.id }, data: { countryCode: "US" } });
  const after = codes(await assess(fresh.id), "blocker").includes("COUNTRY_MISSING");
  ok(`8. changing a domain fact changes readiness immediately`, before && !after,
    `before=${before} after=${after}`);
  ok(`   with no onboarding row involved at all`,
    (await raw.contractorOnboarding.count({ where: { contractorId: fresh.id } })) === 0);

  // ── conditional rules ──────────────────────────────────────────────────
  await teardown(PROBE);
  const probe = await raw.contractor.create({
    data: {
      slug: PROBE, name: "Readiness probe", active: false, countryCode: "US",
      // Declared, so the crew rules below are exercised deliberately.
      schedulingAuthority: "NATIVE",
    },
    select: { id: true },
  });
  try {
    const cat = await raw.service.findFirstOrThrow({ select: { categoryId: true } });
    // Priced and approved, no tree: promises a price on the first tap, so it
    // is unambiguously intended.
    const svc = await raw.service.create({
      data: {
        slug: `${PROBE}-svc`, name: "Probe service", contractorId: probe.id,
        categoryId: cat.categoryId, bookingType: "ADJUSTED", active: false,
        basePrice: 50000, publishedPriceApprovedAt: new Date(),
        // Intent is a decision now, not an inference from having a price.
        offered: true,
      },
      select: { id: true },
    });

    const noDeposit = await assess(probe.id);
    ok(`9. Stripe does NOT block a contractor who takes no deposits`,
      !codes(noDeposit, "blocker").some((c) => c.startsWith("STRIPE_")),
      codes(noDeposit, "blocker").join(", "));

    // WHAT "ASKS FOR A DEPOSIT" MEANS CHANGED, AND THIS CHECK HAD NOT.
    //
    // It used to set Service.depositCents and expect a Stripe blocker. Since
    // 68643ed readiness answers from the canonical deposit authority checkout
    // uses — Service.depositRule plus the company's deposit rules and amount —
    // and depositCents is retained legacy data nobody reads. So the old setup
    // no longer asked for a deposit at all, the blocker correctly did not
    // appear, and the check failed on a correct engine. Exercised below through
    // the real authority, both ways it can apply, with the legacy field
    // checked for staying inert.
    const requiresStripe = (r: OnboardingReadiness) => codes(r, "blocker").includes("STRIPE_NOT_CONNECTED");
    const depositBlockers = (r: OnboardingReadiness) =>
      codes(r, "blocker").filter((c) => c.startsWith("STRIPE_") || c === "DEPOSIT_AMOUNT_MISSING");
    const before = await raw.service.findUniqueOrThrow({ where: { id: svc.id }, select: { depositCents: true, depositRule: true } });

    await raw.service.update({ where: { id: svc.id }, data: { depositCents: 24900 } });
    const legacyOnly = await assess(probe.id);
    ok(`10.  legacy Service.depositCents alone does NOT ask for a deposit`,
      depositBlockers(legacyOnly).length === 0, depositBlockers(legacyOnly).join(", "));
    await raw.service.update({ where: { id: svc.id }, data: { depositCents: before.depositCents } });

    // Company authority: a company rule applies to USE_COMPANY_POLICY services.
    await raw.contractor.update({ where: { id: probe.id }, data: { depositOnEveryBooking: true } });
    const ruleNoAmount = await assess(probe.id);
    ok(`10a. a company deposit rule with no amount blocks on DEPOSIT_AMOUNT_MISSING, before Stripe`,
      codes(ruleNoAmount, "blocker").includes("DEPOSIT_AMOUNT_MISSING") && !requiresStripe(ruleNoAmount),
      depositBlockers(ruleNoAmount).join(", "));
    await raw.contractor.update({ where: { id: probe.id }, data: { depositAmountCents: 24900 } });
    const withDeposit = await assess(probe.id);
    ok(`10b.  and DOES require Stripe once the company rule can collect an amount`,
      requiresStripe(withDeposit), depositBlockers(withDeposit).join(", "));

    // Service authority: ALWAYS_REQUIRE applies with no company rule at all.
    await raw.contractor.update({ where: { id: probe.id }, data: { depositOnEveryBooking: false } });
    await raw.service.update({ where: { id: svc.id }, data: { depositRule: "ALWAYS_REQUIRE" } });
    const alwaysRequire = await assess(probe.id);
    ok(`10c.  and DOES for a service that ALWAYS_REQUIREs one, with no company rule`,
      requiresStripe(alwaysRequire), depositBlockers(alwaysRequire).join(", "));

    // NEGATIVE CONTROL — the check must fail on the violation it exists for:
    // a deposit that can apply, with no Stripe blocker raised.
    const violation: OnboardingReadiness = {
      ...alwaysRequire,
      blockers: alwaysRequire.blockers.filter((f) => f.code !== "STRIPE_NOT_CONNECTED"),
    };
    ok(`10d. negative control: the deposit check FAILS when that Stripe blocker is missing`,
      !requiresStripe(violation));

    await raw.service.update({ where: { id: svc.id }, data: { depositRule: before.depositRule } });
    await raw.contractor.update({ where: { id: probe.id }, data: { depositAmountCents: null } });

    // Zero crew: legitimate standalone, a configuration failure with Jobber.
    const standalone = await assess(probe.id);
    ok(`11. zero crew is fine when Price2Book schedules`,
      !codes(standalone, "blocker").includes("NO_ELIGIBLE_CREW"));

    await raw.contractor.update({ where: { id: probe.id }, data: { schedulingAuthority: "EXTERNAL" } });
    await raw.jobberConnection.create({
      data: {
        contractorId: probe.id, accessToken: "probe", refreshToken: "probe",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const external = await assess(probe.id);
    ok(`12.  and blocks once Jobber is the authority`,
      codes(external, "blocker").includes("NO_ELIGIBLE_CREW"));
  } finally {
    await teardown(PROBE);
  }

  // ── TIME_AND_MATERIALS strategy — the second readiness engine agrees ────
  //
  // assessOnboarding used to re-derive its own FLAT_RATE-shaped idea of
  // "priced" regardless of pricingStrategy: PRICE_NOT_APPROVED demanded a
  // publishedPriceApprovedAt T&M never sets, and LABOR_INPUTS_MISSING
  // demanded a derivable flat price from fieldLaborHours, which T&M treats as
  // an optional suggestion. A properly configured, fully approved T&M service
  // was blocked FOREVER — verified directly against this database before the
  // fix landed. Now it delegates to lib/pricingReadiness.ts's own
  // validateEstimateBounds, the same authority /dashboard/estimates uses, so
  // the two screens cannot disagree.
  await teardown(PROBE);
  const tm = await raw.contractor.create({
    data: { slug: PROBE, name: "T&M readiness probe", active: false, countryCode: "US", pricingStrategy: "TIME_AND_MATERIALS" },
    select: { id: true },
  });
  try {
    await raw.pricingSettings.create({
      data: { contractorId: tm.id, crewHourRateCents: 15000, primaryMinimumCents: 9900, roundingIncrementCents: 100, defaultPermitAdminCents: 0 },
    });
    const cat = await raw.service.findFirstOrThrow({ select: { categoryId: true } });
    const svc = await raw.service.create({
      data: {
        slug: `${PROBE}-tm-svc`, name: "T&M probe service", contractorId: tm.id,
        categoryId: cat.categoryId, bookingType: "INSTANT", active: false, offered: true,
        materialCostResolved: true,
        estimateLowCrewHours: 1.5, estimateHighCrewHours: 3,
      },
      select: { id: true },
    });

    const unapproved = await assess(tm.id);
    ok(`12a. a T&M service with entered-but-unapproved estimates is blocked ESTIMATE_NOT_APPROVED`,
      codes(unapproved, "blocker").includes("ESTIMATE_NOT_APPROVED"));
    ok(`     ...and NOT by the FLAT_RATE-shaped codes that used to fire regardless of strategy`,
      !codes(unapproved, "blocker").some((c) => c === "PRICE_NOT_APPROVED" || c === "LABOR_INPUTS_MISSING"));

    await raw.service.update({ where: { id: svc.id }, data: { estimateLowCrewHours: null, estimateHighCrewHours: null } });
    const missing = await assess(tm.id);
    ok(`12b. no estimate entered at all is blocked ESTIMATE_BOUNDS_MISSING, never zero`,
      codes(missing, "blocker").includes("ESTIMATE_BOUNDS_MISSING"));

    await raw.service.update({ where: { id: svc.id }, data: { estimateLowCrewHours: 1.5, estimateHighCrewHours: 3, estimateApprovedAt: new Date() } });
    const approved = await assess(tm.id);
    const approvedServiceFindings = approved.stages.find((s) => s.key === "services")?.findings ?? [];
    ok(`12c. once approved, the SERVICES stage itself reports zero findings for it — this is the bug fixed`,
      approvedServiceFindings.length === 0, JSON.stringify(approvedServiceFindings));
  } finally {
    await teardown(PROBE);
  }

  // ── selection is a decision, and only a decision ───────────────────────
  const fixed = await raw.service.findFirstOrThrow({
    where: { contractorId: fresh.id, bookingType: { not: "REMOTE_QUOTE" } },
    select: { id: true, slug: true },
  });
  const quoteOnly = await raw.service.findFirst({
    where: { contractorId: fresh.id, bookingType: "REMOTE_QUOTE" },
    select: { id: true, slug: true },
  });

  await raw.service.update({ where: { id: fixed.id }, data: { offered: true } });
  const afterSelect = await raw.service.findUniqueOrThrow({
    where: { id: fixed.id },
    select: { active: true, basePrice: true, publishedPriceApprovedAt: true },
  });
  ok(`13. selecting a service does not publish a price`,
    afterSelect.basePrice === null && afterSelect.publishedPriceApprovedAt === null);
  ok(`14.  and does not put it on the storefront`, afterSelect.active === false);

  const withFixed = await assess(fresh.id);
  ok(`15. selecting a fixed-price service surfaces its real requirements`,
    withFixed.intended.some((i) => i.slug === fixed.slug) &&
      withFixed.blockers.some((x) => x.serviceSlug === fixed.slug),
    withFixed.blockers.filter((x) => x.serviceSlug === fixed.slug).map((x) => x.code).join(", "));

  if (quoteOnly) {
    await raw.service.update({ where: { id: fixed.id }, data: { offered: false } });
    await raw.service.update({ where: { id: quoteOnly.id }, data: { offered: true } });
    const withQuote = await assess(fresh.id);
    ok(`16. a quote-only service is included WITHOUT a manufactured price`,
      withQuote.intended.some((i) => i.slug === quoteOnly.slug) &&
        !withQuote.blockers.some((x) => x.serviceSlug === quoteOnly.slug && x.code === "PRICE_NOT_APPROVED"),
      withQuote.blockers.filter((x) => x.serviceSlug === quoteOnly.slug).map((x) => x.code).join(", "));
    await raw.service.update({ where: { id: quoteOnly.id }, data: { offered: false } });
  } else {
    console.log(`  (no REMOTE_QUOTE service in the template to probe with)`);
  }

  await raw.service.update({ where: { id: fixed.id }, data: { offered: true } });
  const selected = await assess(fresh.id);
  await raw.service.update({ where: { id: fixed.id }, data: { offered: false } });
  const deselected = await assess(fresh.id);
  ok(`17. deselecting removes that service's requirements`,
    selected.blockers.some((x) => x.serviceSlug === fixed.slug) &&
      !deselected.blockers.some((x) => x.serviceSlug === fixed.slug));

  // ── scheduling authority is declared, and changes the rules ────────────
  await raw.contractor.update({ where: { id: fresh.id }, data: { schedulingAuthority: null } });
  const undeclared = await assess(fresh.id);
  ok(`18. an undeclared calendar owner is a blocker, not a default`,
    codes(undeclared, "blocker").includes("SCHEDULING_AUTHORITY_UNDECLARED"));

  await raw.contractor.update({ where: { id: fresh.id }, data: { schedulingAuthority: "NATIVE" } });
  const native = await assess(fresh.id);
  ok(`19. native scheduling with no crew is legitimate`,
    !codes(native, "blocker").includes("NO_ELIGIBLE_CREW") &&
      !codes(native, "blocker").includes("SCHEDULING_AUTHORITY_UNDECLARED"));

  await raw.contractor.update({ where: { id: fresh.id }, data: { schedulingAuthority: "EXTERNAL" } });
  const external = await assess(fresh.id);
  ok(`20. switching to an external calendar blocks on zero bookable crew`,
    codes(external, "blocker").includes("NO_ELIGIBLE_CREW"));
  ok(`    and on there being no calendar connected`,
    codes(external, "blocker").includes("PROVIDER_NOT_CONNECTED"));
  ok(`21. the switch took effect with nothing to invalidate`,
    !codes(native, "blocker").includes("NO_ELIGIBLE_CREW") &&
      codes(external, "blocker").includes("NO_ELIGIBLE_CREW"));

  // ── onboarding state survives, and holds nothing derived ──────────────
  await raw.contractorOnboarding.create({
    data: { contractorId: fresh.id, currentStage: "scheduling", acknowledged: { services: "2026-08-31T00:00:00.000Z" } },
  });
  const resumed = await raw.contractorOnboarding.findUniqueOrThrow({ where: { contractorId: fresh.id } });
  ok(`22. onboarding can be left and resumed with choices intact`,
    resumed.currentStage === "scheduling" &&
      (resumed.acknowledged as Record<string, string>).services !== undefined &&
      (await raw.contractor.findUniqueOrThrow({ where: { id: fresh.id }, select: { schedulingAuthority: true } }))
        .schedulingAuthority === "EXTERNAL");
  const cols = await raw.$queryRawUnsafe<{ column_name: string }[]>(
    `select column_name from information_schema.columns where table_name = 'contractor_onboarding'`
  );
  ok(`23. and stores no readiness, blockers or launchability`,
    !cols.some((c) => /ready|blocker|warning|launch/i.test(c.column_name)),
    cols.map((c) => c.column_name).join(","));

  // ── no write path can approve or activate ─────────────────────────────
  const WRITE_PATHS = [
    "app/api/admin/setup/scheduling-authority/route.ts",
    "app/api/admin/setup/progress/route.ts",
    "app/api/admin/setup/storefront/route.ts",
    "app/api/admin/business-profile/route.ts",
    "app/api/admin/services/[serviceId]/offered/route.ts",
  ];
  const routes = WRITE_PATHS.map((f) =>
    readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  );
  ok(`24. no Guided Setup write path can stamp a price approval`,
    !routes.some((r) => /publishedPriceApprovedAt|basePrice/.test(r)));
  // SERVICE WRITES ONLY. The first form matched `select: { active: true }`,
  // which reads. The second matched any `data: { … active … }`, which made
  // setup/storefront's ContractorSite reactivation — a storefront SITE coming
  // back, not a service going live — fail the check on a legitimate route.
  // A setup route puts a service on the storefront by writing Service.active to
  // anything other than false, or by calling the activation entry point.
  //
  // READ AS STRUCTURE, NOT AS A PATTERN. A regex allowing one level of nested
  // braces let `data: { contractorCategory: { connect: { id } }, active: true }`
  // through — its own negative control caught that. So the write's arguments
  // are scanned for balanced braces and only TOP-LEVEL keys of data / create /
  // update count: an `active` nested inside a relation belongs to the related
  // model, not the service. Data passed by variable name is beyond any source
  // scan; the activation guard is the runtime authority for that.
  const closeOf = (src: string, open: number): number => {
    let depth = 0; let quote: string | null = null;
    for (let i = open; i < src.length; i++) {
      const ch = src[i];
      if (quote) { if (ch === "\\") i++; else if (ch === quote) quote = null; continue; }
      if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }
      if (ch === "(" || ch === "{" || ch === "[") depth++;
      else if (ch === ")" || ch === "}" || ch === "]") { depth--; if (depth === 0) return i; }
    }
    return -1;
  };
  const topLevel = (body: string): Map<string, string> => {
    const out = new Map<string, string>(); let depth = 0; let quote: string | null = null; let start = 0;
    const take = (part: string) => {
      const t = part.trim(); if (!t || t.startsWith("...")) return;
      const colon = t.search(/:/);
      if (colon === -1) out.set(t, t); else out.set(t.slice(0, colon).trim(), t.slice(colon + 1).trim());
    };
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (quote) { if (ch === "\\") i++; else if (ch === quote) quote = null; continue; }
      if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }
      if ("({[".includes(ch)) depth++; else if (")}]".includes(ch)) depth--;
      else if (ch === "," && depth === 0) { take(body.slice(start, i)); start = i + 1; }
    }
    take(body.slice(start));
    return out;
  };
  const objectBody = (text: string): string | null => {
    const open = text.indexOf("{"); if (open === -1 || text.slice(0, open).trim() !== "") return null;
    const close = closeOf(text, open); return close === -1 ? null : text.slice(open + 1, close);
  };
  const writesServiceActive = (src: string): boolean => {
    for (const m of src.matchAll(/\.service\.(?:update|updateMany|upsert|create|createMany)\s*\(/g)) {
      const open = m.index! + m[0].length - 1; const close = closeOf(src, open);
      const args = objectBody(src.slice(open + 1, close).trim()); if (args === null) continue;
      const argKeys = topLevel(args);
      for (const k of ["data", "create", "update"]) {
        const v = argKeys.get(k); const body = v === undefined ? null : objectBody(v);
        if (body === null) continue;
        const fields = topLevel(body);
        if (fields.has("active") && fields.get("active") !== "false") return true;
      }
    }
    return false;
  };
  const putsServiceLive = (src: string) => writesServiceActive(src) || /\bactivateService\s*\(/.test(src);
  ok(`25.  or put a service on the storefront`,
    !routes.some(putsServiceLive),
    WRITE_PATHS.filter((_, i) => putsServiceLive(routes[i])).join(", "));

  // NEGATIVE CONTROLS — narrowing must not blind it. Each of these puts a
  // service live and must be caught; each of the next set must not be.
  const LIVE = [
    `await db.service.update({ where: { id }, data: { active: true } });`,
    `await tx.service.updateMany({ where: { contractorId }, data: { offered: true, active: true } });`,
    `await db.service.update({ where: { id }, data: { active } });`,
    `await db.service.update({ where: { id }, data: { contractorCategory: { connect: { id: c } }, active: true } });`,
    `await db.service.upsert({ where: { id }, create: { slug, active: true }, update: {} });`,
    `const result = await activateService(db, contractorId, serviceId);`,
  ];
  const NOT_LIVE = [
    `const site = await db.contractorSite.update({ where: { id: existing.id }, data: { active: true } });`,
    `const site = await db.contractorSite.create({ data: { contractorId, hostedSlug, active: true } });`,
    `await db.service.update({ where: { id }, data: { active: false } });`,
    `const s = await db.service.findUnique({ where: { id }, select: { id: true, active: true } });`,
    `await db.service.update({ where: { id: service.id }, data: { offered } });`,
    `await db.service.update({ where: { id }, data: { contractorCategory: { update: { active: true } } } });`,
  ];
  ok(`25a. negative control: it still catches every way a route could put a service live`,
    LIVE.every(putsServiceLive), LIVE.filter((x) => !putsServiceLive(x)).join(" | "));
  ok(`25b.  and does not mistake storefront-site activation, deactivation or a read for it`,
    NOT_LIVE.every((x) => !putsServiceLive(x)), NOT_LIVE.filter(putsServiceLive).join(" | "));

  // ── slice three: business profile, storefront, destinations ───────────
  await raw.contractor.update({
    where: { id: fresh.id },
    data: { name: "Fresh electrical", phone: null, supportEmail: null, countryCode: null },
  });
  const beforeProfile = codes(await assess(fresh.id), "blocker");
  await raw.contractor.update({ where: { id: fresh.id }, data: { countryCode: "US" } });
  const afterProfile = codes(await assess(fresh.id), "blocker");
  ok(`26. a business-profile change moves readiness on the next render`,
    beforeProfile.includes("COUNTRY_MISSING") && !afterProfile.includes("COUNTRY_MISSING"));

  const beforeSite = codes(await assess(fresh.id), "blocker");
  await raw.contractorSite.create({
    data: {
      contractorId: fresh.id, hostedSlug: FRESH,
      publicId: `site_${"0".repeat(32)}`, active: true,
    },
  });
  const afterSite = codes(await assess(fresh.id), "blocker");
  ok(`27. creating a storefront clears SITE_MISSING`,
    beforeSite.includes("SITE_MISSING") && !afterSite.includes("SITE_MISSING"));

  // Routing identity is issued, never typed. A contractor who could set
  // publicId could point their storefront at another tenant's routing key.
  // Comments stripped: both files NAME the fields they refuse to accept, and
  // a check that failed on its own explanation would be noise.
  const strip = (f: string) =>
    readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const storefrontRoute = strip("app/api/admin/setup/storefront/route.ts");
  const profileRoute = strip("app/api/admin/business-profile/route.ts");
  ok(`28. no write path accepts a routing identity from the request`,
    !/body\.(publicId|hostedSlug)/.test(storefrontRoute) &&
      !/(publicId|hostedSlug)/.test(profileRoute));

  // Every blocker must lead somewhere that exists.
  const all = await assess(fresh.id);
  const missing: string[] = [];
  for (const fnd of [...all.blockers, ...all.warnings]) {
    if (!fnd.href) { missing.push(`${fnd.code} (no href)`); continue; }
    const route = fnd.href.replace(/^\//, "");
    const page = `app/${route}/page.tsx`;
    if (!existsSync(page)) missing.push(`${fnd.code} -> ${fnd.href}`);
  }
  ok(`29. every finding leads to a page that exists`, missing.length === 0, missing.join(", "));

  // Locked stages have no writer at all in this slice.
  const setupPage = readFileSync("app/dashboard/setup/page.tsx", "utf8");
  // RETIRED: "scheduling, payments and launch are closed". They are open now,
  // deliberately — that check had become an assertion that the release had not
  // happened. What must stay true is that opening a stage gave it no power to
  // price or publish: every write still goes to a named sanctioned route.
  const SANCTIONED = [
    "/api/admin/business-profile",
    "/api/admin/setup/scheduling-authority",
    "/api/admin/setup/progress",
    "/api/admin/setup/storefront",
    "/api/admin/setup/install-catalog",
    "/api/admin/services/",
  ];
  const setupDir = ["page.tsx", "BusinessPanel.tsx", "SchedulingAuthorityControl.tsx",
    "SetupStepperNav.tsx", "TradePanel.tsx", "PricingFoundationPanel.tsx",
    "SchedulingPanel.tsx", "PaymentsPanel.tsx", "LaunchPanel.tsx"];
  const endpoints = setupDir.flatMap((f) =>
    [...strip(`app/dashboard/setup/${f}`).matchAll(/fetch\(\s*[`"']([^`"'$]*)/g)].map((m) => m[1])
  );
  const rogue = endpoints.filter((e) => !SANCTIONED.some((ok2) => e.startsWith(ok2)));
  ok(`30. every Guided Setup write goes to a sanctioned route`,
    rogue.length === 0, rogue.join(", "));
  ok(`31. and selection is the Services control, not an onboarding copy`,
    /ServiceSelectionList/.test(setupPage) &&
      existsSync("components/admin/ServiceSelectionList.tsx") &&
      !existsSync("app/api/admin/setup/selection/route.ts"));

  // ── slice four: enrolment ─────────────────────────────────────────────
  const trades = await availableTrades(raw);
  ok(`32. trade choices come from published catalogs, not a list`,
    trades.includes("electrical") && trades.length > 0, trades.join(", "));

  // A trade with only deltas has no catalog to install, so it must not be
  // offered as a choice.
  const deltaOnly = await raw.templateVersion.findMany({
    where: { kind: "DELTA" }, select: { trade: true },
  });
  const snapshotTrades = new Set(trades);
  ok(`33.  and a trade with no SNAPSHOT is not offered`,
    deltaOnly.every((d) => snapshotTrades.has(d.trade) ||
      !deltaOnly.some((x) => x.trade === d.trade && !snapshotTrades.has(x.trade))));

  // Enrolment goes through the shared writer — the one the route calls —
  // rather than a direct row write, so the suite exercises the path the
  // trade picker actually takes. (verify-trade-enrolment holds the rest.)
  const enrolled = await setTradeEnrolment(raw, fresh.id, "electrical");
  if (!enrolled.ok) throw new Error(`enrolment refused: ${enrolled.code}`);
  const provisioned = await provisionedFromTrade(raw, fresh.id, "electrical");
  ok(`34. a provisioned trade cannot be casually swapped`, provisioned > 0,
    `${provisioned} service(s) carry electrical provenance`);

  // ── slice four: install refuses to seed economics ────────────────────
  const installed = await raw.service.findMany({ where: { contractorId: fresh.id } });
  ok(`35. installation seeded no economics at all`,
    installed.every((s) =>
      s.basePrice === null && s.publishedPriceApprovedAt === null &&
      s.fieldLaborHours === null && s.materialCostCents === null &&
      s.materialMultiplier === null && s.depositCents === null));
  ok(`36.  left everything unoffered and inactive`,
    installed.every((s) => !s.offered && !s.active));

  // A fresh install already includes applicable deltas, so there is nothing
  // waiting to be adopted.
  const stale = await raw.service.count({
    where: {
      contractorId: fresh.id,
      templateVersionId: {
        in: (await raw.templateVersion.findMany({
          where: { trade: "electrical", kind: "SNAPSHOT" }, select: { id: true },
        })).map((v) => v.id),
      },
      templateKey: {
        in: (await raw.templateService.findMany({
          where: { templateVersion: { trade: "electrical", kind: "DELTA" } },
          select: { key: true },
        })).map((t) => t.key),
      },
    },
  });
  ok(`37. a fresh install has no adoption backlog`, stale === 0,
    `${stale} service(s) still at the snapshot despite a later delta`);

  // ── slices five to seven ──────────────────────────────────────────────
  const setupSrc = readFileSync("app/dashboard/setup/page.tsx", "utf8");
  const launchSrc = readFileSync("app/dashboard/setup/LaunchPanel.tsx", "utf8");
  const schedulingSrc = readFileSync("app/dashboard/setup/SchedulingPanel.tsx", "utf8");
  const activationSrc = readFileSync("app/api/admin/services/[serviceId]/route.ts", "utf8");

  // Launch reuses the per-service route, one call each, so every service meets
  // the same guard. A bulk endpoint would be a second activation path.
  const launchCode = strip("app/dashboard/setup/LaunchPanel.tsx");
  ok(`38. launch activates through the existing per-service route`,
    launchCode.includes("/api/admin/services/") && launchCode.includes("${s.id}") &&
      !/bulk|activateAll|activate-many/i.test(launchCode));
  ok(`39.  one service at a time, with failures reported per service`,
    /for \(const s of eligible/.test(launchSrc) && /results/.test(launchSrc));
  ok(`40.  and it never sends a price or an approval`,
    !/basePrice|publishedPriceApprovedAt|offered/.test(
      (launchSrc.match(/JSON\.stringify\(\{[\s\S]*?\}\)/g) ?? []).join("\n")));

  // The refusal itself is proven BEHAVIORALLY in verify-launch-behavior,
  // against a real installed catalog. What belongs here is the structural
  // claim that behavior rests on: one activation authority, which the route
  // delegates to rather than reimplementing.
  ok(`41. there is exactly one activation authority`,
    /activationRefusal/.test(activationSrc) &&
      !/PRICE_NOT_APPROVED|MATERIALS_UNRESOLVED/.test(strip("app/api/admin/services/[serviceId]/route.ts").replace(/refusal\.code/g, "")));
  ok(`42.  and no bulk activation path exists beside it`,
    !existsSync("app/api/admin/services/activate-many/route.ts") &&
      !existsSync("app/api/admin/setup/launch/route.ts"));

  // Scheduling writes only the authority and links out for the rest.
  ok(`43. scheduling writes only the authority choice`,
    /SchedulingAuthorityControl/.test(schedulingSrc) &&
      !/businessHours|serviceArea|jobberCrewMember/.test(
        (schedulingSrc.match(/JSON\.stringify\(\{[\s\S]*?\}\)/g) ?? []).join("\n")));
  // Comments stripped: the panel's own doc names the fallback it refuses, and
  // a check that fails on its own explanation is noise.
  ok(`44.  and never falls back to native when an external calendar is authoritative`,
    !/fallback|fall back/i.test(strip("app/dashboard/setup/SchedulingPanel.tsx")));

  // Every stage is open now, and none of them can price or activate outside
  // the sanctioned routes.
  ok(`45. all seven stages are open`,
    /"business", "trade", "services", "pricing-foundation",[\s\S]{0,40}"scheduling", "payments", "launch",/.test(setupSrc));
  ok(`46.  and the setup page itself writes nothing`,
    !/db\.(service|contractor|contractorTrade)\.(update|create|upsert|delete)/.test(setupSrc));

  await teardown(FRESH);
  console.log();
  console.log(fail ? `  ${fail} check(s) failed.\n` : `  Live and unfinished are told apart, by the systems that already know.\n`);
  await raw.$disconnect();
  await (guarded as PrismaClient).$disconnect();
  if (fail) process.exit(1);
}
main().catch(async (e) => {
  console.error(e);
  await teardown(FRESH);
  await teardown(PROBE);
  process.exit(1);
});
