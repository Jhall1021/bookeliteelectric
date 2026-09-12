import Link from "next/link";
import { PORTAL_GROUPS, PORTAL_MODULES } from "@/lib/portalModules";

const PRIMARY_HREFS = new Set([
  "/dashboard", "/dashboard/setup", "/dashboard/services",
  "/dashboard/quotes", "/dashboard/bookings", "/dashboard/design",
]);

export default function SettingsPage() {
  const groups = PORTAL_GROUPS
    .map((g) => ({ ...g, items: PORTAL_MODULES.filter((m) => m.group === g.key && !PRIMARY_HREFS.has(m.href)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-electric">Account & configuration</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-navy">Settings</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate">
            Manage the business rules behind Price2Book — your rates, policies, availability, payments, integrations, and how customers reach you.
          </p>
        </div>
        <Link
          href="/dashboard/setup"
          className="inline-flex shrink-0 items-center justify-center rounded-pill border border-cardline bg-white px-4 py-2.5 text-sm font-semibold text-navy shadow-sm transition hover:border-electric hover:text-electric"
        >
          Review guided setup
        </Link>
      </header>

      <div className="mt-7 space-y-8">
        {groups.map((g) => (
          <section key={g.key} className="overflow-hidden rounded-card border border-cardline bg-white shadow-card">
            <div className="border-b border-cardline bg-warmwhite/55 px-5 py-4 sm:px-6">
              <h2 className="font-display text-lg font-bold text-navy">{g.title}</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate">{g.blurb}</p>
            </div>

            <div className="grid gap-px bg-cardline sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((m) => (
                <Link
                  key={m.name}
                  href={m.href}
                  className="group flex min-h-36 flex-col bg-white p-5 transition hover:bg-electric/[0.025] sm:p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-navy transition group-hover:text-electric">{m.name}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate">{m.blurb}</p>
                    </div>
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cardline text-sm text-slate transition group-hover:border-electric/30 group-hover:bg-electric/5 group-hover:text-electric" aria-hidden="true">
                      →
                    </span>
                  </div>
                  <span className="mt-auto pt-4 text-xs font-semibold text-electric opacity-0 transition group-hover:opacity-100">Open settings</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
