"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  useSiteFetchOptional,
  useSiteOptional,
  useStorefrontBase,
} from "@/components/site/SiteContext";

export default function Header() {
  // ADR §2.2 — customer-facing calls carry the storefront identifier.
  //
  // OPTIONAL here: the header sits in the ROOT layout, above [site], so it
  // also renders on /admin and the not-found page where there is no
  // storefront — and no cart to count.
  const siteFetch = useSiteFetchOptional();
  const site = useSiteOptional();
  // Storefront links must carry the site slug. They used to be root paths,
  // which worked only because the legacy Elite redirects caught them — so the
  // chrome silently assumed one tenant owned the root namespace, and would
  // have broken outright the day those redirects came out.
  const base = useStorefrontBase();
  const pathname = usePathname();
  const [itemCount, setItemCount] = useState(0);

  async function refreshCount() {
    if (!siteFetch) return;
    try {
      const res = await siteFetch("/api/visit");
      const data = await res.json();
      const count = (data.lineItems ?? []).reduce(
        (sum: number, li: { quantity: number }) => sum + li.quantity,
        0
      );
      setItemCount(count);
    } catch {
      // Cart badge is a nice-to-have — a failed fetch shouldn't break the page.
    }
  }

  useEffect(() => {
    refreshCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Re-check whenever the route changes, so adding an item on a service
    // page and then navigating updates the badge without a full reload.
  }, [pathname, siteFetch]);

  return (
    <header className="sticky top-0 z-40 border-b border-cardline bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href={base || "/"} className="flex items-center gap-2">
          <Image src="/images/elite-logo.png" alt="Elite Electric & Lighting" width={112} height={112} />
        </Link>

        <nav className="hidden gap-8 text-sm font-medium text-navy md:flex">
          <Link href={`${base}/how-it-works`}>How It Works</Link>
          <Link href={`${base}/services`}>Services &amp; Pricing</Link>
          <Link href={`${base}/why-elite`}>Why Elite</Link>
          <Link href={`${base}/service-area`}>Service Area</Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href={`${base}/my-visit`}
            aria-label={`My Visit, ${itemCount} item${itemCount === 1 ? "" : "s"}`}
            className="relative flex h-10 w-10 items-center justify-center rounded-full border border-cardline text-navy transition hover:border-electric hover:text-electric"
          >
            {/* Simple cart glyph — no icon library dependency needed for one icon. */}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
              <path d="M3 3h2l.4 2M7 13h10l3-8H5.4M7 13L5.4 5M7 13l-2 5h13" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="9" cy="20" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="18" cy="20" r="1.4" fill="currentColor" stroke="none" />
            </svg>
            {itemCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-electric text-xs font-semibold text-white">
                {itemCount}
              </span>
            )}
          </Link>

          <Link
            href={`${base}/services`}
            className="rounded-pill bg-electric px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover"
          >
            Book Service
          </Link>
        </div>
      </div>
    </header>
  );
}
