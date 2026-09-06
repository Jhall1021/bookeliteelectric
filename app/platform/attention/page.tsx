import Link from "next/link";
import { platformOverview, STUCK_AFTER_DAYS } from "@/lib/platformReadModel";

export const dynamic = "force-dynamic";

/**
 * Attention needed — strictly actionable, per the 29 August decision.
 * A contractor is here only when a person at Price2Book should do something
 * today. What is NOT here, and why, is stated on the page rather than implied.
 */
export default async function PlatformAttentionPage() {
  const o = await platformOverview();
  return (
    <div>
      <header>
        <h1 className="font-display text-2xl font-bold text-navy">Attention needed</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate">
          What needs somebody&rsquo;s attention today &mdash; not every condition the software can enumerate.
        </p>
      </header>
      {o.attention.length === 0 ? (
        <p className="mt-6 rounded-card border border-cardline bg-white p-4 text-sm text-slate">Nothing. Every contractor past setup passes its launch check, external calendars are connected, and nobody is stuck.</p>
      ) : (
        <ul className="mt-6 divide-y divide-cardline rounded-card border border-cardline bg-white">
          {o.attention.map((a) => (
            <li key={`${a.contractorId}:${a.code}`} className="px-4 py-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="font-medium text-navy">{a.name}</span>
                  <span className="ml-2 rounded-pill bg-p2b-amber-tint px-2 py-0.5 text-xs font-medium text-p2b-amber-ink">{a.code.replaceAll("_", " ").toLowerCase()}</span>
                  <p className="mt-1 text-slate">{a.message}</p>
                </div>
                <Link href={a.href} className="shrink-0 font-medium text-electric hover:underline">Open control center</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
      <section className="mt-8 text-xs text-slate">
        <p className="font-medium text-navy">What this list can and cannot see</p>
        <p className="mt-1">It sees: a launch check failing after setup was finished or services went live; material costs blocking launch; an external calendar that is not connected; a setup idle for {STUCK_AFTER_DAYS}+ days. It cannot yet see failed payments, expired invitations, email delivery failures, whether an embed was actually installed, or template updates awaiting review &mdash; none of those has a data source today, so none is guessed.</p>
      </section>
    </div>
  );
}
