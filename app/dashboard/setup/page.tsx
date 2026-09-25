import { withAdminContractor } from "@/lib/adminContext";
import { platformOrigin } from "@/lib/origins";
import { assessOnboarding, catalogPromises, type Finding } from "@/lib/onboardingReadiness";
import { categoryName, requireContractorCategory } from "@/lib/categories";
import ServiceSelectionList from "@/components/admin/ServiceSelectionList";
import SchedulingAuthorityControl from "./SchedulingAuthorityControl";
import NativeCapacityControl from "./NativeCapacityControl";
import EmbedOriginsControl from "./EmbedOriginsControl";
import BusinessPanel from "./BusinessPanel";
import SetupStepperNav from "./SetupStepperNav";
import type { Step } from "@/components/ui/Stepper";
import TradePanel from "./TradePanel";
import PricingFoundationPanel, { type ServicePricing } from "./PricingFoundationPanel";
import LaborSetupPanel, { type LaborSetupOperation } from "./LaborSetupPanel";
import type { ServiceLaborReviewRow } from "./ServiceLaborReviewPanel";
import { projectElectricalServiceLabor } from "@/lib/electrical/laborServiceApproval";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS, ELECTRICAL_ATOMIC_LABOR_RECIPES } from "@/lib/electrical/atomicLabor";
import { electricalPlatformLaborBaselineByOperation } from "@/lib/electrical/platformLaborBaseline";
import SchedulingPanel from "./SchedulingPanel";
import PaymentsPanel from "./PaymentsPanel";
import LaunchPanel, { type Launchable } from "./LaunchPanel";
import { connectReadiness } from "@/lib/stripeConnect";
import {
  availableTrades, preflight, templateVersionSource, type CatalogPreview,
} from "@/lib/templateProvisioning";
import { suggestPrimaryPrice, suggestWwtPrice, formatBreakdown } from "@/lib/pricing";
import { loadPricingSettings } from "@/lib/routeResolver";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { requestCatalog } from "@/lib/catalogResolution";
import { connectedDeviceFactsForService, loadConnectedDeviceLaborFacts } from "@/lib/electrical/connectedDeviceLaborFacts";
import { routePricingReviewScenario } from "@/lib/electrical/routePricingReviewScenario";
import { flatPriceFoundationReadiness } from "@/lib/priceReviewReadiness";
import { findingSummary } from "@/lib/setupFindingSummary";

export const dynamic = "force-dynamic";

const OPEN_STAGES = [
  "business", "trade", "services", "pricing-foundation",
  "scheduling", "payments", "launch",
] as const;

