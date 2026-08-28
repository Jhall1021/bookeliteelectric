"use client";

import Image from "next/image";
import Link from "next/link";
import { useStorefrontBase } from "@/components/site/SiteContext";
import { useIdentity } from "@/components/theme/StorefrontContext";

/**
 * The footer is where a storefront states who it belongs to — ADR-016.
 *
 * Every line here used to be Elite's, written into the component: their logo,
 * their name, their street, their phone, their New Jersey licence number. A
 * provisioned contractor inherited all of it, which meant the theme system
 * could give them their own composition and their own colour while the footer
 * still published somebody else's licence.
 *
 * Everything now comes from contractor configuration, and anything incomplete
 * is OMITTED rather than defaulted. A missing address renders no address; it
 * must never render the previous tenant's.
 */
export default function Footer() {
  // Same reasoning as the header: storefront links carry the site slug.
  const base = useStorefrontBase();
  const id = useIdentity();

  return (
    <footer className="bg-ink-strong py-12 text-accent-ink">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div>
            {id.logoWhiteUrl ? (
              <Image src={id.logoWhiteUrl} alt={id.displayName} width={44} height={44} className="mb-4 invert" />
            ) : null}
            <div className="text-sm font-semibold text-accent-ink">{id.displayName}</div>

            {id.address ? (
              <address className="mt-2 text-sm not-italic text-accent-ink/70">
                {id.address.line1}
                <br />
                {id.address.line2 ? (<>{id.address.line2}<br /></>) : null}
                {id.address.cityStateZip}
              </address>
            ) : null}

            {id.phone && id.phoneHref ? (
              <div className="mt-2 text-sm text-accent-ink/70">
                <a href={`tel:${id.phoneHref}`} className="hover:text-accent-ink">{id.phone}</a>
              </div>
            ) : null}

            {id.email ? (
              <div className="mt-2 text-sm text-accent-ink/70">
                <a href={`mailto:${id.email}`} className="hover:text-accent-ink">{id.email}</a>
              </div>
            ) : null}

            {id.license ? (
              <div className="mt-2 text-xs text-accent-ink/50">{id.license}</div>
            ) : null}
          </div>

          <nav className="flex flex-col gap-2 text-sm text-accent-ink/70 sm:items-end">
            <Link href={`${base}/how-it-works`} className="hover:text-accent-ink">How It Works</Link>
            <Link href={`${base}/services`} className="hover:text-accent-ink">Services &amp; Pricing</Link>
            <Link href={`${base}/why-us`} className="hover:text-accent-ink">Why {id.shortName}</Link>
            <Link href={`${base}/service-area`} className="hover:text-accent-ink">Service Area</Link>
          </nav>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-accent-ink/10 pt-6 text-xs text-accent-ink/50">
          <span>© {new Date().getFullYear()} {id.legalName}. All rights reserved.</span>
          {/* Required by SimpleMaps' free licence: their ZIP database powers
              the service-area check at checkout, and using the Basic tier
              obliges a visible link on a page reachable from the root.
              If the ZIP reference data is ever sourced elsewhere, this link
              should go with it. */}
          <a href="https://simplemaps.com/data/us-zips" className="hover:text-accent-ink/80" rel="noopener">
            ZIP code data by SimpleMaps
          </a>
        </div>
      </div>
    </footer>
  );
}
