import Link from "next/link";
import { platformOverview, attentionSummary } from "@/lib/platformReadModel";
import { ContractorDirectory } from "@/components/platform/ContractorDirectory";
import { HiddenFixturesNote } from "@/components/platform/HiddenFixturesNote";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { Donut } from "@/components/ui/Donut";
import { UsersIcon, StorefrontIcon, ClockIcon, AlertTriangleIcon, ClipboardIcon, ArrowRightIcon } from "@/components/ui/icons";

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
    <div>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy">Platform overview</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate">
            Keep contractors moving from setup to launch.
          </p>
        </div>
        <LinkButton href="/platform/onboarding" variant="primary">
          + Onboard contractor
        </LinkButton>
      </header>
      <HiddenFixturesNote hidden={o.fixtures.hidden} />

      <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon={UsersIcon} label="Contractors" value={o.contractors.total} href="/platform/contractors" />
        <Tile icon={StorefrontIcon} label="Live storefronts" value={o.contractors.live} tone="success" />
        <Tile icon={ClockIcon} label="In setup" value={o.contractors.inSetup} tone="info" />
        <Tile icon={AlertTriangleIcon} label="Need attention" value={o.attention.length} href="/platform/attention" tone={o.attention.length ? "attention" : "calm"} />
      </dl>

      {o.unreadable.length > 0 && (
        <Card className="mt-6 border-red-200 bg-red-50 text-sm text-red-800">
          <p className="font-medium">{o.unreadable.length} contractor{o.unreadable.length === 1 ? "" : "s"} could not be read this time. The figures above cover the rest.</p>
          <ul className="mt-2 space-y-1">
            {o.unreadable.map((u) => <li key={u.contractorId}><Link href={`/platform/contractors/${u.contractorId}`} className="font-medium underline">{u.name}</Link> — {u.error}</li>)}
          </ul>
        </Card>
      )}

      <Card className="mt-8">
        <CardHeader title="Onboarding at a glance" description="From business details to a live storefront." />
        <div className="mt-5 flex items-center justify-center gap-3 text-slate sm:gap-6">
          <OnboardingStage icon={UsersIcon} label="Business & owner" />
          <ArrowRightIcon className="h-4 w-4 shrink-0 text-cardline" />
          <OnboardingStage icon={ClipboardIcon} label="Services & pricing" />
          <ArrowRightIcon className="h-4 w-4 shrink-0 text-cardline" />
          <OnboardingStage icon={StorefrontIcon} label="Ready to launch" />
        </div>

        {inProgress.length > 0 ? (
          <ul className="mt-6 divide-y divide-cardline border-t border-cardline">
            {inProgress.map((r) => {
              const pct = r.readable ? Math.round((r.stagesReady / r.stagesTotal) * 100) : 0;
              return (
                <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-navy">{r.name}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 w-32 overflow-hidden rounded-pill bg-cardline">
                        <div className="h-full rounded-pill bg-electric" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-slate">{r.readable ? `${r.stagesReady} of ${r.stagesTotal} completed` : ""}</span>
                    </div>
                  </div>
                  <LinkButton href={r.owners.length === 0 ? `/platform/onboarding/${r.id}` : `/platform/contractors/${r.id}`} variant="secondary" size="sm" className="shrink-0">
                    Resume
                  </LinkButton>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-6 border-t border-cardline pt-4 text-sm text-slate">Nothing in setup right now.</p>
        )}
      </Card>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0">
          <h2 className="font-display text-lg font-bold text-navy">Contractors</h2>
          <div className="mt-3">
            <ContractorDirectory rows={o.rows} />
          </div>
        </section>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Needs attention" />
            {o.attention.length === 0 ? (
              <p className={`mt-3 text-sm ${summary.tone === "partial" ? "text-p2b-amber-ink" : "text-slate"}`}>{summary.message}</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {o.attention.map((a) => (
                  <li key={`${a.contractorId}:${a.code}`} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-navy">{a.name}</p>
                      <p className="mt-0.5 text-xs text-slate">{a.message}</p>
                    </div>
                    <LinkButton href={a.href} variant="secondary" size="sm" className="shrink-0">
                      {/MATERIAL/.test(a.code) ? "Review costs" : "Review"}
                    </LinkButton>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Storefront status" />
            <div className="mt-4 flex items-center gap-5">
              <Donut
                total={o.contractors.total}
                centerValue={o.contractors.total}
                centerLabel="contractors"
                segments={[
                  { value: o.contractors.live, className: "text-success" },
                  { value: o.contractors.inSetup, className: "text-electric" },
                ]}
              />
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-success" /> Live <span className="ml-auto font-semibold text-navy">{o.contractors.live}</span></li>
                <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-electric" /> In setup <span className="ml-auto font-semibold text-navy">{o.contractors.inSetup}</span></li>
              </ul>
            </div>
            {/* A site can exist before anything on it is live — reserved,
                not yet reachable in any way a homeowner would find useful.
                Listed here only once the contractor is ACTUALLY live
                (r.live > 0), never merely "has a slug", so this never shows
                a link with nothing behind it. */}
            {o.rows.some((r) => r.site && r.readable && r.live > 0) && (
              <ul className="mt-4 space-y-2 border-t border-cardline pt-4">
                {o.rows.filter((r) => r.site && r.readable && r.live > 0).slice(0, 3).map((r) => (
                  <li key={r.id} className="flex items-center justify-between text-sm">
                    <span className="truncate text-navy">{r.name}</span>
                    <a href={`/${r.site!.hostedSlug}`} target="_blank" rel="noopener" className="shrink-0 font-medium text-electric hover:underline">Open ↗</a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>

      <p className="mt-10 text-xs text-slate">
        Signed in as {o.actor.email}, {o.actor.role}. This page reads; changes happen only through Onboarding&rsquo;s reviewed commands.
      </p>
    </div>
  );
}

function Tile({
  icon: Icon, label, value, href, tone = "calm",
}: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; href?: string; tone?: "calm" | "attention" | "success" | "info" }) {
  const iconTone = tone === "attention" ? "bg-p2b-amber-tint text-p2b-amber-ink" : tone === "success" ? "bg-success/10 text-success" : tone === "info" ? "bg-electric/10 text-electric" : "bg-slate/10 text-slate";
  const body = (
    <Card className={tone === "attention" ? "border-p2b-amber-ink/40" : ""}>
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconTone}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate">{label}</dt>
          <dd className="font-display text-2xl font-bold text-navy tabular-nums">{value}</dd>
        </div>
      </div>
    </Card>
  );
  return href ? <Link href={href} className="block transition hover:-translate-y-0.5">{body}</Link> : body;
}

function OnboardingStage({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-electric/10 text-electric">
        <Icon className="h-6 w-6" />
      </span>
      <span className="max-w-[6rem] text-xs font-medium text-navy">{label}</span>
    </div>
  );
}
