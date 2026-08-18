import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import ServiceEditForm from "@/components/admin/ServiceEditForm";

export default async function EditServicePage({ params }: { params: { serviceId: string } }) {
  const service = await prisma.service.findUnique({
    where: { id: params.serviceId },
    include: { category: { select: { name: true } } },
  });

  if (!service) return notFound();

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
        }}
      />
    </div>
  );
}
