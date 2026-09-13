import QuotePricingForm from "@/components/admin/QuotePricingForm";
import { formatCents } from "@/lib/flow-types";
import { withAdminContractor } from "@/lib/adminContext";

export default async function AdminQuotesPage() {
  // Guarded. Quote derives its owner through Service (ADR-011), so this
  // review queue holds only this contractor's quotes — it previously listed
  // every contractor's, complete with customer names, emails and phones.
  const { quotes, photosByQuote, priced } = await withAdminContractor(async (db) => {
    const quotes = await db.quote.findMany({
      where: { status: { in: ["SUBMITTED", "IN_REVIEW"] } },
      include: {
        service: { select: { name: true, basePrice: true, whileWeThereBasePrice: true } },
        customer: { select: { name: true, email: true, phone: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    // Rooted at Photo, not pulled through the quote's include. Photo is
    // direct-owned, so a rooted query is scoped by its own contractorId;
    // read as a nested relation it would be invisible to the guard entirely
    // (ADR-007) and scoped only by whatever the parent happened to be.
    const photos = await db.photo.findMany({
      where: { quoteId: { in: quotes.map((q) => q.id) } },
      select: { id: true, url: true, label: true, quoteId: true },
    });
    const photosByQuote = new Map<string, { id: string; url: string; label: string }[]>();
    for (const p of photos) {
      if (!p.quoteId) continue;
      photosByQuote.set(p.quoteId, [...(photosByQuote.get(p.quoteId) ?? []), p]);
    }

    const priced = await db.quote.findMany({
      where: { status: { in: ["PRICED", "APPROVED"] } },
      include: { service: { select: { name: true } }, customer: { select: { name: true } } },
      orderBy: { quotedAt: "desc" },
      take: 10,
    });

    return { quotes, photosByQuote, priced };
  });

  const submitted = quotes.filter((q) => q.status === "SUBMITTED").length;
  const inReview = quotes.filter((q) => q.status === "IN_REVIEW").length;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-electric">Customer requests</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-navy">Photo Review</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate">
            Review the customer&apos;s answers and photos, decide the price, and send it back without a site visit.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-pill bg-electric/10 px-3 py-1.5 text-xs font-semibold text-electric">
            {quotes.length} waiting
          </span>
          {submitted > 0 && (
            <span className="rounded-pill bg-white px-3 py-1.5 text-xs font-semibold text-slate ring-1 ring-cardline">
              {submitted} new
            </span>
          )}
          {inReview > 0 && (
            <span className="rounded-pill bg-white px-3 py-1.5 text-xs font-semibold text-slate ring-1 ring-cardline">
              {inReview} in review
            </span>
          )}
        </div>
      </header>

      {quotes.length === 0 ? (
        <section className="mt-6 rounded-card border border-dashed border-cardline bg-white px-6 py-12 text-center shadow-card">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-success/10 text-success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
            </svg>
          </div>
          <h2 className="mt-3 font-display text-lg font-bold text-navy">You&apos;re caught up</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate">
            There are no customer photo requests waiting for a price right now.
          </p>
        </section>
      ) : (
        <div className="mt-6 space-y-5">
          {quotes.map((q, index) => {
            const photos = photosByQuote.get(q.id) ?? [];
            const answers = Object.entries(q.answersSnapshot as Record<string, string>);
            return (
              <article key={q.id} className="overflow-hidden rounded-card border border-cardline bg-white shadow-card">
                <div className="border-b border-cardline bg-warmwhite px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-electric text-sm font-bold text-white">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-display text-lg font-bold text-navy">{q.service.name}</h2>
                          <span className={`rounded-pill px-2.5 py-1 text-[11px] font-bold ${
                            q.status === "SUBMITTED"
                              ? "bg-electric/10 text-electric"
                              : "bg-amber-50 text-amber-800"
                          }`}>
                            {q.status === "SUBMITTED" ? "New request" : "In review"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate">
                          {q.customer.name} · {q.customer.email}{q.customer.phone && ` · ${q.customer.phone}`}
                        </p>
                        <p className="mt-1 text-xs text-slate">
                          Submitted {new Date(q.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </div>
                    </div>

                    {q.service.basePrice && (
                      <div className="rounded-card border border-cardline bg-white px-3.5 py-2.5 text-right">
                        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate">Usual service reference</p>
                        <p className="mt-0.5 text-sm font-bold text-navy">Starts around {formatCents(q.service.basePrice)}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-5 py-5 sm:px-6">
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <section>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-bold text-navy">Customer details</h3>
                        <span className="text-xs text-slate">{answers.length} answer{answers.length === 1 ? "" : "s"}</span>
                      </div>

                      {answers.length > 0 ? (
                        <dl className="mt-3 divide-y divide-cardline overflow-hidden rounded-card border border-cardline bg-white">
                          {answers.map(([key, value]) => (
                            <div key={key} className="grid gap-1 px-3.5 py-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:gap-4">
                              <dt className="text-xs font-semibold text-slate">{key}</dt>
                              <dd className="text-sm font-medium text-navy">{value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <div className="mt-3 rounded-card border border-dashed border-cardline bg-warmwhite p-4 text-sm text-slate">
                          No additional customer answers were captured for this request.
                        </div>
                      )}
                    </section>

                    <section>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-bold text-navy">Photos</h3>
                        <span className="text-xs text-slate">{photos.length} photo{photos.length === 1 ? "" : "s"}</span>
                      </div>

                      {photos.length > 0 ? (
                        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                          {photos.map((p) => (
                            <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="group block overflow-hidden rounded-card border border-cardline bg-white transition hover:border-electric hover:shadow-card">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={p.url} alt={p.label} className="aspect-[4/3] w-full object-cover" />
                              <div className="flex items-center justify-between gap-2 border-t border-cardline px-3 py-2">
                                <span className="truncate text-xs font-medium text-navy">{p.label}</span>
                                <span className="text-[10px] font-semibold text-electric opacity-70 transition group-hover:opacity-100">Open ↗</span>
                              </div>
                            </a>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-3 rounded-card border border-dashed border-cardline bg-warmwhite p-4 text-sm text-slate">
                          No photos were attached to this request.
                        </div>
                      )}
                    </section>
                  </div>

                  <QuotePricingForm quoteId={q.id} />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {priced.length > 0 && (
        <section className="mt-10">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate">Recent activity</p>
              <h2 className="mt-1 font-display text-lg font-bold text-navy">Recently priced</h2>
            </div>
            <span className="text-xs text-slate">Latest {priced.length}</span>
          </div>

          <div className="mt-3 overflow-hidden rounded-card border border-cardline bg-white shadow-card">
            {priced.map((q) => (
              <div key={q.id} className="flex flex-col gap-1 border-b border-cardline px-4 py-3.5 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div>
                  <p className="text-sm font-semibold text-navy">{q.service.name}</p>
                  <p className="text-xs text-slate">{q.customer.name}</p>
                </div>
                <span className="w-fit rounded-pill bg-success/10 px-2.5 py-1 text-[11px] font-bold text-success">
                  {q.status === "APPROVED" ? "Approved" : "Price sent"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
