"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/** The work coming in. */
const OPERATIONS = [
  { href: "/admin/quotes", label: "Quote Review" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/jobber", label: "Jobber" },
];

/** How the catalog and pricing are set up. */
const CONFIGURATION = [
  { href: "/admin/services", label: "Services" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/pricing-settings", label: "Pricing" },
  { href: "/admin/service-area", label: "Service Area" },
  { href: "/admin/business-hours", label: "Hours" },
];

const linkClass = "text-sm text-white/80 transition hover:text-white";

export default function AdminNav() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <header className="border-b border-cardline bg-navy text-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        {/* Two groups, because these are different jobs: the left is the
            work coming in, the right is how the catalog is configured.
            Seven undifferentiated links was a wall.

            Categories and Service Area were both missing — the pages existed
            and were only reachable by typing the URL. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="font-display text-sm font-bold">Elite Admin</span>

          {OPERATIONS.map((l) => (
            <Link key={l.href} href={l.href} className={linkClass}>
              {l.label}
            </Link>
          ))}

          <span aria-hidden className="h-4 w-px bg-white/20" />

          {CONFIGURATION.map((l) => (
            <Link key={l.href} href={l.href} className={linkClass}>
              {l.label}
            </Link>
          ))}
        </div>

        <button onClick={handleLogout} className="text-sm text-white/60 hover:text-white">
          Log Out
        </button>
      </div>
    </header>
  );
}
