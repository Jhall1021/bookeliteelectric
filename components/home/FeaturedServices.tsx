"use client";

import Image from "next/image";
import Link from "next/link";
import { ServiceIcon } from "@/components/shared/Icons";
import { useStructure } from "@/components/theme/ThemeContext";

/**
 * A set of services, as tiles or as rows — ADR-015 Phase 3.
 *
 * GRID is six cards across, image-led: the picture is most of the card and the
 * name sits under it. Browsing by recognition.
 *
 * ROWS is one service per full-width line, name-led, with a thumbnail at the
 * left and the price aligned right. Scanning a list.
 *
 * Same services, same links, same prices. Different page.
 */
export type FeaturedItem = {
  slug: string;
  label: string;
  href: string;
  price: string;
  icon: string;
  image: { src: string; alt: string } | null;
};

export default function FeaturedServices({ items }: { items: FeaturedItem[] }) {
  const { serviceList, card } = useStructure();
  // `raised` cards lift off the page; `outlined` sit in it. The two treatments
  // are mutually exclusive on purpose — a bordered card with a heavy shadow
  // reads as a mistake rather than a choice.
  const surface = card === "raised"
    ? "bg-surface shadow-card transition hover:shadow-raised"
    : "border border-line bg-surface shadow-card transition hover:-translate-y-0.5";

  if (serviceList === "rows") {
    return (
      <ul className="mt-8 space-y-3">
        {items.map((s) => (
          <li key={s.slug}>
            <Link href={s.href}
                  className={`flex items-center gap-5 overflow-hidden rounded-card px-4 py-3 ${surface}`}>
              <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-card">
                {s.image ? (
                  <Image src={s.image.src} alt={s.image.alt} fill className="object-cover" sizes="96px" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-canvas">
                    <ServiceIcon icon={s.icon} className="h-7 w-7 text-accent" />
                  </div>
                )}
              </div>
              <span className="min-w-0 flex-1 font-display text-base font-semibold text-ink">{s.label}</span>
              <span className="shrink-0 text-sm font-medium text-muted">{s.price}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      {items.map((s) => (
        <Link key={s.slug} href={s.href} className={`overflow-hidden rounded-card ${surface}`}>
          {/* Every card locks to 4/3 rather than using each image's native
              ratio. Six cards side by side need a uniform height, and the
              source photos range from about 0.87 to 1.78 — letting them vary
              made the row ragged. The icon fallback matches the same box so a
              service without a photo is not a shorter card than its neighbors.

              ServiceIntro still honors each image's native ratio; that screen
              has the room, and preserving the provided crop is why the field
              exists. Only this grid is constrained. */}
          {s.image ? (
            <div className="relative aspect-[4/3] w-full">
              <Image src={s.image.src} alt={s.image.alt} fill className="object-cover"
                     sizes="(min-width: 1024px) 180px, (min-width: 768px) 30vw, 45vw" />
            </div>
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center bg-canvas">
              <ServiceIcon icon={s.icon} className="h-10 w-10 text-accent" />
            </div>
          )}
          <div className="p-4">
            {/* The short marketing label, not the catalog name — "TV Mount
                Installation" reads better on a tile than "Professional TV
                Installation". */}
            <div className="text-sm font-semibold text-ink">{s.label}</div>
            <div className="mt-1 text-sm text-muted">{s.price}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}
