import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/flow-types";
import { notFound } from "next/navigation";
import { ServiceIcon } from "@/components/shared/Icons";
import { getServiceImage, getCategoryImage } from "@/lib/serviceImages";
import { hasOpenVisit } from "@/lib/visitContext";

export default async function CategoryPage({ params }: { params: { category: string } }) {
  const category = await prisma.serviceCategory.findUnique({
    where: { slug: params.category },
    include: { services: { where: { active: true } } },
  });

  if (!category) return notFound();

  // Once anything is in the visit, every further service is priced at its
  // While We're There rate. Showing the standalone price here and a lower
  // one at checkout would misrepresent what they'd actually pay.
  const addOnPricing = await hasOpenVisit();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/services" className="text-sm text-electric">← All categories</Link>
      <h1 className="mt-4 font-display text-2xl font-bold text-navy">{category.name}</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {category.services.map((svc) => {
          // Falls back to the category's own photo when a service doesn't
          // have bespoke art yet, then to the line icon if neither exists.
          const image = getServiceImage(svc.slug) ?? getCategoryImage(category.slug);
          return (
            <Link
              key={svc.id}
              href={`/services/${category.slug}/${svc.slug}`}
              className="overflow-hidden rounded-card border border-cardline bg-white shadow-card transition hover:border-electric"
            >
              {/* Restructured from the previous horizontal row (36px icon
                  beside the text) to a photo band above the text. A photo
                  scaled to 36px is unreadable, so the icon slot couldn't be
                  reused directly. Locked to 4/3 with object-cover to keep
                  card heights even across the grid. */}
              {image ? (
                <div className="relative aspect-[4/3] w-full">
                  <Image
                    src={image.src}
                    alt={image.alt}
                    fill
                    className="object-cover"
                    sizes="(min-width: 640px) 360px, 90vw"
                  />
                </div>
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center bg-warmwhite">
                  <ServiceIcon icon={svc.icon ?? category.icon} className="h-9 w-9 text-electric" />
                </div>
              )}
              <div className="p-4">
                <div className="text-sm font-semibold text-navy">{svc.name}</div>
                {svc.shortDescription && (
                  <p className="mt-1 text-sm text-slate">{svc.shortDescription}</p>
                )}
                {addOnPricing && svc.whileWeThereBasePrice !== null ? (
                  <div className="mt-2 text-sm font-medium">
                    <span className="text-success">
                      +{formatCents(svc.whileWeThereBasePrice)}
                    </span>
                    {svc.basePrice !== null && svc.basePrice > svc.whileWeThereBasePrice && (
                      <span className="ml-1.5 text-xs text-slate line-through">
                        {formatCents(svc.basePrice)}
                      </span>
                    )}
                    <span className="mt-0.5 block text-xs text-slate">
                      while we&rsquo;re there
                    </span>
                  </div>
                ) : (
                  <div className="mt-2 text-sm font-medium text-navy">
                    {svc.basePrice
                      ? `From ${formatCents(svc.basePrice)}`
                      : svc.startingPriceLabel ?? "Custom Quote"}
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
