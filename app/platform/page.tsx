import Link from "next/link";
import { platformOverview, attentionSummary } from "@/lib/platformReadModel";
import { ContractorDirectory } from "@/components/platform/ContractorDirectory";
import { Card, CardHeader } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Donut } from "@/components/ui/Donut";
import { BusinessIllustration, PricingIllustration, BookingIllustration } from "@/components/ui/illustrations";
import { UsersIcon, StorefrontIcon, ClockIcon, AlertTriangleIcon } from "@/components/ui/icons";

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
  const summary = attentionSummary(o.attention, o.unreadable);
  const inProgress = o.rows.filter((r) => r.readable && r.live === 0);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-electric">Price2Book staff</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-navy">Platform overview</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate">
            Keep contractors moving from account setup to a live storefront, and surface the few things that need staff attention.
          </p>
        </div>
        <LinkButton href="/platform/onboarding" variant="primary" className="w-full justify-center sm:w-auto">
          + Onboard contractor
        </LinkButton>
      </header>

      <dl className="mt-7 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Tile icon={UsersIcon} label="Contractors" value={o.contractors.total} href="/platform/contractors" />
        <Tile icon={StorefrontIcon} label="Live storefronts" value={o.contractors.live} tone="success" />
        <Tile icon={ClockIcon} label="In setup" value={o.contractors.inSetup} tone="info" />
        <Tile icon={AlertTriangleIcon} label="Need attention" value={o.attention.length} href="/platform/attention" tone={o.attention.length ? "attention" : "calm"} />
      </dl>

      {o.unreadable.length > 0 && (
        <Card className="mt-5 border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Some contractor data could not be read</p>
          <p className="mt-1">{o.unreadable.length} contractor{o.unreadable.length === 1 ? "" : "s"} were excluded from the figures above for this read.</p>
          <ul className="mt-3 space-y-1.5">
            {o.unreadable.map((u) => (
              <li key={u.contractorId} className="rounded-card bg-white/70 px-3 py-2">
                <Link href={`/platform/contractors/${u.contractorId}`} className="font-medium underline">{u.name}</Link>
                <span className="text-red-700"> — {u.error}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section className="mt-7 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="min-w-0 overflow-hidden">
          <div className="border-b border-cardline bg-warmwhite/60 p-5">
            <CardHeader title="Onboarding pipeline" description="See who is still moving through setup and pick up where they left off." />
          </div>

          <div className="p-5">
            <div className="grid grid-cols-3 gap-3 rounded-card border border-cardline bg-warmwhite/40 p-3 sm:p-4">
              <OnboardingStage illustration={BusinessIllustration} label="Business & owner" />
              <OnboardingStage illustration={PricingIllustration} label="Services & pricing" />
              <OnboardingStage illustration={BookingIllustration} label="Ready to launch" />
            </div>

            {inProgress.length > 0 ? (
              <ul className="mt-5 divide-y divide-cardline rounded-card border border-cardline bg-white">
                {inProgress.map((r) => {
                  const pct = r.readable ? Math.round((r.stagesReady / r.stagesTotal) * 100) : 0;
                  return (
                    <li key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate font-semibold text-navy">{r.name}</p>
                          <span className="shrink-0 text-xs font-medium text-slate">{r.stagesReady} of {r.stagesTotal}</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-pill bg-cardline">
                          <div className="h-full rounded-pill bg-electric" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <LinkButton href={r.owners.length === 0 ? `/platform/onboarding/${r.id}` : `/platform/contractors/${r.id}`} variant="secondary" size="sm" className="w-full justify-center sm:w-auto sm:shrink-0">
                        Resume
                      </LinkButton>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mt-5 rounded-card border border-dashed border-cardline bg-white px-5 py-8 text-center">
                <p className="text-sm font-semibold text-navy">No contractors are currently in setup</p>
                <p className="mt-1 text-xs text-slate">New onboarding work will appear here automatically.</p>
              </div>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-cardline bg-warmwhite/60 p-5">
            <CardHeader title="Needs attention" description="Only items that require a staff decision or follow-up." />
          </div>
          <div className="p-5">
            {o.attention.length === 0 ? (
              <div className="rounded-card border border-dashed border-cardline bg-warmwhite/40 px-4 py-6 text-center">
                <p className={`text-sm ${summary.tone === "partial" ? "text-p2b-amber-ink" : "text-slate"}`}>{summary.message}</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {o.attention.map((a) => (
                  <li key={`${a.contractorId}:${a.code}`} className="rounded-card border border-cardline bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-navy">{a.name}</p>
                        <p className="mt-1 text-xs leading-relaxed text-slate">{a.message}</p>
                      </div>
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-p2b-amber-ink" aria-hidden="true" />
                    </div>
                    <LinkButton href={a.href} variant="secondary" size="sm" className="mt-3 w-full justify-center">
                      {/MATERIAL/.test(a.code) ? "Review costs" : "Review"}
                    </LinkButton>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </section>

      <section className="mt-7 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate">Directory</p>
              <h2 className="mt-1 font-display text-xl font-bold text-navy">Contractors</h2>
            </div>
            <Link href="/platform/contractors" className="text-sm font-semibold text-electric hover:underline">View all</Link>
          </div>
          <div className="mt-3">
            <ContractorDirectory rows={o.rows} />
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-cardline bg-warmwhite/60 p-5">
            <CardHeader title="Storefront status" description="Live businesses compared with contractors still in setup." />
          </div>
          <div className="p-5">
            <div className="flex items-center gap-5">
              <Donut
                total={o.contractors.total}
                centerValue={o.contractors.total}
                centerLabel="contractors"
                segments={[
                  { value: o.contractors.live, className: "text-success" },
                  { value: o.contractors.inSetup, className: "text-electric" },
                ]}
              />
              <ul className="min-w-0 flex-1 space-y-3 text-sm">
                <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-success" /> <span className="text-slate">Live</span> <span className="ml-auto font-semibold text-navy">{o.contractors.live}</span></li>
                <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-electric" /> <span className="text-slate">In setup</span> <span className="ml-auto font-semibold text-navy">{o.contractors.inSetup}</span></li>
              </ul>
            </div>

            {o.rows.some((r) => r.site && r.readable && r.live > 0) && (
              <div className="mt-5 border-t border-cardline pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate">Recently available storefronts</p>
                <ul className="mt-3 space-y-2">
                  {o.rows.filter((r) => r.site && r.readable && r.live > 0).slice(0, 3).map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 rounded-card bg-warmwhite/50 px-3 py-2 text-sm">
                      <span className="truncate font-medium text-navy">{r.name}</span>
                      <a href={`/${r.site!.hostedSlug}`} target="_blank" rel="noopener" className="shrink-0 font-semibold text-electric hover:underline">Open ↗</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      </section>

      <details className="mt-8 rounded-card border border-cardline bg-white p-4 text-xs text-slate">
        <summary className="cursor-pointer font-semibold text-navy">Staff details</summary>
        <div className="mt-3 space-y-2 border-t border-cardline pt-3">
          {o.fixtures.hidden > 0 && (
            <p>
              {o.fixtures.hidden} temporary verifier contractor{o.fixtures.hidden === 1 ? "" : "s"} hidden from this page — {o.fixtures.hidden === 1 ? "it is" : "they are"} being used by a verification run and {o.fixtures.hidden === 1 ? "removes" : "remove"} {o.fixtures.hidden === 1 ? "itself" : "themselves"} when it finishes. Not {o.fixtures.hidden === 1 ? "a business" : "businesses"} to onboard.
            </p>
          )}
          <p>Signed in as {o.actor.email}, {o.actor.role}. This page reads; changes happen only through Onboarding&rsquo;s reviewed commands.</p>
        </div>
      </details>
    </div>
  );
}

function Tile({
  icon: Icon, label, value, href, tone = "calm",
}: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; href?: string; tone?: "calm" | "attention" | "success" | "info" }) {
  const iconTone = tone === "attention" ? "bg-p2b-amber-tint text-p2b-amber-ink" : tone === "success" ? "bg-success/10 text-success" : tone === "info" ? "bg-electric/10 text-electric" : "bg-slate/10 text-slate";
  const body = (
    <Card className={`h-full p-4 transition ${tone === "attention" ? "border-p2b-amber-ink/40" : ""}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconTone}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-slate">{label}</dt>
          <dd className="mt-0.5 font-display text-2xl font-bold text-navy tabular-nums">{value}</dd>
        </div>
      </div>
    </Card>
  );
  return href ? <Link href={href} className="block h-full transition hover:-translate-y-0.5">{body}</Link> : body;
}

function OnboardingStage({
  illustration: Illustration, label,
}: { illustration: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      <Illustration className="h-14 w-14 sm:h-16 sm:w-16" />
      <span className="text-[11px] font-semibold leading-tight text-navy sm:text-xs">{label}</span>
    </div>
  );
}
