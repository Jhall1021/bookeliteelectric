import Link from "next/link";
import { platformOnboardingIndex, noticeText } from "@/lib/platformOnboarding";
import { startContractorAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Founder onboarding — start a contractor, or resume one.
 *
 * The list is the directory with each contractor's derived progress: five
 * words the database already knows how to say (not started, in progress,
 * blocked, ready, launched). Starting a contractor creates the tenant and
 * nothing else; every later step is a separate, resumable submission on the
 * contractor's own onboarding page.
 */
export default async function PlatformOnboardingIndex({ searchParams }: { searchParams?: { notice?: string } }) {
  const { rows, trades, actor } = await platformOnboardingIndex();
  const notice = noticeText(searchParams?.notice);
  const open = rows.filter((r) => !r.readable || r.progress !== "launched");
  const launched = rows.filter((r) => r.readable && r.progress === "launched");
  return (
    <div>
      <header>
        <h1 className="font-display text-2xl font-bold text-navy">Onboarding</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate">
          Bring a contractor onto Price2Book: identity, owner, trade, catalog — then the owner&rsquo;s own setup, then launch through the same guards their dashboard uses.
          Each step is its own submission, so you can stop and come back; progress is read from the contractor&rsquo;s data, not stored by this page.
        </p>
      </header>

      {notice && <p className={`mt-4 rounded-card border px-4 py-3 text-sm ${notice.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-p2b-amber-ink/40 bg-p2b-amber-tint text-p2b-amber-ink"}`}>{notice.text}</p>}

      <section className="mt-8 rounded-card border border-cardline bg-white p-5 shadow-card">
        <h2 className="font-display text-lg font-bold text-navy">Start a contractor</h2>
        <p className="mt-1 text-xs text-slate">Creates the business, its storefront address and its guided-setup record. No owner, no trade, nothing a homeowner can reach yet. A web address already in use resumes that contractor instead of creating a second one.</p>
        <form action={startContractorAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-sm">
            <span className="block text-xs uppercase tracking-wide text-slate">Business name</span>
            <input name="name" required maxLength={120} className="mt-1 w-full rounded-md border border-cardline px-3 py-2" placeholder="Northside Electric" />
          </label>
          <label className="text-sm">
            <span className="block text-xs uppercase tracking-wide text-slate">Web address (optional)</span>
            <input name="slug" maxLength={48} pattern="[a-z0-9][a-z0-9-]{1,46}[a-z0-9]" className="mt-1 w-full rounded-md border border-cardline px-3 py-2" placeholder="northside-electric" />
          </label>
          <button type="submit" className="self-end rounded-md bg-electric px-4 py-2 text-sm font-medium text-white hover:bg-electric/90">Create</button>
        </form>
        <p className="mt-2 text-xs text-slate">Published catalogs: {trades.join(", ") || "none"}.</p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg font-bold text-navy">In onboarding</h2>
        {open.length === 0 ? <p className="mt-2 text-sm text-slate">Every contractor is launched.</p> : <Rows rows={open} />}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg font-bold text-navy">Launched</h2>
        {launched.length === 0 ? <p className="mt-2 text-sm text-slate">None yet.</p> : <Rows rows={launched} />}
      </section>

      <p className="mt-10 text-xs text-slate">Signed in as {actor.email}, {actor.role}. Every change on these pages goes through one reviewed command layer and the authority that already owns the decision.</p>
    </div>
  );
}

function Rows({ rows }: { rows: Awaited<ReturnType<typeof platformOnboardingIndex>>["rows"] }) {
  return (
    <ul className="mt-3 divide-y divide-cardline rounded-card border border-cardline bg-white">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
          <div>
            <Link href={`/platform/onboarding/${r.id}`} className="font-medium text-electric hover:underline">{r.name}</Link>
            <span className="ml-2 text-xs text-slate">{r.slug} · owners: {r.owners.join(", ") || "none"}</span>
          </div>
          <div className="flex items-center gap-3">
            {r.readable ? <ProgressPill progress={r.progress} /> : <span className="rounded-pill bg-red-50 px-2 py-0.5 text-xs text-red-700" title={r.error}>could not be read</span>}
            {r.readable && <span className="text-xs text-slate">{r.live} live · {r.blockers} blocker{r.blockers === 1 ? "" : "s"}</span>}
            <Link href={`/platform/onboarding/${r.id}`} className="text-xs font-medium text-electric hover:underline">{r.readable && r.progress === "launched" ? "Open" : "Resume"}</Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ProgressPill({ progress }: { progress: "not-started" | "in-progress" | "blocked" | "ready" | "launched" }) {
  const tone = progress === "launched" ? "bg-emerald-50 text-emerald-800" : progress === "ready" ? "bg-electric/10 text-electric" : progress === "blocked" ? "bg-p2b-amber-tint text-p2b-amber-ink" : "bg-warmwhite text-slate";
  return <span className={`rounded-pill px-2 py-0.5 text-xs font-medium ${tone}`}>{progress.replace("-", " ")}</span>;
}
