"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/flow-types";

type LineItem = {
  id: string;
  serviceName: string;
  serviceSlug: string;
  isPrimary: boolean;
  priceCents: number;
};

type Suggestion = {
  id: string;
  slug: string;
  name: string;
  whileWeThereBasePrice: number;
};

export default function MyVisitPage() {
  const router = useRouter();
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [totalCents, setTotalCents] = useState(0);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const [visitRes, wwtRes] = await Promise.all([
      fetch("/api/visit").then((r) => r.json()),
      fetch("/api/visit/while-we-there").then((r) => r.json()),
    ]);
    setLineItems(visitRes.lineItems ?? []);
    setTotalCents(visitRes.totalCents ?? 0);
    setSuggestions(wwtRes.suggestions ?? []);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addSuggestion(s: Suggestion) {
    await fetch("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId: s.id,
        computedPriceCents: s.whileWeThereBasePrice,
        isPrimary: false,
        answersSnapshot: {},
      }),
    });
    refresh();
  }

  if (loading) {
    return <div className="py-16 text-center text-slate">Loading...</div>;
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-display text-2xl font-bold text-navy">My Visit</h1>

      {lineItems.length === 0 ? (
        <p className="mt-4 text-slate">
          Nothing added yet. <a href="/services" className="text-electric">Browse services</a> to get started.
        </p>
      ) : (
        <>
          <div className="mt-6 divide-y divide-cardline rounded-card border border-cardline bg-white shadow-card">
            {lineItems.map((li) => (
              <div key={li.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="text-sm font-semibold text-navy">{li.serviceName}</div>
                  {!li.isPrimary && <div className="text-xs text-slate">While We're There add-on</div>}
                </div>
                <div className="text-sm font-semibold text-navy">{formatCents(li.priceCents)}</div>
              </div>
            ))}
            <div className="flex items-center justify-between bg-warmwhite p-4">
              <div className="font-display text-lg font-bold text-navy">Subtotal</div>
              <div className="font-display text-lg font-bold text-navy">{formatCents(totalCents)}</div>
            </div>
          </div>

          {suggestions.length > 0 && (
            <div className="mt-10">
              <h2 className="font-display text-lg font-bold text-navy">
                Would you like us to take care of anything else while we're there?
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => addSuggestion(s)}
                    className="rounded-card border border-cardline bg-white p-4 text-left shadow-card transition hover:border-electric"
                  >
                    <div className="text-sm font-semibold text-navy">{s.name}</div>
                    <div className="mt-1 text-sm text-success">
                      +{formatCents(s.whileWeThereBasePrice)}{" "}
                      <span className="text-xs text-slate">while we're there</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => router.push("/checkout/schedule")}
            className="mt-10 w-full rounded-pill bg-electric py-3.5 font-semibold text-white transition hover:bg-electric-hover"
          >
            Choose My Appointment Time
          </button>
        </>
      )}
    </main>
  );
}
