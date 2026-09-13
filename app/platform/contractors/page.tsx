import Link from "next/link";
import { platformOverview } from "@/lib/platformReadModel";
import { ContractorTable } from "@/components/platform/ContractorTable";
import { HiddenFixturesNote } from "@/components/platform/HiddenFixturesNote";

export const dynamic = "force-dynamic";

export default async function PlatformContractorsPage() {
  const o = await platformOverview();
  const readable = o.rows.filter((r) => r.readable);
  const live = readable.filter((r) => r.live > 0).length;
  const inSetup = readable.filter((r) => r.live === 0).length;
  const unavailable = o.rows.length - readable.length;

  return (
    <div className="mx-auto w-full max-w-7xl">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-electric">Platform admin</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-navy">Contractors</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate">
            Review every Price2Book contractor, see where setup stands, and open the contractor control center when something needs attention.
          </p>
        </div>
        <Link href="/platform/onboarding" className="inline-flex w-full items-center justify-center rounded-pill bg-electric px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover sm:w-auto">
          + Onboard contractor
        </Link>
      </header>

      <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Summary label="Total contractors" value={o.contractors.total} />
        <Summary label="Live storefronts" value={live} tone="success" />
        <Summary label="In setup" value={inSetup} tone="info" />
        <Summary label="Temporarily unavailable" value={unavailable} tone={unavailable > 0 ? "attention" : "calm"} />
      </dl>

      <div className="mt-5"><HiddenFixturesNote hidden={o.fixtures.hidden} /></div>

      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-navy">Contractor directory</h2>
            <p className="mt-0.5 text-xs text-slate">Setup and launch status come from each contractor&rsquo;s actual readiness data; no separate lifecycle state is inferred here.</p>
          </div>
          <span className="text-xs text-slate">{o.rows.length} shown</span>
        </div>
        <ContractorTable rows={o.rows} />
      </section>
    </div>
  );
}

function Summary({ label, value, tone = "calm" }: { label: string; value: number; tone?: "calm" | "success" | "info" | "attention" }) {
  const toneClass = tone === "success"
    ? "border-success/25 bg-success/[0.04]"
    : tone === "info"
      ? "border-electric/20 bg-electric/[0.035]"
      : tone === "attention"
        ? "border-p2b-amber-ink/30 bg-p2b-amber-tint"
        : "border-cardline bg-white";

  return (
    <div className={`rounded-card border p-4 shadow-sm ${toneClass}`}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-bold tabular-nums text-navy">{value}</dd>
    </div>
  );
}
