import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import ServiceEditForm from "@/components/admin/ServiceEditForm";
import TreeEditor from "@/components/admin/TreeEditor";

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

      {service.questions.length > 0 && (
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
              disclaimer: o.disclaimer,
              requiredPhotoLabels: o.requiredPhotoLabels,
              photosBlockBooking: o.photosBlockBooking,
            })),
          }))}
          allServices={allServices}
        />
      )}
    </div>
  );
}
