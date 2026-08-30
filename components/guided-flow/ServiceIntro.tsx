"use client";

import Image from "next/image";
import { formatCents } from "@/lib/flow-types";
import { ServiceIcon } from "@/components/shared/Icons";
import { getServiceImage } from "@/lib/serviceImages";
import { useStorefrontBase } from "@/components/site/SiteContext";

type Props = {
  name: string;
  description: string | null;
  basePrice: number | null;
  startingPriceLabel: string | null;
  icon: string | null;
  serviceSlug: string;
  // True when this service has NO decision tree and a fixed base price, so
  // the number on screen is already final. Drives three things at once: the
  // "Starting at" prefix comes off, the disclaimer moves here, and the
  // button books instead of advancing. Add a tree in the admin builder and
  // this flips back on its own — it's derived, never stored.
  directBook: boolean;
  /** Overrides the button wording. See Service.ctaLabel. */
  ctaLabel?: string | null;
  // Service-level caveat. Normally shown by PriceConfirmationCard, but a
  // directBook flow never reaches that screen, so it has to appear here or
  // it would silently vanish on exactly the flat-price services it exists
  // for.
  disclaimer: string | null;
  // True when the customer already has services in their visit, so basePrice
  // above is the While We're There rate rather than the standalone one.
  isAddOn: boolean;
  // The standalone price, shown struck through beside the add-on price so
  // the lower number reads as the discount it is rather than as a different
  // price from the one they saw while browsing.
  standalonePrice: number | null;
  onContinue: () => void;
};

export default function ServiceIntro({
  name,
  description,
  basePrice,
  startingPriceLabel,
  icon,
  serviceSlug,
  directBook,
  ctaLabel,
  disclaimer,
  isAddOn,
  standalonePrice,
  onContinue,
}: Props) {
  // Storefront navigation carries the site slug. These were root paths,
  // working only because the legacy Elite redirects catch them.
  const base = useStorefrontBase();
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
          {/* No questions means no branching means nothing can move this
              number, so "Starting at" would be misleading. Note this
              deliberately overrides startingPriceLabel for these services —
              if a label ever looks ignored, this is why. */}
          {!directBook && "Starting at "}
          <span className="font-display text-lg font-bold text-navy">
            {basePrice !== null ? formatCents(basePrice) : startingPriceLabel ?? "Custom Quote"}
          </span>
          {isAddOn && standalonePrice !== null && basePrice !== null && standalonePrice > basePrice && (
            <span className="ml-2 text-xs text-slate line-through">
              {formatCents(standalonePrice)}
            </span>
          )}
        </div>

        {/* Was "skips the visit fee" and "they'll cost less". Neither
            survives contact with the pricing model: there is no itemized
            visit fee to skip, and a same-visit price isn't always lower —
            a dedicated circuit costs the same either way, because the run,
            the breaker and the testing all happen in full regardless of why
            the van is outside. */}
        {isAddOn ? (
          <p className="mt-1 text-xs text-success">
            Same-visit pricing — you already have a service booked, so this is priced
            for the extra work rather than a whole visit.
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate">
            {directBook
              ? "This price includes getting our crew to your home. Anything you add after it uses our same-visit pricing."
              : "This price includes getting our crew to your home. Anything you add on the next screen uses our same-visit pricing."}
          </p>
        )}

        {directBook && disclaimer && (
          <p className="mt-4 rounded-card bg-warmwhite p-4 text-xs text-slate">{disclaimer}</p>
        )}

        <button
          onClick={onContinue}
          className="mt-6 w-full rounded-pill bg-electric py-3.5 font-semibold text-white transition hover:bg-electric-hover sm:w-auto sm:px-10"
        >
          {directBook && basePrice !== null
            ? `${ctaLabel ?? "Add to My Visit"} — ${formatCents(basePrice)}`
            : "Get My Price"}
        </button>

        <p className="mt-4 text-xs text-slate">
          Not what you're looking for? <a href={`${base}/services`} className="text-electric">Browse all services</a>
        </p>
      </div>
    </div>
  );
}
