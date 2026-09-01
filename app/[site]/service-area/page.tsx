"use client";

import Image from "next/image";
import Link from "next/link";
import { useIdentity, usePricingCopy } from "@/components/theme/StorefrontContext";
import { storefrontBaseFor } from "@/lib/storefrontSurface";

/**
 * Where the contractor works — ADR-016.
 *
 * This page named Monmouth and Ocean Counties in a heading, a paragraph and an
 * image's alt text, and shipped a New Jersey map. A contractor in Arizona
 * provisioned from the template inherited all four.
 *
 * The ZIP gate at checkout is unchanged and still authoritative — ServiceArea
 * rows decide who can book. This page is the sentence a homeowner reads, and
 * a contractor who has not written one gets a page that does not pretend to
 * know their territory.
 */
export default function ServiceAreaPage({ params }: { params: { site: string } }) {
  // Every link below is built from the SURFACE, never from the raw segment.
  const base = storefrontBaseFor(params.site);
  const id = useIdentity();
  const copy = usePricingCopy();
  const area = id.serviceArea;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h1 className="font-display text-3xl font-bold text-ink">
        {area ? `Proudly Serving ${area.label}` : "Our Service Area"}
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-muted">
        {area
          ? `We're currently booking residential electrical service throughout ${area.label}, with more service areas planned as we grow.`
          : "Enter your ZIP code at checkout and we'll confirm whether you're inside our current service area."}
      </p>

      {area?.imageUrl ? (
        <div className="relative mx-auto mt-8 h-96 w-96 max-w-full">
          <Image src={area.imageUrl} alt={area.imageAlt} fill className="object-contain"
                 sizes="(min-width: 768px) 384px, 90vw" />
        </div>
      ) : null}

      <div className="mt-10">
        <Link
          href={`${base}/services`}
          className="inline-block rounded-pill bg-accent px-7 py-3 font-semibold text-accent-ink transition hover:bg-accent-hover"
        >
          {copy.primaryCta}
        </Link>
      </div>
    </main>
  );
}
