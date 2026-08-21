import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import ServiceEditForm from "@/components/admin/ServiceEditForm";
import TreeEditor from "@/components/admin/TreeEditor";
import PricingPanel from "@/components/admin/PricingPanel";
import MaterialsPanel from "@/components/admin/MaterialsPanel";

export default async function EditServicePage({ params }: { params: { serviceId: string } }) {
  const service = await prisma.service.findUnique({
    where: { id: params.serviceId },
    include: {
      category: { select: { name: true } },
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
  const settings = await prisma.pricingSettings.findUnique({ where: { id: "default" } });

  // For the "link this option's price to another service" dropdown.
  const allServices = await prisma.service.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div>
      <div className="text-sm text-slate">{service.category.name}</div>
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
                targetRateCents: settings.targetRateCents,
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
}
