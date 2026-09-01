"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useStorefrontBase, useSiteFetchOptional } from "@/components/site/SiteContext";

/**
 * The minimum chrome an embedded storefront needs, and nothing else.
 *
 * The full storefront header repeats what the contractor's own page already
 * says — their name, their navigation, a second "Book Service" button — so an
 * embed rendering it looks like a whole second website bolted into the middle
 * of the first. The observed failure exactly: two identical headers, one above
 * the other.
 *
 * What survives is what the WORKFLOW needs rather than what a standalone site
 * needs: a way back to the catalog, and a visible cart. A homeowner three
 * questions deep has to be able to get out, and has to be able to see that the
 * thing they added is still there.
 *
 * PRESENTATION ONLY. Nothing here decides a price, a route, a visit or a
 * booking; it renders two links whose targets come from the declared surface
 * like every other link.
 */
export default function EmbedChrome() {
  const base = useStorefrontBase();
  const siteFetch = useSiteFetchOptional();
  const pathname = usePathname();
  const [itemCount, setItemCount] = useState(0);

  // Same read the full header does, for the same reason: a homeowner needs to
  // see that what they added is still there. Refreshed on navigation because
  // adding a service is what changes it.
  useEffect(() => {
    let canceled = false;
    (async () => {
      if (!siteFetch) return;
      try {
        const res = await siteFetch("/api/visit");
        const data = await res.json();
        const count = (data.lineItems ?? []).reduce(
          (sum: number, li: { quantity: number }) => sum + li.quantity,
          0
        );
        if (!canceled) setItemCount(count);
      } catch {
        // A cart badge is a nice-to-have; a failed read must not break the page.
      }
    })();
    return () => { canceled = true; };
  }, [siteFetch, pathname]);
  return (
    <div className="flex items-center justify-between border-b border-cardline px-4 py-2.5">
      <Link href={`${base}/services`} className="text-sm font-medium text-electric">
        All services
      </Link>
      <Link
        href={`${base}/my-visit`}
        className="rounded-pill border border-cardline px-3 py-1.5 text-sm font-medium text-navy"
      >
        My Visit{itemCount > 0 ? ` · ${itemCount}` : ""}
      </Link>
    </div>
  );
}
