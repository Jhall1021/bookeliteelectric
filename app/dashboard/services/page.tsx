import Link from "next/link";
import { CANONICAL_CATEGORY_SELECT, categoryName } from "@/lib/categories";
import { withAdminContractor } from "@/lib/adminContext";
import { assessOnboarding, catalogPromises, type Finding } from "@/lib/onboardingReadiness";
import { findingSummary } from "@/lib/setupFindingSummary";
import { describeServicePricing } from "@/lib/servicePricingSummary";
import ServicesCatalogClient, {
  type CategoryGroup, type ServiceRow, type ReviewItem,
} from "@/components/admin/ServicesCatalogClient";

const PRICE_DRIFT_CODES = new Set(["PRICE_DRIFTED"]);
const PRICE_UNAPPROVED_CODES = new Set(["PRICE_NOT_APPROVED", "SUGGESTED_NOT_APPROVED"]);
const LABOR_MISSING_CODES = new Set(["LABOR_INPUTS_MISSING"]);

export default async function AdminServicesPage() {
  // ADR-007: rooted at ContractorCategory, the tenant-owned model.
  // GUARD-ADOPTED (ADR-007a). The hand-written contractorId filter is gone;
  // the guard supplies it centrally.
  return withAdminContractor(async (db, ctx) => {
    const contractorId = ctx.contractorId;

    const [contractor, categories, readiness, promises] = await Promise.all([
      db.contractor.findUniqueOrThrow({ where: { id: contractorId }, select: { pricingStrategy: true } }),
      db.contractorCategory.findMany({
        orderBy: { sortOrder: "asc" },
        include: {
          canonicalCategory: CANONICAL_CATEGORY_SELECT,
          services: {
            // Was ordered by name, which put "200-Amp Service Upgrade" at the top
            // of Panel Upgrades regardless of how rarely anyone books one. Name is
            // the tiebreak now, so services added before ordering existed still
            // sit somewhere predictable.
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            select: {
              id: true, slug: true, name: true, templateKey: true,
              basePrice: true, whileWeThereBasePrice: true, startingPriceLabel: true,
              bookingType: true, active: true, offered: true,
              fieldLaborHours: true, wwtLaborHours: true,
              estimatedMinutes: true, estimatedMinutesReviewed: true,
              materialCostCents: true, materialMultiplier: true,
              publishedPriceApprovedAt: true,
              estimateLowCrewHours: true, estimateHighCrewHours: true, estimateApprovedAt: true,
              _count: { select: { questions: true, materials: true } },
            },
          },
        },
      }),
      // The SAME readiness engine the dashboard uses — a services list that
      // computed its own separate notion of "ready" was how this page and
      // the dashboard's card came to quietly disagree about the same
      // service's state.
      assessOnboarding(db, contractorId),
      catalogPromises(db, contractorId),
    ]);

    const findingsBySlug = new Map<string, Finding[]>();
    for (const f of [...readiness.blockers, ...readiness.warnings]) {
      if (!f.serviceSlug) continue;
      const list = findingsBySlug.get(f.serviceSlug) ?? [];
      list.push(f);
      findingsBySlug.set(f.serviceSlug, list);
    }

    const all = categories.flatMap((c) => c.services);
    const legacyMultiplierCount = all.filter((s) => s.materialMultiplier !== null).length;
    // Matches the dashboard's own ServiceStatusBadge exactly — blockers only,
    // never warnings, so the two surfaces can't quietly disagree about which
    // services count as "needs attention".
    const blockedSlugs = new Set(readiness.blockers.map((f) => f.serviceSlug).filter((s): s is string => !!s));

    const categoryGroups: CategoryGroup[] = categories.map((cat) => ({
      id: cat.id,
      name: categoryName(cat),
      services: cat.services.map((svc): ServiceRow => {
        const findings = findingsBySlug.get(svc.slug) ?? [];
        const codes = new Set(findings.map((f) => f.code));
        const promise = promises.get(svc.id);
        const hasTree = svc._count.questions > 0;

        const approved =
          contractor.pricingStrategy === "TIME_AND_MATERIALS"
            ? svc.estimateApprovedAt !== null
            : svc.publishedPriceApprovedAt !== null;
        const priced =
          contractor.pricingStrategy === "TIME_AND_MATERIALS"
            ? svc.estimateLowCrewHours !== null && svc.estimateHighCrewHours !== null
            : svc.basePrice !== null;

        const pricing = describeServicePricing({
          pricingStrategy: contractor.pricingStrategy,
          promisesFixedPrice: promise?.promisesFixedPrice ?? (svc.bookingType !== "REMOTE_QUOTE"),
          hasTree,
          basePrice: svc.basePrice,
          whileWeThereBasePrice: svc.whileWeThereBasePrice,
          startingPriceLabel: svc.startingPriceLabel,
          publishedPriceApprovedAt: svc.publishedPriceApprovedAt,
          estimateLowCrewHours: svc.estimateLowCrewHours,
          estimateHighCrewHours: svc.estimateHighCrewHours,
          estimateApprovedAt: svc.estimateApprovedAt,
          priceDrifted: [...codes].some((c) => PRICE_DRIFT_CODES.has(c)),
          priceUnapproved: [...codes].some((c) => PRICE_UNAPPROVED_CODES.has(c)),
          laborMissing: [...codes].some((c) => LABOR_MISSING_CODES.has(c)),
        });

        return {
          id: svc.id,
          slug: svc.slug,
          name: svc.name,
          templateKey: svc.templateKey,
          active: svc.active,
          offered: svc.offered,
          categoryId: cat.id,
          bookingTypeLabel: svc.bookingType.replace(/_/g, " ").toLowerCase(),
          fieldLaborHours: svc.fieldLaborHours,
          wwtLaborHours: svc.wwtLaborHours,
          hasWwtPrice: svc.whileWeThereBasePrice !== null,
          estimatedMinutes: svc.estimatedMinutes,
          estimatedMinutesReviewed: svc.estimatedMinutesReviewed,
          materialCount: svc._count.materials,
          materialCostCents: svc.materialCostCents,
          questionCount: svc._count.questions,
          pricing,
          status: {
            active: svc.active,
            approved,
            priced,
            needsAttention: blockedSlugs.has(svc.slug),
          },
        };
      }),
    }));

    const slugToId = new Map(all.map((s) => [s.slug, s.id]));
    const reviewItems: ReviewItem[] = [...readiness.blockers, ...readiness.warnings]
      .filter((f) => f.serviceSlug)
      .map((f) => ({
        text: findingSummary(f),
        serviceId: slugToId.get(f.serviceSlug!) ?? null,
        severity: f.severity,
      }));

    return (
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-navy">Services &amp; Pricing</h1>
            <p className="mt-1 text-sm text-slate">
              Click any service to review its price, labor and questions. Changes apply
              immediately once saved.
            </p>
          </div>
          <Link
            href="/dashboard/services/new"
            className="shrink-0 rounded-pill bg-electric px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover"
          >
            + New Service
          </Link>
        </div>

        <ServicesCatalogClient
          categories={categoryGroups}
          reviewItems={reviewItems}
          legacyMultiplierCount={legacyMultiplierCount}
        />
      </div>
    );
  });
}
