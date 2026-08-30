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
import { useStructure } from "@/components/theme/ThemeContext";
import { useStorefront } from "@/components/theme/StorefrontContext";

export default function Header() {
  // ADR §2.2 — customer-facing calls carry the storefront identifier.
  //
  // Still optional, but for a smaller reason than before: the header now lives
  // inside the [site] boundary, so on a storefront the context is present and
  // the cart badge works — which it could not while this was a sibling of the
  // provider. The optional form stays for the not-found path.
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

  // Structure, never identity. Two contractors on the same variant render the
  // same markup; nothing here asks who they are.
  const { nav, density } = useStructure();
  const { identity, copy } = useStorefront();
  const stacked = nav === "stacked";
  const pad = density === "spacious" ? "py-6" : density === "compact" ? "py-2" : "py-4";

  const links = (
    <>
      <Link href={`${base}/how-it-works`}>How It Works</Link>
      <Link href={`${base}/services`}>Services &amp; Pricing</Link>
      <Link href={`${base}/why-us`}>Why {identity.shortName}</Link>
      <Link href={`${base}/service-area`}>Service Area</Link>
    </>
  );

  // A contractor with no logo yet gets their name set as a wordmark rather
  // than a broken image or, worse, the last contractor's logo.
  const brand = (
    <Link href={base || "/"} className="flex items-center gap-2">
      {identity.logoUrl ? (
        <Image src={identity.logoUrl} alt={identity.displayName} width={112} height={112} />
      ) : (
        <span className="font-display text-lg font-bold tracking-tight text-ink">
          {identity.displayName}
        </span>
      )}
    </Link>
  );

  // STACKED: the logo centers on its own row and the links sit beneath a rule,
  // spanning the width. A different header, not the same header in new colors.
  if (stacked) {
    return (
      <header className="sticky top-0 z-40 border-b border-line bg-surface">
        <div className={`mx-auto flex max-w-6xl items-center justify-between px-6 ${pad}`}>
          <div className="w-40" aria-hidden />
          {brand}
          <div className="flex w-40 items-center justify-end gap-3">
            <CartLink base={base} itemCount={itemCount} />
          </div>
        </div>
        <div className="border-t border-line">
          <nav className="mx-auto hidden max-w-6xl items-center justify-center gap-10 px-6 py-3 text-sm font-medium tracking-wide text-ink md:flex">
            {links}
            <Link
              href={`${base}/services`}
              className="rounded-pill bg-accent px-5 py-2 text-sm font-semibold text-accent-ink transition hover:bg-accent-hover"
            >
              {copy.headerCta}
            </Link>
          </nav>
        </div>
      </header>
    );
  }

  // SPLIT: the logo sits in the middle of one row with the links divided
  // around it. Symmetrical where INLINE is left-weighted.
  if (nav === "split") {
    return (
      <header className="sticky top-0 z-40 border-b border-line bg-surface">
        <div className={`mx-auto flex max-w-6xl items-center justify-between px-6 ${pad}`}>
          <nav className="hidden flex-1 items-center gap-8 text-sm font-medium text-ink md:flex">
            <Link href={`${base}/how-it-works`}>How It Works</Link>
            <Link href={`${base}/services`}>Services &amp; Pricing</Link>
          </nav>
          {brand}
          <nav className="hidden flex-1 items-center justify-end gap-8 text-sm font-medium text-ink md:flex">
            <Link href={`${base}/why-us`}>Why {identity.shortName}</Link>
            <Link href={`${base}/service-area`}>Service Area</Link>
            <CartLink base={base} itemCount={itemCount} />
          </nav>
          <div className="flex items-center gap-3 md:hidden">
            <CartLink base={base} itemCount={itemCount} />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface">
      <div className={`mx-auto flex max-w-6xl items-center justify-between px-6 ${pad}`}>
        {brand}

        <nav className="hidden gap-8 text-sm font-medium text-ink md:flex">
          {links}
        </nav>

        <div className="flex items-center gap-3">
          <CartLink base={base} itemCount={itemCount} />

          <Link
            href={`${base}/services`}
            className="rounded-pill bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition hover:bg-accent-hover"
          >
            {copy.headerCta}
          </Link>
        </div>
      </div>
    </header>
  );
}

/** Shared by both header shapes — the cart is the same affordance either way. */
function CartLink({ base, itemCount }: { base: string; itemCount: number }) {
  return (
    <Link
      href={`${base}/my-visit`}
      aria-label={`My Visit, ${itemCount} item${itemCount === 1 ? "" : "s"}`}
      className="relative flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink transition hover:border-accent hover:text-accent"
    >
      {/* Simple cart glyph — no icon library dependency needed for one icon. */}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path d="M3 3h2l.4 2M7 13h10l3-8H5.4M7 13L5.4 5M7 13l-2 5h13" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9" cy="20" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="18" cy="20" r="1.4" fill="currentColor" stroke="none" />
      </svg>
      {itemCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-ink">
          {itemCount}
        </span>
      )}
    </Link>
  );
}
