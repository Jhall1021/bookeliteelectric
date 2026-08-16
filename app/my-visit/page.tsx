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

type ServiceOption = {
  id: string;
  slug: string;
  name: string;
  whileWeThereBasePrice: number | null;
  startingPriceLabel: string | null;
  bookingType: string;
  categorySlug: string;
};

type CategoryGroup = {
  id: string;
  slug: string;
  name: string;
  services: ServiceOption[];
};

export default function MyVisitPage() {
  const router = useRouter();
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [totalCents, setTotalCents] = useState(0);
  const [quickPicks, setQuickPicks] = useState<ServiceOption[]>([]);
  const [categories, setCategories] = useState<CategoryGroup[]>([]);
  const [browsingAll, setBrowsingAll] = useState(false);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const [visitRes, wwtRes] = await Promise.all([
      fetch("/api/visit").then((r) => r.json()),
      fetch("/api/visit/while-we-there").then((r) => r.json()),
    ]);
    setLineItems(visitRes.lineItems ?? []);
    setTotalCents(visitRes.totalCents ?? 0);
    setQuickPicks(wwtRes.quickPicks ?? []);
    setCategories(wwtRes.categories ?? []);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addService(s: ServiceOption) {
    // Services without a preset While We're There price (remote-quote-only
    // jobs) don't have an instant add-on price to lock in — send the
    // customer into that service's own flow instead of faking a number.
    if (s.whileWeThereBasePrice === null) {
      router.push(`/services/${s.categorySlug}/${s.slug}`);
      return;
    }
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

          {(quickPicks.length > 0 || categories.length > 0) && (
            <div className="mt-10">
              <h2 className="font-display text-lg font-bold text-navy">
                Would you like us to take care of anything else while we're there?
              </h2>

              {!browsingAll && (
                <>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {quickPicks.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => addService(s)}
                        className="rounded-card border border-cardline bg-white p-4 text-left shadow-card transition hover:border-electric"
                      >
                        <div className="text-sm font-semibold text-navy">{s.name}</div>
                        <div className="mt-1 text-sm text-success">
                          +{formatCents(s.whileWeThereBasePrice!)}{" "}
                          <span className="text-xs text-slate">while we're there</span>
                        </div>
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => setBrowsingAll(true)}
                    className="mt-4 text-sm font-medium text-electric"
                  >
                    Browse all services →
                  </button>
                </>
              )}

              {browsingAll && (
                <div className="mt-4 space-y-2">
                  <button
                    onClick={() => setBrowsingAll(false)}
                    className="mb-2 text-sm font-medium text-electric"
                  >
                    ← Back to quick picks
                  </button>

                  {categories.map((cat) => (
                    <div key={cat.id} className="rounded-card border border-cardline bg-white shadow-card">
                      <button
                        onClick={() => setOpenCategory(openCategory === cat.id ? null : cat.id)}
                        className="flex w-full items-center justify-between p-4 text-left"
                      >
                        <span className="text-sm font-semibold text-navy">{cat.name}</span>
                        <span className="text-xs text-slate">{cat.services.length} services</span>
                      </button>
                      {openCategory === cat.id && (
                        <div className="divide-y divide-cardline border-t border-cardline">
                          {cat.services.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => addService(s)}
                              className="flex w-full items-center justify-between p-4 text-left hover:bg-warmwhite"
                            >
                              <span className="text-sm text-navy">{s.name}</span>
                              <span className="text-sm font-medium text-success">
                                {s.whileWeThereBasePrice !== null
                                  ? `+${formatCents(s.whileWeThereBasePrice)}`
                                  : s.startingPriceLabel ?? "Custom quote"}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
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
