import Link from "next/link";
import { platformOverview } from "@/lib/platformReadModel";
import { ContractorTable } from "@/components/platform/ContractorTable";

export const dynamic = "force-dynamic";

/**
 * Platform Overview — the cross-tenant picture, read the only way it may be.
 *
 * Every number here is a sum over contractors each entered through its own
 * guarded door; nothing on this page is a query with no tenant. Facts, not
 * vanity metrics: each tile says what it counts, and the list beneath is the
 * strictly actionable "Attention needed", not every warning the software can
 * enumerate.
 */
export default async function PlatformOverviewPage() {
  const o = await platformOverview();
  return (
    <div>
      <header>
        <h1 className="font-display text-2xl font-bold text-navy">Platform overview</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate">
          {o.contractors.total} contractor{o.contractors.total === 1 ? "" : "s"} on the platform. Every figure below is read one
          contractor at a time, through the same boundary their own dashboards use.
        </p>
      </header>

      <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Contractors with live services" value={o.contractors.live} note={`${o.contractors.inSetup} still in setup · ${o.contractors.enabled} enabled`} href="/platform/contractors" />
        <Tile label="Live services, all contractors" value={o.services.live} note="priced and bookable, or quote-only" />
        <Tile label="Storefronts live" value={o.storefronts.hosted} note={`${o.storefronts.embedConfigured} with embed origins configured`} />
        <Tile label="Needs somebody today" value={o.attention.length} note={o.attention.length ? "see the list below" : "nothing actionable"} href="/platform/attention" tone={o.attention.length ? "attention" : "calm"} />
      </dl>

      <section className="mt-10">
        <h2 className="font-display text-lg font-bold text-navy">Attention needed</h2>
        {o.attention.length === 0 ? (
          <p className="mt-2 text-sm text-slate">Nothing needs a person at Price2Book today.</p>
        ) : (
          <ul className="mt-3 divide-y divide-cardline rounded-card border border-cardline bg-white">
            {o.attention.map((a) => (
              <li key={`${a.contractorId}:${a.code}`} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
                <div>
                  <span className="font-medium text-navy">{a.name}</span>
                  <span className="ml-2 rounded-pill bg-p2b-amber-tint px-2 py-0.5 text-xs font-medium text-p2b-amber-ink">{a.code.replaceAll("_", " ").toLowerCase()}</span>
                  <p className="mt-1 text-slate">{a.message}</p>
                </div>
                <Link href={a.href} className="shrink-0 font-medium text-electric hover:underline">Open</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg font-bold text-navy">Contractors</h2>
        <ContractorTable rows={o.rows} />
      </section>

      <p className="mt-10 text-xs text-slate">
        Signed in as {o.actor.email}, {o.actor.role}. This surface reads; it does not change anything.
      </p>
    </div>
  );
}

function Tile({ label, value, note, href, tone = "calm" }: { label: string; value: number; note: string; href?: string; tone?: "calm" | "attention" }) {
  const body = (
    <div className={`rounded-card border bg-white p-4 shadow-card ${tone === "attention" ? "border-p2b-amber-ink/40" : "border-cardline"}`}>
      <dt className="text-xs uppercase tracking-wide text-slate">{label}</dt>
      <dd className="mt-1 font-display text-3xl font-bold text-navy tabular-nums">{value}</dd>
      <dd className="mt-1 text-xs text-slate">{note}</dd>
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}
