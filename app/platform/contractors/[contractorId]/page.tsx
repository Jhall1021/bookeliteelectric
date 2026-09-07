import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformContractorNotFoundError } from "@/lib/platformContext";
import { platformContractor, attentionFor } from "@/lib/platformReadModel";

export const dynamic = "force-dynamic";

/**
 * Contractor Control Center — one contractor, read through its own boundary.
 *
 * THE ONE PLACE A CONTRACTOR ID COMES FROM A REQUEST. `params.contractorId`
 * is handed straight to the read model, which hands it to
 * withPlatformContractor, which authorizes the staff member BEFORE looking at
 * it. An id that does not resolve is a 404 for staff and never a disclosure
 * for anyone else; a non-staff session never reaches this page at all.
 *
 * Read-only. The setup stages and findings are assessOnboarding's own; this
 * page renders them beside the contractor's catalog split, bookings and
 * payment readiness, and adds no rule of its own.
 */
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
    <div>
      <p className="text-xs text-slate"><Link href="/platform/contractors" className="hover:underline">Contractors</Link> / {c.slug}</p>
      <header className="mt-2 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy">{c.name}</h1>
          <p className="mt-1 text-sm text-slate">{c.trade} · enrolled in {f.trades.join(", ") || "no catalog"} · since {c.createdAt.toISOString().slice(0, 10)} · {c.active ? "enabled" : "disabled"}</p>
        </div>
        <span className="flex items-center gap-3">
          <Link href={`/platform/onboarding/${c.id}`} className="rounded-md border border-cardline bg-white px-3 py-1 text-xs font-medium text-electric hover:underline">Onboarding &amp; retire</Link>
          <span className="rounded-pill border border-cardline bg-white px-3 py-1 text-xs text-slate">read-only · viewed as {f.actor.role}</span>
        </span>
      </header>

      {attention.length > 0 && (
        <ul className="mt-6 space-y-2">
          {attention.map((a) => (
            <li key={a.code} className="rounded-card border border-p2b-amber-ink/40 bg-p2b-amber-tint p-3 text-sm text-p2b-amber-ink">
              <span className="font-medium">{a.code.replaceAll("_", " ").toLowerCase()}</span> — {a.message}
            </li>
          ))}
        </ul>
      )}

      <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Launch check" value={f.readiness.canLaunch ? "passes" : `${f.readiness.blockers.length} blocker${f.readiness.blockers.length === 1 ? "" : "s"}`} note={`${f.readiness.warnings.length} warning${f.readiness.warnings.length === 1 ? "" : "s"}`} />
        <Fact label="Catalog" value={`${f.catalog.live} live of ${f.catalog.total}`} note={`${f.catalog.priced} priced · ${f.catalog.quoteOnly} quote-only · ${f.catalog.needsPrice} need a price · ${f.catalog.hidden} hidden`} />
        <Fact label="Bookings" value={String(f.bookings.total)} note={`${f.bookings.last30Days} in the last 30 days · ${f.quotesAwaiting} quote${f.quotesAwaiting === 1 ? "" : "s"} awaiting review`} />
        <Fact label="Payments" value={f.payments.ready ? "ready" : "not ready"} note={f.payments.reason} />
      </dl>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-card border border-cardline bg-white p-5 shadow-card">
          <h2 className="font-display text-lg font-bold text-navy">Setup</h2>
          <p className="mt-1 text-xs text-slate">
            {f.onboarding ? (f.onboarding.completedAt ? `Finished ${f.onboarding.completedAt.toISOString().slice(0, 10)}` : `In progress · stage "${f.onboarding.currentStage}" · last activity ${f.onboarding.updatedAt.toISOString().slice(0, 10)}`) : "No guided setup record"}
          </p>
          <ol className="mt-3 space-y-2 text-sm">
            {f.readiness.stages.map((s) => (
              <li key={s.key} className="flex items-start justify-between gap-3">
                <span className="text-navy">{s.title}</span>
                <span className={`shrink-0 rounded-pill px-2 py-0.5 text-xs ${s.status === "ready" ? "bg-emerald-50 text-emerald-800" : s.status === "blocked" ? "bg-red-50 text-red-700" : "bg-warmwhite text-slate"}`}>{s.status}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-card border border-cardline bg-white p-5 shadow-card">
          <h2 className="font-display text-lg font-bold text-navy">Findings</h2>
          <p className="mt-1 text-xs text-slate">From the same readiness engine the contractor sees. Blockers stop launch; warnings do not.</p>
          {f.readiness.blockers.length + f.readiness.warnings.length === 0 ? (
            <p className="mt-3 text-sm text-slate">None.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {[...f.readiness.blockers, ...f.readiness.warnings].map((x, i) => (
                <li key={`${x.code}-${i}`} className="flex items-start gap-2">
                  <span className={`mt-0.5 shrink-0 rounded-pill px-2 py-0.5 text-xs ${x.severity === "blocker" ? "bg-red-50 text-red-700" : "bg-warmwhite text-slate"}`}>{x.severity}</span>
                  <span className="text-navy">{x.message}{x.serviceSlug ? <span className="text-slate"> ({x.serviceSlug})</span> : null}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-card border border-cardline bg-white p-5 shadow-card">
          <h2 className="font-display text-lg font-bold text-navy">Storefront &amp; embed</h2>
          <dl className="mt-3 grid grid-cols-[9rem_1fr] gap-y-1 text-sm">
            <dt className="text-slate">Hosted page</dt><dd className="text-navy">{f.site ? `live · price2book.com/${f.site.hostedSlug}` : "none live"}{f.retiredSites ? <span className="text-slate"> · {f.retiredSites} retired</span> : null}</dd>
            <dt className="text-slate">Embed origins</dt><dd className="text-navy">{f.site ? `${f.site.embedOriginsConfigured} configured` : "—"}</dd>
            <dt className="text-slate">Installed on their site</dt><dd className="text-slate">not knowable yet — there is no embed-detection authority</dd>
          </dl>
        </section>

        <section className="rounded-card border border-cardline bg-white p-5 shadow-card">
          <h2 className="font-display text-lg font-bold text-navy">Scheduling &amp; country</h2>
          <dl className="mt-3 grid grid-cols-[9rem_1fr] gap-y-1 text-sm">
            <dt className="text-slate">Authority</dt><dd className="text-navy">{c.schedulingAuthority ? c.schedulingAuthority.toLowerCase() : "undecided"}</dd>
            <dt className="text-slate">External calendar</dt><dd className="text-navy">{f.calendar.connected ? `connected${f.calendar.connectedAt ? ` since ${f.calendar.connectedAt.toISOString().slice(0, 10)}` : ""}${f.calendar.accessTokenExpired ? " · access token due for its routine refresh on next use" : ""}` : c.schedulingAuthority === "EXTERNAL" ? "not connected" : "not used"}</dd>
            <dt className="text-slate">Country</dt><dd className="text-navy">{c.countryCode ?? "not set"}</dd>
          </dl>
        </section>
      </div>

      <p className="mt-10 text-xs text-slate">Nothing on this page changes anything. Interventions arrive with support entry, audited, in a later phase.</p>
    </div>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-card border border-cardline bg-white p-4 shadow-card">
      <dt className="text-xs uppercase tracking-wide text-slate">{label}</dt>
      <dd className="mt-1 font-display text-xl font-bold text-navy">{value}</dd>
      <dd className="mt-1 text-xs text-slate">{note}</dd>
    </div>
  );
}
