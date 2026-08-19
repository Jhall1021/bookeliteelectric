"use client";

import Image from "next/image";
import { formatCents } from "@/lib/flow-types";
import { ServiceIcon } from "@/components/shared/Icons";
import { getServiceImage } from "@/lib/serviceImages";

type Props = {
  name: string;
  description: string | null;
  basePrice: number | null;
  startingPriceLabel: string | null;
  icon: string | null;
  serviceSlug: string;
  onContinue: () => void;
};

export default function ServiceIntro({
  name,
  description,
  basePrice,
  startingPriceLabel,
  icon,
  serviceSlug,
  onContinue,
}: Props) {
  // Per the Visual Design Handoff: a bespoke lifestyle image showing the
  // finished result, when one exists for this service — falls back to the
  // original icon-only layout otherwise, so this degrades gracefully for
  // the ~65 services that don't have bespoke art yet.
  const image = getServiceImage(serviceSlug);

  return (
    <div className="overflow-hidden rounded-card border border-cardline bg-white shadow-card">
      {image && (
        <div className="relative w-full" style={{ aspectRatio: image.aspectRatio }}>
          <Image
            src={image.src}
            alt={image.alt}
            fill
            priority
            className="object-cover"
            sizes="(min-width: 768px) 600px, 100vw"
          />
        </div>
      )}

      <div className="p-8">
        <ServiceIcon icon={icon} className="h-12 w-12 text-electric" />
        <h1 className="mt-4 font-display text-2xl font-bold text-navy">{name}</h1>

        {description && <p className="mt-3 text-slate">{description}</p>}

        <div className="mt-6 text-sm text-slate">
          Starting at{" "}
          <span className="font-display text-lg font-bold text-navy">
            {basePrice ? formatCents(basePrice) : startingPriceLabel ?? "Custom Quote"}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate">
          This price includes our visit to your home. Add more services on the next screen and
          they'll cost less — no second visit fee.
        </p>

        <button
          onClick={onContinue}
          className="mt-6 w-full rounded-pill bg-electric py-3.5 font-semibold text-white transition hover:bg-electric-hover sm:w-auto sm:px-10"
        >
          Get My Price
        </button>

        <p className="mt-4 text-xs text-slate">
          Not what you're looking for? <a href="/services" className="text-electric">Browse all services</a>
        </p>
      </div>
    </div>
  );
}
