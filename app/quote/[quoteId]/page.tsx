"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/flow-types";

type QuoteStatus = "SUBMITTED" | "IN_REVIEW" | "PRICED" | "APPROVED" | "EXPIRED";

type QuoteData = {
  id: string;
  status: QuoteStatus;
  serviceName: string;
  serviceSlug: string;
  categorySlug: string;
  quotedPriceCents: number | null;
  depositRequired: boolean | null;
  photoCount: number;
};

export default function QuoteStatusPage({ params }: { params: { quoteId: string } }) {
  const router = useRouter();
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    fetch(`/api/quotes/${params.quoteId}`)
      .then((r) => r.json())
      .then((data) => {
        setQuote(data);
        setLoading(false);
      });
  }, [params.quoteId]);

  async function handleApprove() {
    setApproving(true);
    const res = await fetch(`/api/quotes/${params.quoteId}/approve`, { method: "POST" });
    if (res.ok) {
      router.push("/my-visit");
    } else {
      setApproving(false);
    }
  }

  if (loading) {
    return <div className="py-16 text-center text-slate">Loading...</div>;
  }

  if (!quote) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="font-display text-xl font-bold text-navy">Quote not found</h1>
        <p className="mt-2 text-slate">Double check the link, or start a new request.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <div className="rounded-card border border-cardline bg-white p-8 text-center shadow-card">
        <h1 className="font-display text-xl font-bold text-navy">{quote.serviceName}</h1>

        {(quote.status === "SUBMITTED" || quote.status === "IN_REVIEW") && (
          <>
            <div className="mx-auto mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-electric/10 text-2xl">
              📋
            </div>
            <p className="mt-4 text-slate">
              We've got your {quote.photoCount} photo{quote.photoCount === 1 ? "" : "s"} and
              we're reviewing them now. We'll email you a fixed price — usually within one
              business day. You can bookmark this page to check back.
            </p>
          </>
        )}

        {quote.status === "PRICED" && quote.quotedPriceCents !== null && (
          <>
            <div className="ray-accent mx-auto mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-2xl text-success">
              ✓
            </div>
            <p className="mt-4 text-slate">Your price is ready.</p>
            <div className="mt-2 font-display text-4xl font-bold text-navy">
              {formatCents(quote.quotedPriceCents)}
            </div>
            {quote.depositRequired && (
              <p className="mt-2 text-xs text-slate">A deposit is required for this job.</p>
            )}
            <button
              onClick={handleApprove}
              disabled={approving}
              className="mt-6 w-full rounded-pill bg-electric py-3.5 font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50"
            >
              {approving ? "..." : "Approve & Schedule"}
            </button>
          </>
        )}

        {quote.status === "APPROVED" && (
          <>
            <div className="mx-auto mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-2xl text-success">
              ✓
            </div>
            <p className="mt-4 text-slate">
              You've approved this quote. Continue to your visit to pick an arrival window.
            </p>
            <button
              onClick={() => router.push("/my-visit")}
              className="mt-6 w-full rounded-pill bg-electric py-3.5 font-semibold text-white hover:bg-electric-hover"
            >
              Go to My Visit
            </button>
          </>
        )}

        {quote.status === "EXPIRED" && (
          <p className="mt-4 text-slate">
            This quote has expired. Please start a new request for an up-to-date price.
          </p>
        )}
      </div>
    </main>
  );
}
