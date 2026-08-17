import { prisma } from "@/lib/prisma";
import QuotePricingForm from "@/components/admin/QuotePricingForm";
import { formatCents } from "@/lib/flow-types";

export default async function AdminQuotesPage() {
  const quotes = await prisma.quote.findMany({
    where: { status: { in: ["SUBMITTED", "IN_REVIEW"] } },
    include: {
      service: { select: { name: true, basePrice: true, whileWeThereBasePrice: true } },
      customer: { select: { name: true, email: true, phone: true } },
      photos: { select: { id: true, url: true, label: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const priced = await prisma.quote.findMany({
    where: { status: { in: ["PRICED", "APPROVED"] } },
    include: { service: { select: { name: true } }, customer: { select: { name: true } } },
    orderBy: { quotedAt: "desc" },
    take: 10,
  });

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-navy">Quote Review Queue</h1>
      <p className="mt-1 text-sm text-slate">
        {quotes.length} quote{quotes.length === 1 ? "" : "s"} waiting on a price.
      </p>

      {quotes.length === 0 && (
        <p className="mt-8 text-slate">Nothing pending — the queue is empty.</p>
      )}

      <div className="mt-6 space-y-6">
        {quotes.map((q) => (
          <div key={q.id} className="rounded-card border border-cardline bg-white p-6 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="font-display text-lg font-bold text-navy">{q.service.name}</div>
                <div className="mt-1 text-sm text-slate">
                  {q.customer.name} · {q.customer.email}
                  {q.customer.phone && ` · ${q.customer.phone}`}
                </div>
                <div className="mt-1 text-xs text-slate">
                  Submitted {new Date(q.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </div>
                {q.service.basePrice && (
                  <div className="mt-1 text-xs text-slate">
                    Reference: this service normally starts around {formatCents(q.service.basePrice)}
                  </div>
                )}
              </div>
              <span className="rounded-pill bg-electric/10 px-3 py-1 text-xs font-semibold text-electric">
                {q.status}
              </span>
            </div>

            {Object.keys(q.answersSnapshot as object).length > 0 && (
              <div className="mt-4 rounded-card bg-warmwhite p-3 text-xs text-slate">
                <span className="font-semibold text-navy">Answers: </span>
                {Object.entries(q.answersSnapshot as Record<string, string>)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ")}
              </div>
            )}

            {q.photos.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {q.photos.map((p) => (
                  <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="block">
                    <img src={p.url} alt={p.label} className="aspect-square w-full rounded-card border border-cardline object-cover" />
                    <div className="mt-1 text-xs text-slate">{p.label}</div>
                  </a>
                ))}
              </div>
            )}

            <QuotePricingForm quoteId={q.id} />
          </div>
        ))}
      </div>

      {priced.length > 0 && (
        <div className="mt-12">
          <h2 className="font-display text-lg font-bold text-navy">Recently Priced</h2>
          <div className="mt-4 divide-y divide-cardline rounded-card border border-cardline bg-white">
            {priced.map((q) => (
              <div key={q.id} className="flex items-center justify-between p-4 text-sm">
                <span className="text-navy">{q.service.name} — {q.customer.name}</span>
                <span className="text-slate">{q.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
