import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ServiceIcon } from "@/components/shared/Icons";
import { getCategoryImage } from "@/lib/serviceImages";

export default async function ServicesPage() {
  const categories = await prisma.serviceCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: { services: { where: { active: true }, select: { id: true } } },
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="font-display text-2xl font-bold text-navy">What can we help you with today?</h1>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {categories.map((cat) => {
          const image = getCategoryImage(cat.slug);
          return (
            <Link
              key={cat.id}
              href={`/services/${cat.slug}`}
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
                  <ServiceIcon icon={cat.icon} className="h-9 w-9 text-electric" />
                </div>
              )}
              <div className="p-4">
                <div className="text-sm font-semibold text-navy">{cat.name}</div>
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
