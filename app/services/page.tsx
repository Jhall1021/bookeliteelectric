import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ServiceIcon } from "@/components/shared/Icons";
import { getCategoryImage } from "@/lib/serviceImages";
import {
  CANONICAL_CATEGORY_SELECT,
  categoryIcon,
  categoryName,
  categorySlug,
  soleContractorId,
} from "@/lib/categories";

export default async function ServicesPage() {
  // ADR-007: rooted at ContractorCategory, the tenant-owned model, so the
  // guard executes here once it is attached. Reading the canonical taxonomy
  // and picking this contractor's rows out of it would be the unsafe
  // direction.
  const contractorId = await soleContractorId(prisma, "the services index");
  const categories = await prisma.contractorCategory.findMany({
    where: { contractorId, active: true },
    orderBy: { sortOrder: "asc" },
    include: {
      canonicalCategory: CANONICAL_CATEGORY_SELECT,
      services: { where: { active: true }, select: { id: true } },
    },
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="font-display text-2xl font-bold text-navy">What can we help you with today?</h1>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {categories.map((cat) => {
          const slug = categorySlug(cat);
          const image = getCategoryImage(slug);
          return (
            <Link
              key={cat.id}
              href={`/services/${slug}`}
              className="overflow-hidden rounded-card border border-cardline bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              {/* Photo band above the text, matching the homepage Popular
                  Services grid. Locked to 4/3 with object-cover so every card
                  in the row is the same height regardless of each photo's
                  native crop. The icon fallback uses the same 4/3 box so a
                  category without art doesn't render a shorter card. */}
              {image ? (
                <div className="relative aspect-[4/3] w-full">
                  <Image
                    src={image.src}
                    alt={image.alt}
                    fill
                    className="object-cover"
                    sizes="(min-width: 768px) 230px, (min-width: 640px) 30vw, 45vw"
                  />
                </div>
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center bg-warmwhite">
                  <ServiceIcon icon={categoryIcon(cat)} className="h-9 w-9 text-electric" />
                </div>
              )}
              <div className="p-4">
                <div className="text-sm font-semibold text-navy">{categoryName(cat)}</div>
                <div className="mt-1 text-xs text-slate">{cat.services.length} services</div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-10 rounded-card border border-cardline bg-navy p-6 text-center text-white">
        <p className="font-medium">Not sure what you need?</p>
        <p className="mt-1 text-sm text-white/70">Tell us what's going on and we'll point you in the right direction.</p>
        <Link
          href="/troubleshooting"
          className="mt-4 inline-block rounded-pill bg-electric px-6 py-2.5 text-sm font-semibold text-white hover:bg-electric-hover"
        >
          I Don't Know What's Wrong
        </Link>
      </div>
    </main>
  );
}
