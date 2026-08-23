"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/flow-types";
import Image from "next/image";
import { ServiceIcon } from "@/components/shared/Icons";
import { getServiceImage } from "@/lib/serviceImages";

type LineItemGroup = {
  serviceId: string;
  serviceName: string;
  serviceSlug: string;
  categorySlug: string;
  requiresQualification: boolean;
  isPrimary: boolean;
  whileWeThereBasePrice: number | null;
  quantity: number;
  totalPriceCents: number;
  /** True while the office is still pricing this one. */
  awaitingQuote: boolean;
  /** The running total where the flow stopped — a floor, not an estimate. */
  floorPriceCents: number | null;
  lineItemIds: string[];
};

type ServiceOption = {
  id: string;
  slug: string;
  name: string;
  whileWeThereBasePrice: number | null;
  startingPriceLabel: string | null;
  bookingType: string;
  categorySlug: string;
  /** True when this service has a decision tree that sets its price. */
  requiresQualification: boolean;
  quantityInVisit: number;
  shortDescription: string | null;
  icon: string | null;
};

type CategoryGroup = {
  id: string;
  slug: string;
  name: string;
  services: ServiceOption[];
};

export default function MyVisitPage() {
  const router = useRouter();
  const [lineItems, setLineItems] = useState<LineItemGroup[]>([]);
  const [totalCents, setTotalCents] = useState(0);
  const [awaitingQuote, setAwaitingQuote] = useState(0);
  const [quickPicks, setQuickPicks] = useState<ServiceOption[]>([]);
  const [categories, setCategories] = useState<CategoryGroup[]>([]);
  const [browsingAll, setBrowsingAll] = useState(false);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pricingNotice, setPricingNotice] = useState<string | null>(null);

  async function refresh() {
    const [visitRes, wwtRes] = await Promise.all([
      fetch("/api/visit").then((r) => r.json()),
      fetch("/api/visit/while-we-there").then((r) => r.json()),
    ]);
    setLineItems(visitRes.lineItems ?? []);
    setTotalCents(visitRes.totalCents ?? 0);
    setAwaitingQuote(visitRes.awaitingQuote ?? 0);
    setQuickPicks(wwtRes.quickPicks ?? []);
    setCategories(wwtRes.categories ?? []);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addService(s: ServiceOption) {
    // No add-on price, or a tree that determines it — either way the flow has
    // to run. Adding straight from the cart used to skip the tree entirely for
    // anything with a While We're There rate, which included services whose
    // price depends on ceiling height and attic access.
    if (s.whileWeThereBasePrice === null || s.requiresQualification) {
      router.push(`/services/${s.categorySlug}/${s.slug}`);
      return;
    }
    const res = await fetch("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // No price, no primary claim. The server prices it and works out
        // whether it's the anchor job from the visit itself.
        serviceId: s.id,
        answersSnapshot: {},
      }),
    });
    // The server refuses anything that needs qualifying. If that fires it
    // means this service gained a tree since the page loaded — send them
    // through it rather than leaving the click doing nothing.
    if (res.status === 422) {
      router.push(`/services/${s.categorySlug}/${s.slug}`);
      return;
    }
    refresh();
  }

  async function removeOne(group: LineItemGroup) {
    const lastId = group.lineItemIds[group.lineItemIds.length - 1];
    const res = await fetch(`/api/visit?lineItemId=${lastId}`, { method: "DELETE" });
    const data = await res.json();
    if (data.pricingAdjusted) {
      setPricingNotice(
        "Since that was your last main service, one of your remaining items is now the main service for this visit and is priced at its standalone rate — everything else keeps its While We're There pricing."
      );
    }
    refresh();
  }

  async function addAnother(group: LineItemGroup) {
    // Anything whose price came from answers has to be answered again for the
    // second one. The first unit was qualified for one specific spot — a
    // ceiling height, an attic, a distance — and none of that carries to a
    // different room. Deliberately starts clean rather than reusing the
    // earlier answers: reuse is right within a flow, wrong across locations.
    if (group.requiresQualification) {
      router.push(`/services/${group.categorySlug}/${group.serviceSlug}`);
      return;
    }

    // No price sent, and none guessed here.
    //
    // This used to read whileWeThereBasePrice off the group and post it as
    // the price of the next unit. Two problems: the browser was deciding
    // what a unit costs, and for a service whose price depends on answers
    // that figure was wrong anyway. The server prices it.
    await fetch("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceId: group.serviceId, answersSnapshot: {} }),
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
          {pricingNotice && (
            <div className="mt-4 rounded-card border border-electric/30 bg-electric/5 p-4 text-sm text-navy">
              {pricingNotice}
            </div>
          )}

          <div className="mt-6 divide-y divide-cardline rounded-card border border-cardline bg-white shadow-card">
            {lineItems.map((li) => (
              <div key={`${li.serviceId}:${li.isPrimary}`} className="flex items-center justify-between p-4">
                <div>
                  <div className="text-sm font-semibold text-navy">{li.serviceName}</div>
                  {!li.isPrimary && !li.awaitingQuote && (
                    <div className="text-xs text-slate">While We&rsquo;re There add-on</div>
                  )}
                  {li.awaitingQuote && (
                    <div className="text-xs text-slate">
                      We&rsquo;ve got your photos — we&rsquo;ll confirm this price shortly
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 rounded-pill border border-cardline">
                    <button
                      onClick={() => removeOne(li)}
                      aria-label={`Remove one ${li.serviceName}`}
                      className="px-3 py-1 text-navy hover:text-electric"
                    >
                      −
                    </button>
                    <span className="min-w-[1.5rem] text-center text-sm font-medium text-navy">{li.quantity}</span>
                    <button
                      onClick={() => addAnother(li)}
                      aria-label={
                        li.requiresQualification
                          ? `Add another ${li.serviceName} — a few questions first`
                          : `Add another ${li.serviceName}`
                      }
                      title={
                        li.requiresQualification
                          ? "We'll ask about the new spot before adding it"
                          : undefined
                      }
                      className="px-3 py-1 text-navy hover:text-electric"
                    >
                      +
                    </button>
                  </div>
                  <div className="w-24 text-right text-sm font-semibold text-navy">
                    {li.awaitingQuote ? (
                      <>
                        {/* A floor, not an estimate. Every review branch
                            exists because something makes the job dearer, so
                            the number can only go up — saying "from" is the
                            honest form and it's the one that survives the
                            conversation when the real price arrives. */}
                        {li.floorPriceCents !== null && (
                          <span className="block text-navy">
                            From {formatCents(li.floorPriceCents)}
                          </span>
                        )}
                        <span className="block text-xs font-normal text-amber-700">
                          price to follow
                        </span>
                      </>
                    ) : (
                      formatCents(li.totalPriceCents)
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between bg-warmwhite p-4">
              <div className="font-display text-lg font-bold text-navy">
                Subtotal
                {awaitingQuote > 0 && (
                  <span className="ml-2 text-xs font-normal text-slate">
                    for everything priced so far
                  </span>
                )}
              </div>
              <div className="font-display text-lg font-bold text-navy">{formatCents(totalCents)}</div>
            </div>
          </div>

          {(quickPicks.length > 0 || categories.length > 0) && (
            <div className="mt-10">
              <h2 className="font-display text-lg font-bold text-navy">
                Would you like us to take care of anything else while we're there?
              </h2>
              <p className="mt-1 text-sm text-slate">
                {/* Was "your visit fee is already covered — anything you add
                    skips it, so it's priced lower". Two problems: there is no
                    itemised visit fee to skip, and same-visit pricing isn't
                    always lower. A dedicated circuit costs the same either
                    way, because none of the work gets shorter when the van is
                    already outside. */}
                Anything you add uses our same-visit pricing. Where being here already
                saves us time, that saving is in the price.
              </p>

              {!browsingAll && (
                <>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {quickPicks.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => addService(s)}
                        className="relative rounded-card border border-cardline bg-white p-4 text-left shadow-card transition hover:border-electric"
                      >
                        {s.quantityInVisit > 0 && (
                          <span className="absolute right-3 top-3 rounded-pill bg-electric px-2 py-0.5 text-xs font-semibold text-white">
                            ×{s.quantityInVisit} added
                          </span>
                        )}
                        {/* Photo band, matching the homepage and category
                            grids. This screen was the last surface still on
                            line icons. Locked to 4/3 so cards stay level. */}
                        {getServiceImage(s.slug) ? (
                          <div className="relative -mx-4 -mt-4 mb-3 aspect-[4/3] w-[calc(100%+2rem)] overflow-hidden rounded-t-card">
                            <Image
                              src={getServiceImage(s.slug)!.src}
                              alt={getServiceImage(s.slug)!.alt}
                              fill
                              className="object-cover"
                              sizes="(min-width: 640px) 300px, 90vw"
                            />
                          </div>
                        ) : (
                          <ServiceIcon icon={s.icon} className="h-7 w-7 text-electric" />
                        )}
                        <div className="mt-2 text-sm font-semibold text-navy">{s.name}</div>
                        {s.shortDescription && (
                          <div className="mt-1 text-xs text-slate line-clamp-2">{s.shortDescription}</div>
                        )}
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
                              className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-warmwhite"
                            >
                              <div className="flex items-start gap-3">
                                {getServiceImage(s.slug) ? (
                                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-card">
                                    <Image
                                      src={getServiceImage(s.slug)!.src}
                                      alt={getServiceImage(s.slug)!.alt}
                                      fill
                                      className="object-cover"
                                      sizes="48px"
                                    />
                                  </div>
                                ) : (
                                  <ServiceIcon icon={s.icon} className="h-6 w-6 shrink-0 text-electric" />
                                )}
                                <span className="text-sm text-navy">
                                  {s.name}
                                  {s.quantityInVisit > 0 && (
                                    <span className="ml-2 text-xs font-semibold text-electric">
                                      ×{s.quantityInVisit} added
                                    </span>
                                  )}
                                  {s.shortDescription && (
                                    <span className="mt-0.5 block text-xs text-slate">{s.shortDescription}</span>
                                  )}
                                </span>
                              </div>
                              <span className="shrink-0 text-sm font-medium text-success">
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

          {/* Scheduling waits on pricing. The customer can keep building the
              visit — that's the whole point of not dead-ending them — but a
              technician can't be dispatched against an unknown total. */}
          {awaitingQuote > 0 ? (
            <div className="mt-10 rounded-card border border-amber-200 bg-amber-50 p-5 text-center">
              <p className="font-medium text-navy">
                We&rsquo;re pricing{" "}
                {awaitingQuote === 1 ? "one item" : `${awaitingQuote} items`} for you
              </p>
              <p className="mt-1 text-sm text-slate">
                We&rsquo;ll email you as soon as it&rsquo;s ready — usually the same day — and
                you can pick your time then. Everything else is saved.
              </p>
              <button
                disabled
                className="mt-4 w-full cursor-not-allowed rounded-pill bg-slate/20 py-3.5 font-semibold text-slate"
              >
                Choose My Appointment Time
              </button>
            </div>
          ) : (
            <button
              onClick={() => router.push("/checkout/schedule")}
              className="mt-10 w-full rounded-pill bg-electric py-3.5 font-semibold text-white transition hover:bg-electric-hover"
            >
              Choose My Appointment Time
            </button>
          )}
        </>
      )}
    </main>
  );
}
