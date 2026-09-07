import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformContractorNotFoundError } from "@/lib/platformContext";
import { platformOnboardingContractor, noticeText } from "@/lib/platformOnboarding";
import { attachOwnerAction, enrolTradeAction, installTemplateAction, launchAction } from "../actions";

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
  const ownerDone = s.owners.length > 0;
  const tradeDone = s.facts.trades.length > 0;
  const catalogDone = s.facts.catalog.total > 0;

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

      <ol className="mt-8 space-y-4">
        <Step n={1} step={s.steps[0]} />

        <Step n={2} step={s.steps[1]}>
          {!ownerDone && (
            <form action={attachOwnerAction} className="mt-3 flex flex-wrap items-end gap-3">
              <input type="hidden" name="contractorId" value={id} />
              <label className="text-sm">
                <span className="block text-xs uppercase tracking-wide text-slate">Owner&rsquo;s account email</span>
                <input name="email" type="email" required className="mt-1 w-72 rounded-md border border-cardline px-3 py-2" placeholder="owner@example.com" />
              </label>
              <button type="submit" className="rounded-md bg-electric px-4 py-2 text-sm font-medium text-white hover:bg-electric/90">Attach owner</button>
              <span className="text-xs text-slate">Must already have a confirmed Price2Book account (they sign up at <code>/sign-up</code>). Invitations by email are not built yet.</span>
            </form>
          )}
        </Step>

        <Step n={3} step={s.steps[2]}>
          {!tradeDone && (
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
          {tradeDone && !catalogDone && (
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
              <h3 className="mt-4 text-xs uppercase tracking-wide text-slate">Where the work happens</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {s.links.map((l) => (
                  <li key={l.href} className="flex items-center justify-between gap-3">
                    <a href={l.href} className="text-electric hover:underline">{l.label}</a>
                    <span className="text-xs text-slate">{l.done ? "ready" : "open"}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate">These open the contractor&rsquo;s own dashboard and need an owner&rsquo;s session there; staff entry into a contractor&rsquo;s dashboard is not built.</p>
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
                      {b.href ? <a href={b.href} className="ml-2 text-xs text-electric hover:underline">where</a> : null}
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
              <label className="flex items-center gap-2 text-sm text-navy"><input type="checkbox" name="confirm" value="yes" required /> I confirm: put every offered service live that its own activation guard allows.</label>
              <button type="submit" className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy/90">Launch</button>
            </form>
          )}
          {s.progress === "launched" && <p className="mt-2 text-sm text-slate">Live. Anything still refused by its guard shows in the Control Center&rsquo;s findings.</p>}
        </Step>
      </ol>

      <p className="mt-10 text-xs text-slate">Viewed as {s.facts.actor.role}. Each submission is one command; a repeat converges on the same rows rather than creating more.</p>
    </div>
  );
}

function Progress({ progress }: { progress: "not-started" | "in-progress" | "blocked" | "ready" | "launched" }) {
  const tone = progress === "launched" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : progress === "ready" ? "bg-electric/10 text-electric border-electric/30" : progress === "blocked" ? "bg-p2b-amber-tint text-p2b-amber-ink border-p2b-amber-ink/40" : "bg-white text-slate border-cardline";
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
