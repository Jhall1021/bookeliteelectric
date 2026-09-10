import Link from "next/link";
import { PORTAL_GROUPS, PORTAL_MODULES } from "@/lib/portalModules";
import { Card } from "@/components/ui/Card";

/**
 * Settings — everything PORTAL_MODULES lists beyond the sidebar's own
 * everyday destinations (Overview, Guided setup, Services & pricing, Photo
 * review, Bookings, Storefront), grouped exactly the way PORTAL_GROUPS
 * already organizes them. Existed before only as a second always-visible
 * row under the old top nav (components/portal/PortalChrome.tsx, retired);
 * every route below is unchanged; only where it's reached from moved.
 */
const PRIMARY_HREFS = new Set([
  "/dashboard", "/dashboard/setup", "/dashboard/services",
  "/dashboard/quotes", "/dashboard/bookings", "/dashboard/design",
]);

export default function SettingsPage() {
  const groups = PORTAL_GROUPS
    .map((g) => ({ ...g, items: PORTAL_MODULES.filter((m) => m.group === g.key && !PRIMARY_HREFS.has(m.href)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-navy">Settings</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate">
        The rest of what you control — rates, policies, availability and how homeowners reach you.
      </p>

      {groups.map((g) => (
        <section key={g.key} className="mt-8">
          <h2 className="font-display text-lg font-bold text-navy">{g.title}</h2>
          <p className="text-sm text-slate">{g.blurb}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((m) => (
              <Link key={m.name} href={m.href} className="block transition hover:-translate-y-0.5">
                <Card>
                  <div className="font-display text-base font-bold text-navy">{m.name}</div>
                  <p className="mt-1 text-sm text-slate">{m.blurb}</p>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