export default async function SetupPage({
  searchParams,
}: { searchParams?: { stage?: string } }) {
  return withAdminContractor(async (db, ctx) => {
    // ONE catalog for readiness and every catalogPromises below, loaded once
    // for this request and only if a stage needs the trees. The render writes
    // nothing, so they cannot change between uses.
    const loadCatalog = requestCatalog(db, ctx.contractorId);
    const r = await assessOnboarding(db, ctx.contractorId, { loadCatalog });

    const onboarding = await db.contractorOnboarding.findUnique({
      where: { contractorId: ctx.contractorId },
      select: { currentStage: true },
    });
    const requested = searchParams?.stage ?? onboarding?.currentStage ?? "business";
    const current = (OPEN_STAGES as readonly string[]).includes(requested) ? requested : "business";

    const c = await db.contractor.findUniqueOrThrow({
      where: { id: ctx.contractorId },
      select: {
        name: true, legalName: true, phone: true, supportEmail: true,
        licenseNumber: true, countryCode: true, trade: true, schedulingAuthority: true,
        nativeConcurrentJobs: true, pricingStrategy: true,
      },
    });
    const site = await db.contractorSite.findFirst({
      where: { contractorId: ctx.contractorId, active: true },
      select: { hostedSlug: true, publicId: true, embedOrigins: true },
    });

    const complete = r.stages.filter(
      (s) => (OPEN_STAGES as readonly string[]).includes(s.key)
        && (s.key === "launch" ? r.canLaunch : s.status === "ready")
    ).length;

    const currentIndex = (OPEN_STAGES as readonly string[]).indexOf(current);
    const steps: Step[] = r.stages
      .filter((s) => (OPEN_STAGES as readonly string[]).includes(s.key))
      .map((s) => {
        const index = (OPEN_STAGES as readonly string[]).indexOf(s.key);
        if (s.key === current) return { key: s.key, title: s.title, state: "active" as const };
        const ready = s.key === "launch" ? r.canLaunch : s.status === "ready";
        if (ready) return { key: s.key, title: s.title, state: "complete" as const };
        return { key: s.key, title: s.title, state: index < currentIndex ? ("attention" as const) : ("upcoming" as const) };
      });

    let jobberConnected = false;
    let eligibleCrew = 0;
    let depositing: { name: string; source: "always" | "company" }[] = [];
    let depositAmountCents: number | null = null;
    let stripe = { ready: false, reason: "" };
    let launchable: Launchable[] = [];

    const stage = r.stages.find((s) => s.key === current)!;
    if (current === "scheduling") {
      jobberConnected = (await db.jobberConnection.count({ where: { contractorId: ctx.contractorId } })) > 0;
      eligibleCrew = await db.jobberCrewMember.count({
        where: { contractorId: ctx.contractorId, eligibleForWebsiteBookings: true },
      });
    }

    if (current === "payments" || current === "launch") {
      const [rows, cc] = await Promise.all([
        db.service.findMany({
          where: { contractorId: ctx.contractorId, offered: true },
          select: { name: true, depositRule: true },
          orderBy: { name: "asc" },
        }),
        db.contractor.findUniqueOrThrow({
          where: { id: ctx.contractorId },
          select: {
            depositAmountCents: true,
            depositOnEveryBooking: true,
            depositSubtotalThresholdCents: true,
            depositDurationThresholdMinutes: true,
            stripeAccountId: true, stripeMerchantConfigured: true, stripeCardPaymentsStatus: true,
            stripeOnboardingBlocked: true, stripeReadinessCheckedAt: true,
          },
        }),
      ]);

      const companyRuleEnabled =
        cc.depositOnEveryBooking ||
        cc.depositSubtotalThresholdCents !== null ||
        cc.depositDurationThresholdMinutes !== null;
      depositing = rows.flatMap<{ name: string; source: "always" | "company" }>((svc) => {
        if (svc.depositRule === "ALWAYS_REQUIRE") {
          return [{ name: svc.name, source: "always" }];
        }
        if (svc.depositRule === "USE_COMPANY_POLICY" && companyRuleEnabled) {
          return [{ name: svc.name, source: "company" }];
        }
        return [];
      });
      depositAmountCents = cc.depositAmountCents;

      const readiness = connectReadiness(cc);
      stripe = { ready: readiness.ready, reason: readiness.reason };
    }

    if (current === "launch") {
      const offeredRows = await db.service.findMany({
        where: { contractorId: ctx.contractorId, offered: true },
        orderBy: { name: "asc" },
      });
      const promises = await catalogPromises(db, ctx.contractorId, { loadCatalog });
      const diagnosticIdByTrade = new Map<string, string>();
      for (const s of offeredRows) {
        if (s.bookingType !== "TROUBLESHOOT_ONLY" || !s.tradeKey) continue;
        if (diagnosticIdByTrade.has(s.tradeKey)) diagnosticIdByTrade.set(s.tradeKey, "");
        else diagnosticIdByTrade.set(s.tradeKey, s.id);
      }
      const prerequisiteOf = (id: string) => {
        const p = promises.get(id);
        const deps = new Set(p?.handoffTargets ?? []);
        const svc = offeredRows.find((r) => r.id === id);
        const diagnosticId = svc?.tradeKey ? diagnosticIdByTrade.get(svc.tradeKey) : null;
        if (p?.needsDiagnostic && diagnosticId) deps.add(diagnosticId);
        return deps;
      };
      const ordered: typeof offeredRows = [];
      const placed = new Set<string>();
      const place = (svc: (typeof offeredRows)[number], seen: Set<string>) => {
        if (placed.has(svc.id) || seen.has(svc.id)) return;
        seen.add(svc.id);
        for (const depId of prerequisiteOf(svc.id)) {
          const dep = offeredRows.find((r) => r.id === depId);
          if (dep) place(dep, seen);
        }
        if (!placed.has(svc.id)) { placed.add(svc.id); ordered.push(svc); }
      };
      for (const svc of offeredRows) place(svc, new Set());

      launchable = ordered.map((svc) => {
        const promisesFixedPrice = promises.get(svc.id)?.promisesFixedPrice ?? true;
        const needsPrice = promisesFixedPrice && svc.publishedPriceApprovedAt === null;
        const needsCosts = svc.materialCostResolved === false;
        const needsPolicy = svc.unresolvedPolicyKeys.length > 0;
        return {
          id: svc.id, name: svc.name, active: svc.active,
          ready: !needsPrice && !needsCosts && !needsPolicy,
          reason: needsPrice ? "needs an approved price"
            : needsCosts ? "needs its material costs"
            : needsPolicy ? "needs one of your pricing policies decided"
            : null,
        };
      });
    }

    let selection: Awaited<ReturnType<typeof catalogPromises>> | null = null;
    let services: {
      id: string; name: string; categoryName: string | null;
      offered: boolean; active: boolean; promisesFixedPrice: boolean; priceApproved: boolean;
      laborCrewType: "ELECTRICIAN" | "ELECTRICIAN_AND_HELPER";
      pricingPathLabel: string | null;
    }[] = [];
    let templateCount = 0;
    let trades: string[] = [];
    let enrolled: string | null = null;
    let preview: CatalogPreview | null = null;
    let previewError: string | null = null;
    let rateSettings: {
      crewHourRateCents: number | null; electricianHourRateCents: number | null;
      fixtureHeight12Percent: number | null; fixtureHeight14Percent: number | null;
      primaryMinimumCents: number | null; roundingIncrementCents: number | null;
      defaultPermitAdminCents: number | null;
    } | null = null;
    let pricing: ServicePricing[] = [];
    let laborSetupOperations: LaborSetupOperation[] = [];
    let laborServiceReview: ServiceLaborReviewRow[] = [];
    let laborServiceBlockedCount = 0;
    let laborRouteSpecificCount = 0;

    if (current === "services") {
      selection = await catalogPromises(db, ctx.contractorId, { loadCatalog });
      const [rows, derivedApprovals] = await Promise.all([
        db.service.findMany({
          where: { contractorId: ctx.contractorId, slug: { not: { startsWith: "rv2-fixture-" } } },
          select: {
            id: true, slug: true, name: true, offered: true, active: true, laborCrewType: true,
            pricingMethod: true, publishedPriceApprovedAt: true, startingPriceLabel: true,
            contractorCategory: {
              select: { nameOverride: true, canonicalCategory: { select: { slug: true, name: true } } },
            },
          },
          orderBy: { name: "asc" },
        }),
        db.contractorDerivedPricingApproval.findMany({
          where: { contractorId: ctx.contractorId },
          select: { serviceId: true },
        }),
      ]);
      const derivedApprovalServiceIds = new Set(derivedApprovals.map((approval) => approval.serviceId));
      const serviceNameById = new Map(rows.map((service) => [service.id, service.name]));
      services = rows.map((s) => {
        const promise = selection!.get(s.id);
        const handoffNames = (promise?.handoffTargets ?? [])
          .map((id) => serviceNameById.get(id))
          .filter((name): name is string => !!name);
        return {
          id: s.id, name: s.name, offered: s.offered, active: s.active, laborCrewType: s.laborCrewType,
          categoryName: s.contractorCategory
            ? categoryName(requireContractorCategory(s.slug, s.contractorCategory))
            : null,
          promisesFixedPrice: promise?.promisesFixedPrice ?? true,
          priceApproved: s.pricingMethod === "DERIVED_RESOLVED_SCOPE"
            ? derivedApprovalServiceIds.has(s.id)
            : s.publishedPriceApprovedAt !== null,
          pricingPathLabel: handoffNames.length > 0
            ? "Continues to the matching service"
            : !promise?.promisesFixedPrice
              ? (s.startingPriceLabel ? "Starting price shown after review" : "Quote provided after review")
              : null,
        };
      });
    }
    if (current === "trade") {
      templateCount = await db.service.count({
        where: { contractorId: ctx.contractorId, templateVersionId: { not: null } },
      });
      trades = await availableTrades(db);
      const enrolment = await db.contractorTrade.findFirst({
        where: { contractorId: ctx.contractorId }, orderBy: { enrolledAt: "asc" },
      });
      enrolled = enrolment?.tradeKey ?? null;
      if (enrolled) {
        const pre = await preflight(db, ctx.contractorId, templateVersionSource(prisma, enrolled));
        if (pre.ok) preview = pre.preview; else previewError = pre.message;
      }
    }

    if (current === "pricing-foundation") {
      const rawRates = await db.pricingSettings.findUnique({
          where: { contractorId: ctx.contractorId },
          select: {
            crewHourRateCents: true, electricianHourRateCents: true,
            fixtureHeight12Percent: true, fixtureHeight14Percent: true, primaryMinimumCents: true,
            roundingIncrementCents: true, defaultPermitAdminCents: true,
          },
        });
      // The setup step reads these to SUGGEST prices. An undecided field is
      // not a zero, so a partially-configured contractor reads as unset here
      // and is sent to finish the decisions rather than shown a figure. Each
      // of the four columns is nullable in the schema (prisma/schema.prisma,
      // PricingSettings) — the direct-assignment shortcut this block used to
      // be would have widened `rateSettings`'s own type or silently passed a
      // `null` through where a `number` was declared; guarding all four
      // explicitly is what lets `rateSettings` stay non-optional numbers.
      rateSettings = rawRates;
      let settings: unknown = null;
      try { settings = await loadPricingSettings(db as never, ctx.contractorId); } catch { settings = null; }
      if (settings) {
        const [offeredRows, promises, derivedApprovals, serviceNames] = await Promise.all([
          db.service.findMany({
            where: { contractorId: ctx.contractorId, offered: true },
            orderBy: { name: "asc" },
          }),
          catalogPromises(db, ctx.contractorId, { loadCatalog }),
          db.contractorDerivedPricingApproval.findMany({
            where: { contractorId: ctx.contractorId },
            select: { serviceId: true },
          }),
          db.service.findMany({ where: { contractorId: ctx.contractorId }, select: { id: true, name: true } }),
        ]);
        const serviceNameById = new Map(serviceNames.map((service) => [service.id, service.name]));
        const derivedApprovalServiceIds = new Set(derivedApprovals.map((approval) => approval.serviceId));
        pricing = offeredRows.map((svc) => {
          const promisesFixedPrice = promises.get(svc.id)?.promisesFixedPrice ?? true;
          const routePriced = svc.pricingMethod === "DERIVED_RESOLVED_SCOPE";
          const foundation = flatPriceFoundationReadiness(svc);
          const b = promisesFixedPrice && !routePriced && foundation.ready
            ? svc.isPrimaryEligible
              ? suggestPrimaryPrice(svc as never, settings as never)
              : suggestWwtPrice(svc as never, settings as never)
            : null;
          return {
            serviceId: svc.id, slug: svc.slug, name: svc.name,
            active: svc.active,
            laborCrewType: svc.laborCrewType,
            derivedCents: b?.totalCents ?? null,
            publishedCents: svc.basePrice,
            approved: routePriced
              ? derivedApprovalServiceIds.has(svc.id)
              : svc.publishedPriceApprovedAt !== null,
            promisesFixedPrice,
            routePriced,
            routeReviewAvailable: routePriced && routePricingReviewScenario(svc.slug) !== null,
            handoffLabel: (promises.get(svc.id)?.handoffTargets ?? []).length > 0
              ? `Priced through ${serviceNameById.get(promises.get(svc.id)!.handoffTargets[0]) ?? "the matching service"} questions`
              : null,
            breakdown: b && b.totalCents !== null ? formatBreakdown(b) : null,
            priceReviewBlocker: !promisesFixedPrice || routePriced
              ? null
              : !foundation.ready
                ? foundation.message
                : b?.totalCents === null
                  ? b.unavailableReason ?? "Labor setup is incomplete"
                  : null,
            priceReviewBlockerCode: !promisesFixedPrice || routePriced
              ? null
              : !foundation.ready
                ? foundation.code
                : b?.totalCents === null
                  ? "LABOR_INPUTS_MISSING" as const
                  : null,
          };
        });
      }

      if (c.pricingStrategy === "FLAT_RATE") {
        const [savedDecisions, offeredServices, connectedDeviceFacts] = await Promise.all([
          db.contractorLaborOperationDecision.findMany({
            where: { contractorId: ctx.contractorId, trade: "electrical" },
            select: { operationKey: true, hoursPerUnit: true, source: true },
          }),
          db.service.findMany({
            // Setup precedes activation. Hidden selected services must enter
            // labor calibration so they can become launch-ready.
            where: { contractorId: ctx.contractorId, offered: true },
            select: { id: true, slug: true, name: true, bookingType: true, isPrimaryEligible: true, fieldLaborHours: true, wwtLaborHours: true },
            orderBy: { name: "asc" },
          }),
          loadConnectedDeviceLaborFacts(db, ctx.contractorId),
        ]);
        const offeredSlugs = new Set(offeredServices.map((service) => service.slug));
        const affectedServicesByOperation = new Map<string, Set<string>>();
        for (const recipe of ELECTRICAL_ATOMIC_LABOR_RECIPES) {
          const matching = recipe.appliesTo.filter((slug) => offeredSlugs.has(slug));
          if (matching.length === 0) continue;
          for (const line of recipe.lines) {
            const affected = affectedServicesByOperation.get(line.operationKey) ?? new Set<string>();
            for (const slug of matching) affected.add(slug);
            affectedServicesByOperation.set(line.operationKey, affected);
          }
        }
        const decisionsByKey = new Map(savedDecisions.map((decision) => [decision.operationKey, decision]));
        const effectiveDecisions = ELECTRICAL_ATOMIC_LABOR_OPERATIONS.flatMap((operation) => {
          const decision = decisionsByKey.get(operation.key);
          const baseline = electricalPlatformLaborBaselineByOperation.get(operation.key);
          if (!decision && !baseline) return [];
          return [{
            operationKey: operation.key,
            hoursPerUnit: decision?.hoursPerUnit ?? baseline!.hoursPerUnit,
            source: decision?.source ?? "PLATFORM_BASELINE" as const,
          }];
        });
        laborSetupOperations = ELECTRICAL_ATOMIC_LABOR_OPERATIONS.flatMap((operation): LaborSetupOperation[] => {
          const affected = affectedServicesByOperation.get(operation.key);
          if (!affected?.size) return [];
          const decision = decisionsByKey.get(operation.key);
          const baseline = electricalPlatformLaborBaselineByOperation.get(operation.key);
          if (!decision && !baseline) return [];
          return [{
            operationKey: operation.key,
            operationName: operation.name,
            unit: operation.unit,
            includes: operation.includes,
            hoursPerUnit: decision?.hoursPerUnit ?? baseline!.hoursPerUnit,
            source: decision?.source ?? "PLATFORM_BASELINE",
            affectedServiceCount: affected.size,
          }];
        }).sort((a, b) => b.affectedServiceCount - a.affectedServiceCount || a.operationName.localeCompare(b.operationName));
        const operationNames = new Map(ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => [operation.key, operation.name]));
        const pricingByServiceId = new Map(pricing.map((row) => [row.serviceId, row]));
        for (const service of offeredServices) {
          const projection = projectElectricalServiceLabor(
            service.slug,
            effectiveDecisions,
            connectedDeviceFactsForService(service.slug, connectedDeviceFacts),
          );
          if (projection.kind === "READY_FOR_APPROVAL") laborServiceReview.push({
            serviceId: service.id, serviceSlug: service.slug, serviceName: service.name,
            laborContext: service.bookingType === "TROUBLESHOOT_ONLY" ? "PRIMARY" : service.isPrimaryEligible ? "BOTH" : "ADD_ON",
            suggestedHours: projection.suggestedHours,
            currentPrimaryHours: service.fieldLaborHours,
            currentAddOnHours: service.wwtLaborHours,
            lines: projection.projection.lines.map((line) => ({
              operationName: operationNames.get(line.operationKey) ?? line.operationKey,
              quantity: line.quantity, unitHours: line.hoursPerUnit, lineHours: line.hours,
            })),
          });
          else if (projection.kind === "NO_STANDARD_SCOPE") {
            laborRouteSpecificCount += 1;
            const priceRow = pricingByServiceId.get(service.id);
            if (priceRow?.promisesFixedPrice && !priceRow.routePriced) {
              priceRow.priceReviewBlocker = "Route pricing setup pending";
              priceRow.priceReviewBlockerCode = "ROUTE_PRICING_PENDING";
            }
          }
          else if (projection.kind === "BLOCKED") laborServiceBlockedCount += 1;
        }
      }
    }
    const totalServices = await db.service.count({ where: { contractorId: ctx.contractorId } });

    const findingRow = (f: Finding, i: number, stageKey = current) => {
      const href = f.href === "/dashboard/setup"
        ? `/dashboard/setup?stage=${stageKey}`
        : f.href;
      return (
      <li key={i} className="flex items-start gap-2 text-sm">
        <span
          className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
            f.severity === "blocker" ? "bg-red-500" : "bg-amber-400"
          }`}
        />
        <span className="text-slate">
          {findingSummary(f)}
          {href && (
            <Link href={href} className="ml-1 font-medium text-electric hover:underline">
              Fix
            </Link>
          )}
        </span>
      </li>
      );
    };

    const blockersFirst = stage.findings
      .sort((a, b) => (a.severity === "blocker" ? 0 : 1) - (b.severity === "blocker" ? 0 : 1));
    const readinessGroups = (severity: Finding["severity"]) => r.stages
      .map((readinessStage) => ({
        key: readinessStage.key,
        title: readinessStage.title,
        findings: readinessStage.findings.filter((finding) => finding.severity === severity),
      }))
      .filter((group) => group.findings.length > 0);
    const blockerGroups = readinessGroups("blocker");
    const warningGroups = readinessGroups("warning");

    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="font-display text-2xl font-bold text-navy">Set up your storefront</h1>
        <p className="mt-1 text-sm text-slate">
          {complete} of {OPEN_STAGES.length} setup stages complete ·{" "}
          {r.canLaunch ? (
            <span className="font-medium text-success">no launch blockers</span>
          ) : (
            <Link
              href="/dashboard/setup?stage=launch#launch-blockers"
              className="font-medium text-red-600 underline decoration-red-300 underline-offset-2 hover:text-red-700"
            >
              {r.blockers.length} launch blocker{r.blockers.length === 1 ? "" : "s"} remaining
            </Link>
          )}
          {r.warnings.length > 0 && (
            <>
              {" · "}
              <Link
                href="/dashboard/setup?stage=launch#review-items"
                className="font-medium text-slate underline decoration-slate/40 underline-offset-2 hover:text-navy"
              >
                {r.warnings.length} to review
              </Link>
            </>
          )}
        </p>

        <div className="mt-6">
          <SetupStepperNav steps={steps} stageKeys={OPEN_STAGES} current={current} />
        </div>

        <div className="mt-6">
          <main>
            <h2 className="font-display text-xl font-bold text-navy">{stage.title}</h2>

            {current === "business" && (
              <div className="mt-4">
                <BusinessPanel
                  profile={{
                    name: c.name, legalName: c.legalName, phone: c.phone,
                    supportEmail: c.supportEmail, licenseNumber: c.licenseNumber,
                    countryCode: c.countryCode,
                  }}
                  hostedSlug={site?.hostedSlug ?? null}
                />
              </div>
            )}

            {current === "trade" && (
              <div className="mt-4 space-y-4">
                <TradePanel
                  availableTrades={trades}
                  enrolled={enrolled}
                  installedCount={templateCount}
                  preview={preview}
                  previewError={previewError}
                />
                <p className="text-xs text-slate">
                  Your trade&rsquo;s catalog gives you the structure — the questions, the scope rules
                  and what each job includes. What it costs and what you charge stays yours.
                </p>
              </div>
            )}

            {current === "services" && (
              <div className="mt-4 rounded-card border border-cardline bg-white p-5 shadow-card">
                <p className="text-sm text-slate">
                  Choose the services you offer through Price2Book. You can change these anytime
                  later from{" "}
                  <Link href="/dashboard/services" className="text-electric hover:underline">
                    Services
                  </Link>
                  .
                </p>
                <div className="mt-4">
                  <ServiceSelectionList services={services} />
                </div>
              </div>
            )}

            {current === "pricing-foundation" && (
              <div className="mt-4">
                <PricingFoundationPanel
                  settings={rateSettings}
                  services={pricing}
                  setupWork={(
                    <>
                      {c.pricingStrategy === "FLAT_RATE" && (
                        <div id="labor-calibration" className="scroll-mt-6">
                          <LaborSetupPanel operations={laborSetupOperations} services={laborServiceReview} blockedCount={laborServiceBlockedCount} routeSpecificCount={laborRouteSpecificCount} hasCrewRate={!!rateSettings && (rateSettings.crewHourRateCents ?? 0) > 0 && (rateSettings.electricianHourRateCents ?? 0) > 0} />
                        </div>
                      )}
                    </>
                  )}
                />
              </div>
            )}

            {current === "business" && site && (
              <EmbedOriginsControl origins={site.embedOrigins} publicId={site.publicId}
                                   embedOrigin={platformOrigin()} />
            )}

            {stage.key === "scheduling" && (
              <div className="mt-4">
                <SchedulingAuthorityControl
                  authority={c.schedulingAuthority as "NATIVE" | "EXTERNAL" | null}
                />
                {c.schedulingAuthority === "NATIVE" && (
                  <NativeCapacityControl concurrentJobs={c.nativeConcurrentJobs} />
                )}
              </div>
            )}

            {current === "payments" && (
              <div className="mt-4">
                <PaymentsPanel
                  depositing={depositing}
                  depositAmountCents={depositAmountCents}
                  stripeReady={stripe.ready}
                  stripeReason={stripe.reason}
                  findings={stage.findings}
                />
              </div>
            )}

            {current === "launch" && (
              <div className="mt-4">
                <LaunchPanel
                  services={launchable}
                  canLaunch={r.canLaunch}
                  blockerCount={r.blockers.length}
                  blockerHref="#launch-blockers"
                />
              </div>
            )}

            {current === "launch" && blockerGroups.length > 0 && (
              <section id="launch-blockers" className="mt-6 scroll-mt-6 rounded-card border border-red-200 bg-red-50/40 p-5">
                <h3 className="font-display text-lg font-bold text-navy">What is blocking launch</h3>
                <p className="mt-1 text-sm text-slate">Complete these items before putting additional services live.</p>
                <div className="mt-4 space-y-5">
                  {blockerGroups.map((group) => (
                    <div key={group.key}>
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-red-700">{group.title}</h4>
                      <ul className="mt-2 space-y-2">
                        {group.findings.map((finding, index) => findingRow(finding, index, group.key))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {current === "launch" && warningGroups.length > 0 && (
              <section id="review-items" className="mt-6 scroll-mt-6 rounded-card border border-amber-200 bg-amber-50/40 p-5">
                <h3 className="font-display text-lg font-bold text-navy">Worth reviewing</h3>
                <p className="mt-1 text-sm text-slate">These do not stop launch, but they deserve a decision.</p>
                <div className="mt-4 space-y-5">
                  {warningGroups.map((group) => (
                    <div key={group.key}>
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-800">{group.title}</h4>
                      <ul className="mt-2 space-y-2">
                        {group.findings.map((finding, index) => findingRow(finding, index, group.key))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {current !== "launch" && blockersFirst.length > 0 && (
              <section className="mt-6 rounded-card border border-cardline bg-warmwhite p-5">
                <h3 className="text-sm font-semibold text-navy">
                  {stage.findings.some((f) => f.severity === "blocker")
                    ? "Before a homeowner can book"
                    : "Worth a look"}
                </h3>
                <ul className="mt-3 space-y-2">
                  {blockersFirst.map((finding, index) => findingRow(finding, index))}
                </ul>
              </section>
            )}

            {blockersFirst.length === 0
              && (current !== "launch" || (blockerGroups.length === 0 && warningGroups.length === 0)) && (
              <p className="mt-6 text-sm text-success">Nothing outstanding here.</p>
            )}
          </main>
        </div>
      </div>
    );
  });
}
