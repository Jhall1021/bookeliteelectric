import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformContractorNotFoundError } from "@/lib/platformContext";
import { platformOnboardingContractor, noticeText } from "@/lib/platformOnboarding";
import { attachOwnerAction, inviteOwnerAction, revokeInvitationAction, enrolTradeAction, installTemplateAction, launchAction, retireAction } from "../actions";

export const dynamic = "force-dynamic";

/**
 * One contractor's onboarding — resumable, because nothing here is stored by
 * the wizard: every step's state is read back from the data it produced.
 *
 * THE SECOND PLACE A CONTRACTOR ID COMES FROM A REQUEST, after the Control
 * Center, and under the same discipline: `params.contractorId` goes to one
 * boundary call and nowhere else; the command layer authorizes before it
 * looks. The forms carry the id back in a hidden field, and every command
 * validates it again through the same door.
 */
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

  return (
    <div>
      <p className="text-xs text-slate"><Link href="/platform/onboarding" className="hover:underline">Onboarding</Link> / {c.slug}</p>
      <header className="mt-2 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy">{c.name}</h1>
          <p className="mt-1 text-sm text-slate">{c.slug} · since {c.createdAt.toISOString().slice(0, 10)} · <Link href={`/platform/contractors/${id}`} className="text-electric hover:underline">Control Center</Link></p>
        </div>
        <Progress progress={s.progress} />
      </header>

      {notice && <p className={`mt-4 rounded-card border px-4 py-3 text-sm ${notice.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-p2b-amber-ink/40 bg-p2b-amber-tint text-p2b-amber-ink"}`}>{notice.text}</p>}

      {retired && (
        <section className="mt-6 rounded-card border border-cardline bg-warmwhite p-4 text-sm text-slate">
          <p className="font-medium text-navy">This business is retired.</p>
          <p className="mt-1">Its storefront and every service are inactive and no membership can open its dashboard. Nothing was deleted: the catalog, quotes, bookings and payment records are kept. An outstanding invitation can no longer be accepted, but stays visible below and can still be revoked. Reinstating is not built yet; the data is ready for it.</p>
        </section>
      )}

      <ol className="mt-8 space-y-4">
        <Step n={1} step={s.steps[0]} />

        <Step n={2} step={s.steps[1]}>
          {s.invitation.current && (
            <div className={`mt-3 rounded-card border p-3 text-sm ${s.invitation.current.status === "pending" ? "border-electric/30 bg-electric/5" : "border-cardline bg-warmwhite"}`}>
              <p className="text-navy">
                Invited <span className="font-medium">{s.invitation.current.email}</span>
                {s.invitation.current.status === "pending" && <> · expires {s.invitation.current.expiresAt.toISOString().slice(0, 10)}</>}
                {s.invitation.current.status === "expired" && <span className="ml-1 text-p2b-amber-ink">· expired</span>}
                {s.invitation.current.status === "neutralized" && <span className="ml-1 text-slate">· business retired, this link no longer works</span>}
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                {!retired && (
                  <form action={inviteOwnerAction}>
                    <input type="hidden" name="contractorId" value={id} />
                    <input type="hidden" name="email" value={s.invitation.current.email} />
                    <button type="submit" className="rounded-md border border-electric px-3 py-1.5 text-xs font-medium text-electric hover:bg-electric/10">Resend</button>
                  </form>
                )}
                <form action={revokeInvitationAction}>
                  <input type="hidden" name="contractorId" value={id} />
                  <input type="hidden" name="invitationId" value={s.invitation.current.id} />
                  <button type="submit" className="rounded-md border border-cardline px-3 py-1.5 text-xs font-medium text-slate hover:bg-white">Revoke</button>
                </form>
              </div>
            </div>
          )}

          {!retired && !ownerDone && (
            <form action={inviteOwnerAction} className="mt-3 flex flex-wrap items-end gap-3">
              <input type="hidden" name="contractorId" value={id} />
              <label className="text-sm">
                <span className="block text-xs uppercase tracking-wide text-slate">Owner&rsquo;s name</span>
                <input name="ownerName" className="mt-1 w-56 rounded-md border border-cardline px-3 py-2" placeholder="Jane Doe" />
              </label>
              <label className="text-sm">
                <span className="block text-xs uppercase tracking-wide text-slate">Owner&rsquo;s email</span>
                <input name="email" type="email" required className="mt-1 w-72 rounded-md border border-cardline px-3 py-2" placeholder="owner@example.com" />
              </label>
              <button type="submit" className="rounded-md bg-electric px-4 py-2 text-sm font-medium text-white hover:bg-electric/90">{s.invitation.current ? "Invite a different address" : "Invite an owner"}</button>
              <span className="text-xs text-slate">Emails a one-time link, good for 7 days. They sign up or sign in with that address and land in the business&rsquo;s own setup. Name is optional — used only in the email greeting and to pre-fill their sign-up.</span>
            </form>
          )}

          {!retired && !ownerDone && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-slate hover:text-navy">Or attach an existing, already-confirmed account directly</summary>
              <form action={attachOwnerAction} className="mt-3 flex flex-wrap items-end gap-3">
                <input type="hidden" name="contractorId" value={id} />
                <label className="text-sm">
                  <span className="block text-xs uppercase tracking-wide text-slate">Owner&rsquo;s account email</span>
                  <input name="email" type="email" required className="mt-1 w-72 rounded-md border border-cardline px-3 py-2" placeholder="owner@example.com" />
                </label>
                <button type="submit" className="rounded-md border border-cardline px-4 py-2 text-sm font-medium text-navy hover:bg-warmwhite">Attach owner</button>
                <span className="text-xs text-slate">Must already have a confirmed Price2Book account. For when you know it already exists — otherwise, invite them above.</span>
              </form>
            </details>
          )}

          {s.invitation.history.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-slate hover:text-navy">Invitation history ({s.invitation.history.length})</summary>
              <ul className="mt-2 space-y-1 text-xs text-slate">
                {s.invitation.history.map((h) => (
                  <li key={h.id}>{h.email} — {h.status} {h.at.toISOString().slice(0, 10)}</li>
                ))}
              </ul>
            </details>
          )}
        </Step>

        <Step n={3} step={s.steps[2]}>
          {!retired && !tradeDone && (
            <form action={enrolTradeAction} className="mt-3 flex flex-wrap items-end gap-3">
              <input type="hidden" name="contractorId" value={id} />
              <label className="text-sm">
                <span className="block text-xs uppercase tracking-wide text-slate">Trade</span>
                <select name="tradeKey" required className="mt-1 rounded-md border border-cardline px-3 py-2">
                  {s.trades.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <button type="submit" className="rounded-md bg-electric px-4 py-2 text-sm font-medium text-white hover:bg-electric/90">Enrol</button>
              <span className="text-xs text-slate">Only trades with a published catalog are offered. One trade in V1; it can be changed until a catalog is installed.</span>
            </form>
          )}
        </Step>

        <Step n={4} step={s.steps[3]}>
          {!retired && tradeDone && !catalogDone && (
            <form action={installTemplateAction} className="mt-3 flex flex-wrap items-center gap-3">
              <input type="hidden" name="contractorId" value={id} />
              <button type="submit" className="rounded-md bg-electric px-4 py-2 text-sm font-medium text-white hover:bg-electric/90">Install the {s.facts.trades[0]} catalog</button>
              <span className="text-xs text-slate">Runs the same preflight and installer the contractor&rsquo;s own setup uses. Creates every service inactive and unpriced; activates nothing.</span>
            </form>
          )}
        </Step>

        <Step n={5} step={s.steps[4]}>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="text-xs uppercase tracking-wide text-slate">Readiness stages</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {s.stages.map((st) => (
                  <li key={st.key} className="flex items-center justify-between gap-3">
                    <span className="text-navy">{st.title}</span>
                    <span className={`rounded-pill px-2 py-0.5 text-xs ${st.status === "ready" ? "bg-emerald-50 text-emerald-800" : st.status === "blocked" ? "bg-red-50 text-red-700" : "bg-warmwhite text-slate"}`}>{st.status}</span>
                  </li>
                ))}
              </ul>
              <h3 className="mt-4 text-xs uppercase tracking-wide text-slate">Owner-session work</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {s.ownerWork.map((w) => (
                  <li key={w.path} className="flex items-center justify-between gap-3">
                    <span className="text-navy">{w.label} <span className="text-xs text-slate">· <code>{w.path}</code> in the owner&rsquo;s dashboard</span></span>
                    <span className="text-xs text-slate">{w.done ? "ready" : "open"}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate">Not linked on purpose: the dashboard resolves its contractor from the signed-in owner&rsquo;s own session, not from this page, so a link from here could open a different business. The owner does this work signed in as themselves; audited staff entry is not built.</p>
            </div>
            <div>
              <h3 className="text-xs uppercase tracking-wide text-slate">What still blocks launch, and why</h3>
              {s.remaining.length === 0 ? (
                <p className="mt-2 text-sm text-slate">Nothing. The launch check passes.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {s.remaining.map((b, i) => (
                    <li key={`${b.code}-${i}`} className="rounded-card border border-red-100 bg-red-50 p-2">
                      <span className="font-medium text-red-800">{b.code.replaceAll("_", " ").toLowerCase()}</span>
                      <span className="text-navy"> — {b.message}{b.serviceSlug ? <span className="text-slate"> ({b.serviceSlug})</span> : null}</span>
                      {b.href ? <span className="ml-2 text-xs text-slate">owner&rsquo;s dashboard: <code>{b.href}</code></span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Step>

        <Step n={6} step={s.steps[5]}>
          {s.progress === "ready" && (
            <form action={launchAction} className="mt-3 flex flex-wrap items-center gap-3">
              <input type="hidden" name="contractorId" value={id} />
              <label className="flex items-center gap-2 text-sm text-navy"><input type="checkbox" name="confirm" value="yes" required /> I confirm: put every offered service live that its own activation guard allows{s.launch.live > 0 ? " (services already live are left as they are)" : ""}.</label>
              <button type="submit" className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy/90">{s.launch.live > 0 ? `Retry launch (${s.launch.pending} not yet live)` : "Launch"}</button>
            </form>
          )}
          {(s.launch.live > 0 || s.progress === "ready" || s.progress === "launched") && s.launch.offered.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs uppercase tracking-wide text-slate">Launch outcomes · {s.launch.live} live · {s.launch.pending} not live</h3>
              <p className="mt-1 text-xs text-slate">Read fresh from each service&rsquo;s own activation guard, so this stays true after a reload.</p>
              <ul className="mt-2 space-y-1 text-sm">
                {s.launch.offered.map((o) => (
                  <li key={o.serviceId} className="flex items-start justify-between gap-3">
                    <span className="text-navy">{o.name} <span className="text-xs text-slate">({o.slug})</span></span>
                    {o.live ? <span className="shrink-0 rounded-pill bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">live</span>
                      : <span className="shrink-0 text-right text-xs"><span className="rounded-pill bg-red-50 px-2 py-0.5 text-red-700">{o.refusal ? o.refusal.code.replaceAll("_", " ").toLowerCase() : "not live"}</span>{o.refusal ? <span className="mt-1 block max-w-md text-slate">{o.refusal.message}</span> : null}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {s.progress === "launched" && <p className="mt-2 text-sm text-slate">Live: every offered service passed its guard.</p>}
        </Step>
      </ol>

      {!retired && (
        <section className="mt-10 rounded-card border border-red-200 bg-white p-5 shadow-card">
          <h2 className="font-display text-lg font-bold text-red-800">Retire this business</h2>
          <p className="mt-1 text-sm text-slate">The reversible form of delete. Sets the business, its storefront and every service inactive in one step, so nothing is reachable by homeowners or by its owner&rsquo;s dashboard. Deletes nothing: the catalog, quotes, bookings and payment records stay. Retiring cannot be undone from this panel yet.</p>
          <form action={retireAction} className="mt-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="contractorId" value={id} />
            <label className="text-sm">
              <span className="block text-xs uppercase tracking-wide text-slate">Type the web address to confirm: <code>{c.slug}</code></span>
              <input name="confirmSlug" required autoComplete="off" className="mt-1 w-72 rounded-md border border-red-200 px-3 py-2" placeholder={c.slug} />
            </label>
            <label className="flex items-center gap-2 text-sm text-navy"><input type="checkbox" name="confirm" value="yes" required /> I understand the storefront goes down now.</label>
            <button type="submit" className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800">Retire {c.name}</button>
          </form>
        </section>
      )}

      <p className="mt-10 text-xs text-slate">Viewed as {s.facts.actor.role}. Each submission is one command; a repeat converges on the same rows rather than creating more.</p>
    </div>
  );
}

function Progress({ progress }: { progress: "not-started" | "in-progress" | "blocked" | "ready" | "launched" | "retired" }) {
  const tone = progress === "launched" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : progress === "ready" ? "bg-electric/10 text-electric border-electric/30" : progress === "blocked" ? "bg-p2b-amber-tint text-p2b-amber-ink border-p2b-amber-ink/40" : progress === "retired" ? "bg-navy text-white border-navy" : "bg-white text-slate border-cardline";
  return <span className={`rounded-pill border px-3 py-1 text-xs font-medium ${tone}`}>{progress.replace("-", " ")}</span>;
}

function Step({ n, step, children }: { n: number; step: { title: string; status: "done" | "todo" | "blocked"; detail: string }; children?: React.ReactNode }) {
  const mark = step.status === "done" ? "✓" : step.status === "blocked" ? "·" : String(n);
  const tone = step.status === "done" ? "bg-emerald-600 text-white" : step.status === "blocked" ? "bg-warmwhite text-slate" : "bg-electric text-white";
  return (
    <li className="rounded-card border border-cardline bg-white p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${tone}`}>{mark}</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold text-navy">{step.title}</h2>
          <p className="mt-0.5 text-sm text-slate">{step.detail}</p>
          {children}
        </div>
      </div>
    </li>
  );
}
