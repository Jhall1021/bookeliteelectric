import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import ServiceEditForm from "@/components/admin/ServiceEditForm";
import TreeEditor from "@/components/admin/TreeEditor";
import PricingPanel from "@/components/admin/PricingPanel";
import MaterialsPanel from "@/components/admin/MaterialsPanel";
import { categoryName, requireContractorCategory } from "@/lib/categories";
import { withAdminContractor } from "@/lib/adminContext";

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
            include: { referencedService: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });

  if (!service) return notFound();

  // Single global row. Null only if pricing has never been configured, in
  // which case the panel says so rather than showing a price built on
  // defaults nobody chose.
  // ADR-007a: PricingSettings carries contractorId and is tenant-scoped. This
  // read used `where: { id: "default" }` — the pre-tenant singleton row — so
  // with two contractors every admin surface would have read the same
  // settings regardless of who was asking. Keyed by contractor now, on the
  // guarded client.
  const settings = await db.pricingSettings.findUnique({ where: { contractorId } });

  // For the "link this option's price to another service" dropdown.
  const allServices = await db.service.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div>
      <div className="text-sm text-slate">
        {categoryName(requireContractorCategory(service.slug, service.contractorCategory))}
      </div>
      <h1 className="mt-1 font-display text-2xl font-bold text-navy">{service.name}</h1>

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

      <MaterialsPanel serviceId={service.id} />

      {/* Rendered unconditionally now. It used to be hidden when a service
          had no questions, which meant the one case you'd want a tree builder
          for — a service with no tree — was the one case it never appeared
          in. The editor shows its own empty state instead. */}
      <TreeEditor
        serviceId={service.id}
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
            nextQuestionId: o.nextQuestionId,
            disclaimer: o.disclaimer,
            requiredPhotoLabels: o.requiredPhotoLabels,
            photosBlockBooking: o.photosBlockBooking,
          })),
        }))}
        allServices={allServices}
      />
    </div>
  );
  });
}
