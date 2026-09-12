import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformContractorNotFoundError } from "@/lib/platformContext";
import { platformContractor, attentionFor } from "@/lib/platformReadModel";

export const dynamic = "force-dynamic";

export default async function ContractorControlCenter({ params }: { params: { contractorId: string } }) {
  let f;
  try {
    f = await platformContractor(params.contractorId);
  } catch (e) {
    if (e instanceof PlatformContractorNotFoundError) notFound();
    throw e;
  }
  const attention = attentionFor(f);
  const c = f.contractor;

  return (
    <div className="mx-auto w-full max-w-7xl">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-slate">
        <Link href="/platform/contractors" className="font-medium hover:text-electric hover:underline">Contractors</Link>
        <span aria-hidden="true" className="text-cardline">/</span>
        <span className="truncate">{c.slug}</span>
      </nav>

      <header className="mt-3 rounded-card border border-cardline bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-pill px-2.5 py-1 text-[11px] font-semibold ${c.active ? "bg-success/10 text-success" : "bg-slate-100 text-slate"}`}>
                {c.active ? "Enabled" : "Disabled"}
              </span>
              <span className="rounded-pill border border-cardline bg-warmwhite px-2.5 py-1 text-[11px] font-semibold text-slate">{c.trade}</span>
            </div>
            <h1 className="mt-3 break-words font-display text-3xl font-bold tracking-tight text-navy">{c.name}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate">
              Enrolled in {f.trades.join(", ") || "no catalog"} · created {c.createdAt.toISOString().slice(0, 10)}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
            <Link href={`/platform/onboarding/${c.id}`} className="inline-flex items-center justify-center rounded-pill bg-electric px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover">
              Open onboarding
            </Link>
            <span className="inline-flex items-center justify-center rounded-pill border border-cardline bg-warmwhite px-4 py-2.5 text-xs font-medium text-slate">
              Read-only · {f.actor.role}
            </span>
          </div>
        </div>
      </header>

      {attention.length > 0 && (
        <section className="mt-5 rounded-card border border-p2b-amber-ink/30 bg-p2b-amber-tint p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-bold text-navy">Needs attention</h2>
            <span className="rounded-pill bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-p2b-amber-ink">{attention.length} item{attention.length === 1 ? "" : "s"}</span>
          </div>
          <ul className="mt-3 divide-y divide-p2b-amber-ink/15">
            {attention.map((a) => (
              <li key={a.code} className="py-3 first:pt-0 last:pb-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-p2b-amber-ink">{a.code.replaceAll("_", " ").toLowerCase()}</p>
                <p className="mt-1 text-sm text-navy">{a.message}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Fact label="Launch check" value={f.readiness.canLaunch ? "Passes" : `${f.readiness.blockers.length} blocker${f.readiness.blockers.length === 1 ? "" : "s"}`} note={`${f.readiness.warnings.length} warning${f.readiness.warnings.length === 1 ? "" : "s"}`} />
        <Fact label="Catalog" value={`${f.catalog.live} live of ${f.catalog.total}`} note={`${f.catalog.priced} priced · ${f.catalog.quoteOnly} quote-only · ${f.catalog.needsPrice} need price`} />
        <Fact label="Bookings" value={String(f.bookings.total)} note={`${f.bookings.last30Days} in 30 days · ${f.quotesAwaiting} awaiting review`} />
        <Fact label="Payments" value={f.payments.ready ? "Ready" : "Not ready"} note={f.payments.reason} />
      </dl>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-card border border-cardline bg-white p-5 shadow-sm sm:p-6">
          <SectionHeader title="Setup" description={f.onboarding ? (f.onboarding.completedAt ? `Finished ${f.onboarding.completedAt.toISOString().slice(0, 10)}` : `In progress · ${f.onboarding.currentStage} · last activity ${f.onboarding.updatedAt.toISOString().slice(0, 10)}`) : "No guided setup record"} />
          <ol className="mt-4 space-y-2.5">
            {f.readiness.stages.map((s, i) => (
              <li key={s.key} className="flex items-center gap-3 rounded-card border border-cardline bg-warmwhite/40 px-3 py-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-slate ring-1 ring-cardline">{i + 1}</span>
                <span className="min-w-0 flex-1 text-sm font-medium text-navy">{s.title}</span>
                <span className={`shrink-0 rounded-pill px-2.5 py-1 text-[11px] font-semibold ${s.status === "ready" ? "bg-success/10 text-success" : s.status === "blocked" ? "bg-red-50 text-red-700" : "bg-white text-slate ring-1 ring-cardline"}`}>{s.status}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-card border border-cardline bg-white p-5 shadow-sm sm:p-6">
          <SectionHeader title="Readiness findings" description="The same launch blockers and warnings the contractor sees." />
          {f.readiness.blockers.length + f.readiness.warnings.length === 0 ? (
            <div className="mt-4 rounded-card border border-dashed border-cardline bg-warmwhite/40 p-5 text-sm text-slate">No current readiness findings.</div>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {[...f.readiness.blockers, ...f.readiness.warnings].map((x, i) => (
                <li key={`${x.code}-${i}`} className="flex items-start gap-3 rounded-card border border-cardline px-3 py-3">
                  <span className={`mt-0.5 shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-semibold ${x.severity === "blocker" ? "bg-red-50 text-red-700" : "bg-warmwhite text-slate"}`}>{x.severity}</span>
                  <p className="min-w-0 text-sm leading-relaxed text-navy">{x.message}{x.serviceSlug ? <span className="text-slate"> ({x.serviceSlug})</span> : null}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-card border border-cardline bg-white p-5 shadow-sm sm:p-6">
          <SectionHeader title="Storefront & embed" description="Customer-facing availability and website installation facts." />
          <DefinitionRows rows={[
            ["Hosted page", f.site ? `Live · price2book.com/${f.site.hostedSlug}${f.retiredSites ? ` · ${f.retiredSites} retired` : ""}` : "None live"],
            ["Embed origins", f.site ? `${f.site.embedOriginsConfigured} configured` : "—"],
            ["Installed on their site", "Not knowable yet — there is no embed-detection authority"],
          ]} />
        </section>

        <section className="rounded-card border border-cardline bg-white p-5 shadow-sm sm:p-6">
          <SectionHeader title="Scheduling & country" description="Calendar authority and contractor location settings." />
          <DefinitionRows rows={[
            ["Authority", c.schedulingAuthority ? c.schedulingAuthority.toLowerCase() : "undecided"],
            ["External calendar", f.calendar.connected ? `connected${f.calendar.connectedAt ? ` since ${f.calendar.connectedAt.toISOString().slice(0, 10)}` : ""}${f.calendar.accessTokenExpired ? " · access token refreshes on next use" : ""}` : c.schedulingAuthority === "EXTERNAL" ? "not connected" : "not used"],
            ["Country", c.countryCode ?? "not set"],
          ]} />
        </section>
      </div>

      <div className="mt-8 rounded-card border border-cardline bg-warmwhite/60 px-4 py-3 text-xs leading-relaxed text-slate">
        Nothing on this page changes contractor data. Operational changes remain in the reviewed onboarding flow; broader staff interventions are a later phase.
      </div>
    </div>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-card border border-cardline bg-white p-4 shadow-sm">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate">{label}</dt>
      <dd className="mt-1 font-display text-xl font-bold text-navy">{value}</dd>
      <dd className="mt-1 text-xs leading-relaxed text-slate">{note}</dd>
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return <div><h2 className="font-display text-lg font-bold text-navy">{title}</h2><p className="mt-1 text-xs leading-relaxed text-slate">{description}</p></div>;
}

function DefinitionRows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="mt-4 divide-y divide-cardline rounded-card border border-cardline">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 px-3 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
          <dt className="text-xs font-medium text-slate">{label}</dt>
          <dd className="break-words text-sm text-navy">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
