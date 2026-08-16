import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/flow-types";
import { notFound } from "next/navigation";

export default async function CategoryPage({ params }: { params: { category: string } }) {
  const category = await prisma.serviceCategory.findUnique({
    where: { slug: params.category },
    include: { services: { where: { active: true } } },
  });

  if (!category) return notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/services" className="text-sm text-electric">← All categories</Link>
      <h1 className="mt-4 font-display text-2xl font-bold text-navy">{category.name}</h1>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {category.services.map((svc) => (
          <Link
            key={svc.id}
            href={`/services/${category.slug}/${svc.slug}`}
            className="rounded-card border border-cardline bg-white p-4 shadow-card transition hover:border-electric"
          >
            <div className="text-sm font-semibold text-navy">{svc.name}</div>
            <div className="mt-1 text-sm text-slate">
              {svc.basePrice
                ? `From ${formatCents(svc.basePrice)}`
                : svc.startingPriceLabel ?? "Custom Quote"}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
