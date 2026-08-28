"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/lib/authClient";
import { PORTAL_MODULES } from "@/lib/portalModules";

/**
 * The portal's own chrome — Price2Book-branded, deliberately.
 *
 * The storefront wears the CONTRACTOR's identity and their chosen design. The
 * portal wears Price2Book's. They are two different products with two
 * different audiences, and a portal that adopted each contractor's palette
 * would make it ambiguous whose software this is — which matters most on the
 * screen where a contractor is deciding what their customers will see.
 *
 * Blue/navy throughout, per the approved colour system: core product,
 * pricing, scheduling, configuration and contractor control. Green is reserved
 * for While We're There™, availability and positive states, so it is not spent
 * on navigation.
 *
 * The contractor's name is shown, always. This account can belong to more than
 * one contractor and nothing is ever selected implicitly, so "which business
 * am I changing" must never be a question the screen leaves open.
 */
const PRIMARY = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/services", label: "Services & Pricing" },
  { href: "/dashboard/quotes", label: "Photo Review" },
  { href: "/dashboard/bookings", label: "Bookings" },
  { href: "/dashboard/design", label: "Storefront" },
];

export default function PortalChrome(
  { contractorName, storefrontHref }: { contractorName: string; storefrontHref: string | null },
) {
  const router = useRouter();
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
    <header className="bg-navy text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
        <Link href="/dashboard" className="font-display text-base font-bold tracking-tight">
          Price2Book
        </Link>

        {/* Which business this account is acting for. Not decoration. */}
        <span className="rounded-pill bg-white/10 px-3 py-1 text-xs font-semibold">
          {contractorName}
        </span>

        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          {PRIMARY.map((l) => (
            <Link key={l.href} href={l.href}
                  className={active(l.href) ? "font-semibold text-white" : "text-white/75 transition hover:text-white"}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4 text-sm">
          {storefrontHref && (
            <a href={storefrontHref} target="_blank" rel="noopener" className="text-white/75 transition hover:text-white">
              View storefront ↗
            </a>
          )}
          <button
            type="button"
            onClick={async () => { await signOut(); router.push("/sign-in"); router.refresh(); }}
            className="text-white/75 transition hover:text-white"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Everything else, one row down. The primary row is what a contractor
          opens the portal to do; this is what they configure occasionally. */}
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-x-5 gap-y-2 px-6 py-2 text-xs text-white/65">
          {PORTAL_MODULES
            .filter((m) => !PRIMARY.some((p) => p.href === m.href))
            .map((m) => (
              <Link key={m.name} href={m.href} className="transition hover:text-white">{m.name}</Link>
            ))}
        </div>
      </div>
    </header>
  );
}
