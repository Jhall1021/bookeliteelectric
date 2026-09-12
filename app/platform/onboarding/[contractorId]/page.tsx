import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformContractorNotFoundError } from "@/lib/platformContext";
import { platformOnboardingContractor, noticeText } from "@/lib/platformOnboarding";
import { attachOwnerAction, inviteOwnerAction, revokeInvitationAction, enrolTradeAction, installTemplateAction, launchAction, retireAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ContractorOnboardingPage({ params, searchParams }: { params: { contractorId: string }; searchParams?: { notice?: string } }) {
  let s;
  try {
    s = await platformOnboardingContractor(params.contractorId);
  } catch (e) {
    if (e instanceof PlatformContractorNotFoundError) notFound();
    throw e;
  }

  const notice = noticeText(searchParams?.notice);
  const c = s.facts.contractor;
  const id = c.id;
  const retired = s.progress === "retired";
  const ownerDone = s.owners.length > 0 || retired;
  const tradeDone = s.facts.trades.length > 0;
  const catalogDone = s.facts.catalog.total > 0 || retired;
  const completedSteps = s.steps.filter((step) => step.status === "done").length;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-slate">
        <Link href="/platform/onboarding" className="font-medium transition hover:text-electric hover:underline">Onboarding</Link>
        <span aria-hidden="true" className="text-cardline">/</span>
        <span className="truncate">{c.slug}</span>
      </nav>

      <header className="mt-3 rounded-card border border-cardline bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.15em] text-electric">Contractor onboarding</span>
              <Progress progress={s.progress} />
            </div>
            <h1 className="mt-2 break-words font-display text-3xl font-bold tracking-tight text-navy">{c.name}</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate">{c.slug} · created {c.createdAt.toISOString().slice(0, 10)}</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href={`/platform/contractors/${id}`} className="inline-flex items-center justify-center rounded-pill border border-cardline bg-white px-4 py-2.5 text-sm font-semibold text-navy transition hover:border-electric hover:text-electric">
              Open control center
            </Link>
            <div className="rounded-card border border-cardline bg-warmwhite/60 px-4 py-2.5 text-center sm:min-w-[150px]">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate">Progress</div>
              <div className="mt-0.5 text-sm font-semibold text-navy">{completedSteps} of {s.steps.length} steps complete</div>
            </div>
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-pill bg-cardline/70">
          <div className="h-full rounded-pill bg-electric transition-all" style={{ width: `${Math.round((completedSteps / Math.max(s.steps.length, 1)) * 100)}%` }} />
        </div>
      </header>

      {notice && (
        <p className={`mt-4 rounded-card border px-4 py-3 text-sm ${notice.tone === "ok" ? "border-success/25 bg-success/[0.06] text-navy" : "border-p2b-amber-ink/40 bg-p2b-amber-tint text-p2b-amber-ink"}`}>
          {notice.text}
        </p>
      )}

      {retired && (
        <section className="mt-5 rounded-card border border-cardline bg-warmwhite p-4 text-sm leading-relaxed text-slate">
          <p className="font-semibold text-navy">This business is retired.</p>
          <p className="mt-1">Its storefront and every service are inactive and no membership can open its dashboard. Nothing was deleted: the catalog, quotes, bookings and payment records are kept. An outstanding invitation can no longer be accepted, but stays visible below and can still be revoked. Reinstating is not built yet; the data is ready for it.</p>
        </section>
      )}

      <ol className="mt-6 space-y-4">
        <Step n={1} step={s.steps[0]} />

        <Step n={2} step={s.steps[1]}>
          {s.invitation.current && (
            <div className={`mt-4 rounded-card border p-4 text-sm ${s.invitation.current.status === "pending" ? "border-electric/25 bg-electric/[0.04]" : "border-cardline bg-warmwhite/60"}`}>
              <p className="break-words text-navy">
                Invited <span className="font-semibold">{s.invitation.current.email}</span>
                {s.invitation.current.status === "pending" && <> · expires {s.invitation.current.expiresAt.toISOString().slice(0, 10)}</>}
                {s.invitation.current.status === "expired" && <span className="ml-1 text-p2b-amber-ink">· expired</span>}
                {s.invitation.current.status === "neutralized" && <span className="ml-1 text-slate">· business retired, this link no longer works</span>}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {!retired && (
                  <form action={inviteOwnerAction}>
                    <input type="hidden" name="contractorId" value={id} />
                    <input type="hidden" name="email" value={s.invitation.current.email} />
                    <button type="submit" className="rounded-pill border border-electric px-3 py-1.5 text-xs font-semibold text-electric transition hover:bg-electric/5">Resend invitation</button>
                  </form>
                )}
                <form action={revokeInvitationAction}>
                  <input type="hidden" name="contractorId" value={id} />
                  <input type="hidden" name="invitationId" value={s.invitation.current.id} />
                  <button type="submit" className="rounded-pill border border-cardline px-3 py-1.5 text-xs font-semibold text-slate transition hover:bg-white">Revoke</button>
                </form>
              </div>
            </div>
          )}

          {!retired && !ownerDone && (
            <form action={inviteOwnerAction} className="mt-4 rounded-card border border-cardline bg-warmwhite/50 p-4">
              <input type="hidden" name="contractorId" value={id} />
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-slate">Owner&apos;s name</span>
                  <input name="ownerName" className="mt-1.5 w-full rounded-card border border-cardline bg-white px-3 py-2.5 outline-none focus:border-electric" placeholder="Jane Doe" />
                </label>
                <label className="text-sm">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-slate">Owner&apos;s email</span>
                  <input name="email" type="email" required className="mt-1.5 w-full rounded-card border border-cardline bg-white px-3 py-2.5 outline-none focus:border-electric" placeholder="owner@example.com" />
                </label>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate">Emails a one-time link, good for 7 days. They sign up or sign in with that address and land in the business&apos;s own setup. Name is optional and only used for the invitation greeting and sign-up prefill.</p>
              <button type="submit" className="mt-4 w-full rounded-pill bg-electric px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover sm:w-auto">{s.invitation.current ? "Invite a different address" : "Invite owner"}</button>
            </form>
          )}

          {!retired && !ownerDone && (
            <details className="mt-4 rounded-card border border-cardline bg-white p-3">
              <summary className="cursor-pointer text-xs font-semibold text-slate hover:text-navy">Attach an existing confirmed account instead</summary>
              <form action={attachOwnerAction} className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <input type="hidden" name="contractorId" value={id} />
                <label className="text-sm">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-slate">Owner&apos;s account email</span>
                  <input name="email" type="email" required className="mt-1.5 w-full rounded-card border border-cardline px-3 py-2.5 outline-none focus:border-electric" placeholder="owner@example.com" />
                </label>
                <button type="submit" className="rounded-pill border border-cardline px-4 py-2.5 text-sm font-semibold text-navy transition hover:border-electric">Attach owner</button>
                <p className="text-xs leading-relaxed text-slate sm:col-span-2">Use this only when the person already has a confirmed Price2Book account. Otherwise, invite them above.</p>
              </form>
            </details>
          )}

          {s.invitation.history.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-slate hover:text-navy">Invitation history ({s.invitation.history.length})</summary>
              <ul className="mt-2 space-y-1 text-xs text-slate">
                {s.invitation.history.map((h) => <li key={h.id}>{h.email} — {h.status} {h.at.toISOString().slice(0, 10)}</li>)}
              </ul>
            </details>
          )}
        </Step>

        <Step n={3} step={s.steps[2]}>
          {!retired && !tradeDone && (
            <form action={enrolTradeAction} className="mt-4 rounded-card border border-cardline bg-warmwhite/50 p-4">
              <input type="hidden" name="contractorId" value={id} />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="text-sm sm:min-w-[220px]">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-slate">Trade</span>
                  <select name="tradeKey" required className="mt-1.5 w-full rounded-card border border-cardline bg-white px-3 py-2.5 outline-none focus:border-electric">
                    {s.trades.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <button type="submit" className="rounded-pill bg-electric px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover">Enrol trade</button>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate">Only trades with a published catalog are offered. One trade in V1; it can be changed until a catalog is installed.</p>
            </form>
          )}
        </Step>

        <Step n={4} step={s.steps[3]}>
          {!retired && tradeDone && !catalogDone && (
            <form action={installTemplateAction} className="mt-4 rounded-card border border-cardline bg-warmwhite/50 p-4">
              <input type="hidden" name="contractorId" value={id} />
              <p className="text-xs leading-relaxed text-slate">Runs the same preflight and installer the contractor&apos;s own setup uses. It creates every service inactive and unpriced; it activates nothing.</p>
              <button type="submit" className="mt-3 w-full rounded-pill bg-electric px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover sm:w-auto">Install {s.facts.trades[0]} catalog</button>
            </form>
          )}
        </Step>

        <Step n={5} step={s.steps[4]}>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="rounded-card border border-cardline bg-warmwhite/40 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate">Readiness stages</h3>
              <ul className="mt-3 space-y-2">
                {s.stages.map((st) => (
                  <li key={st.key} className="flex items-center justify-between gap-3 rounded-card bg-white px-3 py-2.5 ring-1 ring-cardline">
                    <span className="min-w-0 text-sm font-medium text-navy">{st.title}</span>
                    <StatusPill status={st.status} />
                  </li>
                ))}
              </ul>

              <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate">Owner-session work</h3>
              <ul className="mt-3 space-y-2">
                {s.ownerWork.map((w) => (
                  <li key={w.path} className="rounded-card bg-white px-3 py-2.5 ring-1 ring-cardline">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-navy">{w.label}</span>
                      <span className={`rounded-pill px-2 py-0.5 text-[11px] font-semibold ${w.done ? "bg-success/10 text-success" : "bg-warmwhite text-slate"}`}>{w.done ? "ready" : "open"}</span>
                    </div>
                    <code className="mt-1 block break-all text-[11px] text-slate">{w.path}</code>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-relaxed text-slate">These links are intentionally not opened from staff onboarding. The owner dashboard resolves its contractor from the owner&apos;s own session, and audited staff entry is not built yet.</p>
            </div>

            <div className="rounded-card border border-cardline bg-white p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate">What still blocks launch</h3>
              {s.remaining.length === 0 ? (
                <div className="mt-3 rounded-card border border-success/20 bg-success/[0.05] p-4 text-sm text-navy">Nothing. The launch check passes.</div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {s.remaining.map((b, i) => (
                    <li key={`${b.code}-${i}`} className="rounded-card border border-red-100 bg-red-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-red-800">{b.code.replaceAll("_", " ").toLowerCase()}</p>
                      <p className="mt-1 text-sm leading-relaxed text-navy">{b.message}{b.serviceSlug ? <span className="text-slate"> ({b.serviceSlug})</span> : null}</p>
                      {b.href ? <code className="mt-2 block break-all text-[11px] text-slate">{b.href}</code> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Step>

        <Step n={6} step={s.steps[5]}>
          {s.progress === "ready" && (
            <form action={launchAction} className="mt-4 rounded-card border border-navy/15 bg-navy/[0.035] p-4">
              <input type="hidden" name="contractorId" value={id} />
              <label className="flex items-start gap-3 text-sm leading-relaxed text-navy">
                <input type="checkbox" name="confirm" value="yes" required className="mt-0.5 h-4 w-4 shrink-0 accent-[#0F1E3C]" />
                <span>I confirm: put every offered service live that its own activation guard allows{s.launch.live > 0 ? " (services already live are left as they are)" : ""}.</span>
              </label>
              <button type="submit" className="mt-4 w-full rounded-pill bg-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy/90 sm:w-auto">{s.launch.live > 0 ? `Retry launch (${s.launch.pending} not yet live)` : "Launch contractor"}</button>
            </form>
          )}

          {(s.launch.live > 0 || s.progress === "ready" || s.progress === "launched") && s.launch.offered.length > 0 && (
            <div className="mt-4 rounded-card border border-cardline bg-warmwhite/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate">Launch outcomes</h3>
                <span className="text-xs text-slate">{s.launch.live} live · {s.launch.pending} not live</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate">Read fresh from each service&apos;s own activation guard, so this remains true after a reload.</p>
              <ul className="mt-3 divide-y divide-cardline rounded-card border border-cardline bg-white">
                {s.launch.offered.map((o) => (
                  <li key={o.serviceId} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-navy">{o.name}</p>
                      <code className="text-[11px] text-slate">{o.slug}</code>
                    </div>
                    {o.live ? (
                      <span className="w-fit shrink-0 rounded-pill bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">live</span>
                    ) : (
                      <div className="sm:max-w-md sm:text-right">
                        <span className="inline-block rounded-pill bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">{o.refusal ? o.refusal.code.replaceAll("_", " ").toLowerCase() : "not live"}</span>
                        {o.refusal ? <p className="mt-1 text-xs leading-relaxed text-slate">{o.refusal.message}</p> : null}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {s.progress === "launched" && <p className="mt-3 rounded-card border border-success/20 bg-success/[0.05] p-3 text-sm text-navy">Live: every offered service passed its guard.</p>}
        </Step>
      </ol>

      {!retired && (
        <section className="mt-10 overflow-hidden rounded-card border border-red-200 bg-white shadow-sm">
          <div className="border-b border-red-100 bg-red-50/70 px-5 py-4 sm:px-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-red-700">Destructive action</p>
            <h2 className="mt-1 font-display text-lg font-bold text-red-800">Retire this business</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate">The reversible form of delete. It sets the business, storefront, and every service inactive in one step. Nothing is deleted; catalog, quotes, bookings, and payment records stay. Reinstating is not built yet.</p>
          </div>
          <form action={retireAction} className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <input type="hidden" name="contractorId" value={id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate">Type the web address to confirm: <code>{c.slug}</code></span>
                <input name="confirmSlug" required autoComplete="off" className="mt-1.5 w-full rounded-card border border-red-200 px-3 py-2.5 outline-none focus:border-red-400" placeholder={c.slug} />
              </label>
              <label className="flex items-start gap-3 rounded-card border border-red-100 bg-red-50/40 p-3 text-sm leading-relaxed text-navy">
                <input type="checkbox" name="confirm" value="yes" required className="mt-0.5 h-4 w-4 shrink-0" />
                <span>I understand the storefront goes down now.</span>
              </label>
            </div>
            <button type="submit" className="w-full rounded-pill bg-red-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800 lg:w-auto">Retire {c.name}</button>
          </form>
        </section>
      )}

      <div className="mt-8 rounded-card border border-cardline bg-warmwhite/60 px-4 py-3 text-xs leading-relaxed text-slate">Viewed as {s.facts.actor.role}. Each submission remains one reviewed command; repeating a command converges on the same rows instead of creating duplicates.</div>
    </div>
  );
}

function Progress({ progress }: { progress: "not-started" | "in-progress" | "blocked" | "ready" | "launched" | "retired" }) {
  const tone = progress === "launched" ? "bg-success/10 text-success border-success/20" : progress === "ready" ? "bg-electric/10 text-electric border-electric/30" : progress === "blocked" ? "bg-p2b-amber-tint text-p2b-amber-ink border-p2b-amber-ink/40" : progress === "retired" ? "bg-navy text-white border-navy" : "bg-white text-slate border-cardline";
  return <span className={`rounded-pill border px-2.5 py-1 text-[11px] font-semibold capitalize ${tone}`}>{progress.replace("-", " ")}</span>;
}

function StatusPill({ status }: { status: "ready" | "blocked" | string }) {
  const tone = status === "ready" ? "bg-success/10 text-success" : status === "blocked" ? "bg-red-50 text-red-700" : "bg-warmwhite text-slate";
  return <span className={`shrink-0 rounded-pill px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{status}</span>;
}

function Step({ n, step, children }: { n: number; step: { title: string; status: "done" | "todo" | "blocked"; detail: string }; children?: React.ReactNode }) {
  const mark = step.status === "done" ? "✓" : String(n);
  const tone = step.status === "done" ? "bg-success text-white" : step.status === "blocked" ? "bg-warmwhite text-slate ring-1 ring-cardline" : "bg-electric text-white";
  const shell = step.status === "blocked" ? "border-cardline bg-white" : step.status === "done" ? "border-success/15 bg-white" : "border-electric/20 bg-white";

  return (
    <li className={`overflow-hidden rounded-card border shadow-sm ${shell}`}>
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3.5">
          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${tone}`}>{mark}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold text-navy">{step.title}</h2>
              <span className={`rounded-pill px-2.5 py-1 text-[11px] font-semibold ${step.status === "done" ? "bg-success/10 text-success" : step.status === "blocked" ? "bg-warmwhite text-slate ring-1 ring-cardline" : "bg-electric/10 text-electric"}`}>{step.status === "done" ? "Complete" : step.status === "blocked" ? "Waiting" : "Next"}</span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-slate">{step.detail}</p>
            {children}
          </div>
        </div>
      </div>
    </li>
  );
}
