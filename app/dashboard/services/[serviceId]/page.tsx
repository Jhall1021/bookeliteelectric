import { notFound } from "next/navigation";
import ServiceEditForm from "@/components/admin/ServiceEditForm";
import PricingPanel from "@/components/admin/PricingPanel";
import MaterialsPanel from "@/components/admin/MaterialsPanel";
import PreWorkDepositPanel from "@/components/admin/PreWorkDepositPanel";
import GuidedPricingWorkspace from "@/components/admin/questions/GuidedPricingWorkspace";
import ServiceWorkspace from "@/components/admin/ServiceWorkspace";
import { connectReadiness } from "@/lib/stripeConnect";
import { categoryName, requireContractorCategory } from "@/lib/categories";
import { withAdminContractor } from "@/lib/adminContext";
import { assessOnboarding } from "@/lib/onboardingReadiness";
import { findTroubleshootingService } from "@/lib/troubleshooting";

export default async function EditServicePage({ params }: { params: { serviceId: string } }) {
  // GUARD-ADOPTED (ADR-007a). Took a service id from the URL unscoped; the
  // notFound() below now covers "not yours" as well as "not there".
  return withAdminContractor(async (db, ctx) => {
  const contractorId = ctx.contractorId;
  const service = await db.service.findUnique({
    where: { id: params.serviceId },
    include: {
      contractorCategory: {
        select: {
          nameOverride: true,
          canonicalCategory: { select: { slug: true, name: true, defaultIcon: true } },
        },
      },
      questions: {
        orderBy: { order: "asc" },
        include: {
          options: {
            orderBy: { order: "asc" },
            include: {
              referencedService: { select: { id: true, name: true } },
              // rerouteServiceId is a plain string with no foreign key
              // (prisma/schema.prisma) — resolved below via `allServices`
              // instead of a relation include.
            },
          },
        },
      },
    },
  });

  if (!service) return notFound();

  const contractor = await db.contractor.findUniqueOrThrow({
    where: { id: contractorId },
    select: {
      pricingStrategy: true,
      depositAmountCents: true,
      stripeAccountId: true, stripeMerchantConfigured: true, stripeCardPaymentsStatus: true,
      stripeOnboardingBlocked: true, stripeReadinessCheckedAt: true,
    },
  });

  // Single global row. Null only if pricing has never been configured, in
  // which case the panel says so rather than showing a price built on
  // defaults nobody chose.
  const settings = await db.pricingSettings.findUnique({ where: { contractorId } });

  // For the "link this option's price to another service" / "reroute to"
  // dropdowns.
  const allServices = await db.service.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // The SAME readiness engine the catalog and dashboard use, so this
  // service's header status can never quietly disagree with either.
  const readiness = await assessOnboarding(db, contractorId);
  const serviceBlockers = readiness.blockers.filter((f) => f.serviceSlug === service.slug);
  const approved =
    contractor.pricingStrategy === "TIME_AND_MATERIALS"
      ? service.estimateApprovedAt !== null
      : service.publishedPriceApprovedAt !== null;
  const priced =
    contractor.pricingStrategy === "TIME_AND_MATERIALS"
      ? service.estimateLowCrewHours !== null && service.estimateHighCrewHours !== null
      : service.basePrice !== null;

  // Only resolved when the tree actually uses it — the same one-lookup
  // discipline lib/routeResolver.ts's loadServiceForResolution follows.
  const hasTroubleshootingRoute = service.questions.some((q) =>
    q.options.some((o) => o.routeAction === "REROUTE_TROUBLESHOOTING")
  );
  let troubleshootingServiceName: string | null = null;
  if (hasTroubleshootingRoute && service.tradeKey) {
    const found = await findTroubleshootingService(db, contractorId, service.tradeKey);
    if (found.ok) troubleshootingServiceName = found.service.name;
  }

  const catName = categoryName(requireContractorCategory(service.slug, service.contractorCategory));
  const serviceNameById = new Map(allServices.map((s) => [s.id, s.name]));

  return (
    <ServiceWorkspace
      categoryName={catName}
      name={service.name}
      templateKey={service.templateKey}
      status={{
        active: service.active,
        approved,
        priced,
        needsAttention: serviceBlockers.length > 0,
      }}
      overview={
        <ServiceEditForm
          service={{
            id: service.id,
            name: service.name,
            shortDescription: service.shortDescription,
            disclaimer: service.disclaimer,
            basePrice: service.basePrice,
            whileWeThereBasePrice: service.whileWeThereBasePrice,
            startingPriceLabel: service.startingPriceLabel,
            active: service.active,
            bookingType: service.bookingType,
            hasTree: service.questions.length > 0,
          }}
        />
      }
      pricing={
        <div className="space-y-6">
          <PricingPanel
            serviceId={service.id}
            publishedBaseCents={service.basePrice}
            publishedWwtCents={service.whileWeThereBasePrice}
            publishedApprovedAt={service.publishedPriceApprovedAt?.toISOString() ?? null}
            estimatedMinutes={service.estimatedMinutes}
            estimatedMinutesReviewed={service.estimatedMinutesReviewed}
            requiresTechCount={service.requiresTechCount}
            fieldLaborHours={service.fieldLaborHours}
            wwtLaborHours={service.wwtLaborHours}
            materialCostCents={service.materialCostCents}
            materialMultiplier={service.materialMultiplier}
            permitAdminCents={service.permitAdminCents}
            otherDirectCostCents={service.otherDirectCostCents}
            isPrimaryEligible={service.isPrimaryEligible}
            photoState={service.photoState}
            legacyPrimaryUnits={service.primaryLaborUnits}
            settings={
              settings
                ? {
                    crewHourRateCents: settings.crewHourRateCents,
                    primaryMinimumCents: settings.primaryMinimumCents,
                    roundingIncrementCents: settings.roundingIncrementCents,
                    defaultPermitAdminCents: settings.defaultPermitAdminCents,
                  }
                : null
            }
          />
          <PreWorkDepositPanel
            serviceId={service.id}
            requiresPreWorkVisit={service.requiresPreWorkVisit}
            preWorkVisitMinutes={service.preWorkVisitMinutes}
            depositRule={service.depositRule}
            companyDepositAmountCents={contractor.depositAmountCents}
            depositCreditsToJob={service.depositCreditsToJob}
            ctaLabel={service.ctaLabel}
            preWorkCustomerNote={service.preWorkCustomerNote}
            stripeReady={connectReadiness(contractor).ready}
          />
        </div>
      }
      materials={<MaterialsPanel serviceId={service.id} />}
      questions={
        <GuidedPricingWorkspace
          serviceId={service.id}
          troubleshootingServiceName={troubleshootingServiceName}
          questions={service.questions.map((q) => ({
            id: q.id,
            prompt: q.prompt,
            helpText: q.helpText,
            options: q.options.map((o) => ({
              id: o.id,
              label: o.label,
              routeAction: o.routeAction,
              priceModifierCents: o.priceModifierCents,
              referencedServiceId: o.referencedServiceId,
              referencedServiceName: o.referencedService?.name ?? null,
              rerouteServiceId: o.rerouteServiceId,
              rerouteServiceName: o.rerouteServiceId ? serviceNameById.get(o.rerouteServiceId) ?? null : null,
              nextQuestionId: o.nextQuestionId,
              disclaimer: o.disclaimer,
              requiredPhotoLabels: o.requiredPhotoLabels,
              photosBlockBooking: o.photosBlockBooking,
            })),
          }))}
          allServices={allServices}
        />
      }
    />
  );
  });
}
