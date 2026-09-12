import Link from "next/link";
import { platformOverview, attentionSummary, STUCK_AFTER_DAYS } from "@/lib/platformReadModel";

export const dynamic = "force-dynamic";

export default async function PlatformAttentionPage() {
  const o = await platformOverview();
  const summary = attentionSummary(o.attention, o.unreadable);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-electric">Platform admin</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-navy">Attention needed</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate">
            A focused queue of contractor issues that need a Price2Book staff member to act today.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-[260px]">
          <Summary label="Action items" value={o.attention.length} tone={o.attention.length > 0 ? "attention" : "calm"} />
          <Summary label="Unreadable" value={o.unreadable.length} tone={o.unreadable.length > 0 ? "danger" : "calm"} />
        </div>
      </header>

      {o.unreadable.length > 0 && (
        <section className="mt-6 overflow-hidden rounded-card border border-red-200 bg-red-50">
          <div className="border-b border-red-200 px-4 py-3 sm:px-5">
            <h2 className="font-display text-base font-bold text-red-900">Could not read contractor data</h2>
            <p className="mt-1 text-xs leading-relaxed text-red-800">
              Nothing in the action queue is treated as established for these contractors until their data can be read successfully.
            </p>
          </div>
          <ul className="divide-y divide-red-200/80">
            {o.unreadable.map((u) => (
              <li key={u.contractorId} className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <Link href={`/platform/contractors/${u.contractorId}`} className="font-semibold text-red-900 hover:underline">
                    {u.name}
                  </Link>
                  <p className="mt-0.5 break-words text-xs text-red-800">{u.error}</p>
                </div>
                <Link href={`/platform/contractors/${u.contractorId}`} className="shrink-0 text-xs font-semibold text-red-900 hover:underline">
                  Open contractor
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {o.attention.length === 0 ? (
        <div className={`mt-6 rounded-card border p-6 text-center ${summary.tone === "partial" ? "border-p2b-amber-ink/40 bg-p2b-amber-tint" : "border-cardline bg-white"}`}>
          <div className={`text-sm font-semibold ${summary.tone === "partial" ? "text-p2b-amber-ink" : "text-navy"}`}>No current action items</div>
          <p className={`mt-1 text-sm ${summary.tone === "partial" ? "text-p2b-amber-ink" : "text-slate"}`}>{summary.message}</p>
        </div>
      ) : (
        <section className="mt-6">
          <div className="mb-3">
            <h2 className="font-display text-lg font-bold text-navy">Staff action queue</h2>
            <p className="mt-0.5 text-xs text-slate">Only conditions with a clear staff follow-up appear here.</p>
          </div>
          <ul className="space-y-3">
            {o.attention.map((a) => (
              <li key={`${a.contractorId}:${a.code}`} className="rounded-card border border-cardline bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-navy">{a.name}</span>
                      <span className="rounded-pill bg-p2b-amber-tint px-2.5 py-1 text-[11px] font-semibold text-p2b-amber-ink">
                        {a.code.replaceAll("_", " ").toLowerCase()}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate">{a.message}</p>
                  </div>
                  <Link href={a.href} className="inline-flex shrink-0 items-center justify-center rounded-pill border border-cardline px-4 py-2 text-sm font-semibold text-electric transition hover:border-electric hover:bg-electric/5">
                    Open control center
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8 rounded-card border border-cardline bg-warmwhite/60 p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-navy">What this queue can see</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate">
          It includes a launch check failing after setup was finished or services went live, material costs blocking launch, an external calendar that is not connected, and setup with no activity for {STUCK_AFTER_DAYS}+ days. It does not invent signals for failed payments, expired invitations, email delivery, embed installation, or template updates because those do not have a reliable data source yet.
        </p>
      </section>
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: number; tone: "calm" | "attention" | "danger" }) {
  const toneClass = tone === "attention"
    ? "border-p2b-amber-ink/30 bg-p2b-amber-tint"
    : tone === "danger"
      ? "border-red-200 bg-red-50"
      : "border-cardline bg-white";
  return (
    <div className={`rounded-card border px-3 py-2.5 text-center shadow-sm ${toneClass}`}>
      <div className="font-display text-xl font-bold tabular-nums text-navy">{value}</div>
      <div className="mt-0.5 text-[11px] font-medium text-slate">{label}</div>
    </div>
  );
}
