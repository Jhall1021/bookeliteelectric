import Image from "next/image";
import Link from "next/link";
import Hero from "@/components/home/Hero";
import FeaturedServices, { type FeaturedItem } from "@/components/home/FeaturedServices";
import Section from "@/components/theme/Section";
import Card from "@/components/theme/Card";
import { requireHostedSite, withSite } from "@/lib/siteRouting";
import { sameVisitAvailable } from "@/lib/sameVisit";
import { prisma } from "@/lib/prisma";
import { ANONYMOUS_IDENTITY, IDENTITY_SELECT, resolveIdentity } from "@/lib/storefrontIdentity";
import { pricingCopy } from "@/lib/pricingCopy";
import { formatCents } from "@/lib/flow-types";
import { getServiceImage } from "@/lib/serviceImages";

/**
 * Three above the fold, not six.
 *
 * Licensed, insured and professional are table stakes — every electrician
 * claims them, so they persuade nobody and they crowd out the things that
 * actually distinguish this. They move down the page.
 *
 * What's left is the three things a homeowner can't get from the competition,
 * with the same-visit pricing in the middle where the eye lands.
 */
const DIFFERENTIATORS = (pricingPromise: string, sameVisit: boolean) => [
  // The pricing promise is the contractor's model talking. "Upfront flat-rate
  // pricing" is a claim a time-and-materials contractor cannot make.
  pricingPromise,
  // And same-visit pricing is a claim a contractor with no add-on prices
  // cannot make. It was unconditional, so it described what Price2Book
  // supports rather than what this contractor offers.
  ...(sameVisit ? ["Same-visit pricing on extra work"] : []),
  "Narrow arrival windows",
];

const CREDENTIALS = [
  "Licensed & insured",
  "Professional electricians",
  "All major credit cards accepted",
];

/**
 * Two rows, not three.
 *
 * A third rung said nothing the second hadn't already — the pattern is
 * established by the contrast, and repeating it just cost height in the one
 * place on the page where height is expensive.
 *
 * Still no numbers, percentages or bars. The saving genuinely varies by
 * service — an additional recessed light is a fraction of the first, a second
 * outlet swap is nearly the same — so anything proportional would draw a
 * ratio that doesn't exist.
 */
const PRICING_LADDER = [
  { label: "First service", price: "Regular service price", muted: false },
  { label: "Additional services", price: "Same-visit price", muted: true },
];

/**
 * Which six to feature. The CURATION stays here — it's a merchandising choice,
 * not something to derive — but the names and prices come from the database.
 *
 * They used to be hardcoded alongside the slugs, with a comment noting they'd
 * been "re-synced" after drifting. They drifted again: recessed lighting reads
 * $375 here and $385 in the database after its pricing was derived from real
 * labor. A price on the homepage that doesn't match the booking page is worse
 * than no price.
 */
const FEATURED = [
  { slug: "replace-standard-outlet", label: "Outlet Replacement", icon: "outlet", category: "outlets-switches" },
  { slug: "replace-interior-light-fixture", label: "Light Fixture Replacement", icon: "light", category: "lighting" },
  { slug: "replace-ceiling-fan", label: "Ceiling Fan Installation", icon: "fan", category: "fans" },
  { slug: "tv-installation", label: "TV Mount Installation", icon: "tv", category: "tv-media" },
  { slug: "recessed-lighting", label: "Recessed Lighting", icon: "recessed", category: "lighting" },
  { slug: "level-2-ev-charger", label: "EV Charger Installation", icon: "ev", category: "ev-garage" },
];

export default async function HomePage({ params }: { params: { site: string } }) {
  // ADR §2.2. The storefront is identified by the URL segment, before any
  // catalog query. The featured list below names service SLUGS, and resolving
  // the tenant from one of those would be the forbidden shape: the request
  // would be answered for whichever contractor owned that slug.
  const site = await requireHostedSite(params.site);

  // A server component cannot read the client context the chrome uses, so it
  // resolves the same two layers from the same place. Routing data only —
  // identity and pricing model, never a derived presentation value.
  const c = await prisma.contractor.findUnique({
    where: { id: site.contractorId },
    select: { ...IDENTITY_SELECT, pricingStrategy: true },
  });
  const identity = c ? resolveIdentity(c) : ANONYMOUS_IDENTITY;
  const copy = pricingCopy(c?.pricingStrategy);

  // Live prices, so a repricing reaches the homepage without anyone
  // remembering to edit this file.
  // Whether this contractor can actually place a second service on one visit.
  // Everything below that promises same-visit pricing is gated on it.
  const sameVisit = await withSite(site, (db) => sameVisitAvailable(db, site.contractorId));

  const featured = await withSite(site, (db) =>
    db.service.findMany({
    where: { slug: { in: FEATURED.map((f) => f.slug) }, active: true },
    select: {
      slug: true,
      name: true,
      basePrice: true,
      startingPriceLabel: true,
      // ADR-007: Service-rooted, so traversing to the tenant-owned
      // contractor category and on to the canonical row is safe.
      contractorCategory: { select: { canonicalCategory: { select: { slug: true } } } },
    },
    })
  );
  const bySlug = new Map(featured.map((s) => [s.slug, s]));

  // Shaped here so the presentation component takes data and no Prisma types.
  // A featured service that has been deactivated is dropped rather than left
  // as a dead card.
  const featuredItems: FeaturedItem[] = FEATURED.flatMap((svc) => {
    const live = bySlug.get(svc.slug);
    if (!live) return [];
    const image = getServiceImage(svc.slug);
    return [{
      slug: svc.slug,
      label: svc.label,
      icon: svc.icon,
      image: image ? { src: image.src, alt: image.alt } : null,
      price: live.basePrice
        ? `${copy.priceLead} ${formatCents(live.basePrice)}`
        : live.startingPriceLabel ?? copy.noPriceLabel,
      // Keeps its fallback rather than throwing: this is a curated static list
      // carrying its own category constant, so a missing row degrades to the
      // hardcoded slug instead of taking the homepage down.
      href: `/${params.site}/services/${live.contractorCategory?.canonicalCategory.slug ?? svc.category}/${svc.slug}`,
    }];
  });

  return (
    <main>
      <Hero
        base={`/${params.site}`}
        ladder={sameVisit ? PRICING_LADDER : []}
        differentiators={DIFFERENTIATORS(copy.pricingDifferentiator, sameVisit)}
      />

      {/* How pricing works */}
      <Section>
        <div className="mx-auto max-w-6xl px-6">
        <h2 className="font-display text-2xl font-bold text-ink">{copy.pricingSectionTitle}</h2>
        <p className="mt-2 max-w-2xl text-muted">{copy.pricingSectionBody}</p>

        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          <Card className="p-6">
            <div className="ray-accent flex h-10 w-10 items-center justify-center rounded-full bg-electric text-sm font-bold text-white">
              1
            </div>
            <h3 className="mt-4 font-display text-base font-bold text-navy">
              Pick your first service
            </h3>
            {/* Deliberately not "visit fee" — there isn't a separate line for
                it, and naming a fee nobody is itemising invites the question
                "so how much is it?" The honest framing is that getting here is
                already inside the first price. */}
            <p className="mt-2 text-sm text-slate">
              Its price includes getting a licensed electrician to your home. You see
              that number before you book.
            </p>
          </Card>

          {/* Step two is the same-visit promise in prose. A contractor who
              cannot place a second service on one visit does not get to make
              it — the homeowner would read it, take the offer and be refused
              at the cart. */}
          {sameVisit && (
          <Card className="p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-electric text-sm font-bold text-white">
              2
            </div>
            <h3 className="mt-4 font-display text-base font-bold text-navy">
              Add anything else you need
            </h3>
            <p className="mt-2 text-sm text-slate">
              A second outlet, a fan, a few more lights. Additional work uses our
              same-visit pricing — where already being at your home saves us time,
              that saving is in the price. You see each one before you add it.
            </p>
          </Card>
          )}

          <Card className="p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-electric text-sm font-bold text-white">
              3
            </div>
            <h3 className="mt-4 font-display text-base font-bold text-navy">
              One total, no surprises
            </h3>
            <p className="mt-2 text-sm text-slate">
              See the full price for everything before you book — not after we&rsquo;re
              standing in your kitchen.
            </p>
          </Card>
        </div>

        {/* The credentials that used to sit in the hero. Every electrician
            claims them, so they reassure rather than persuade — which makes
            them worth saying, but not worth the best space on the page. */}
        <ul className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-2 border-t border-cardline pt-6 text-sm text-slate">
          {CREDENTIALS.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span className="text-success">✓</span>
              {item}
            </li>
          ))}
        </ul>
        </div>
      </Section>

      {/* Payment options */}
      <Section divide>
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-2xl font-bold text-navy">Flexible Payment Options</h2>
          <p className="mt-2 max-w-2xl text-slate">
            Pay however works best for you — all at the same upfront price you saw when you
            booked.
          </p>

          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <Card className="p-6">
              <h3 className="font-display text-base font-bold text-navy">All Major Credit Cards</h3>
              <p className="mt-2 text-sm text-slate">
                Visa, Mastercard, American Express, and Discover — pay with the card already in
                your wallet.
              </p>
            </Card>

            <Card className="p-6">
              <h3 className="font-display text-base font-bold text-navy">Pay Over Time</h3>
              <p className="mt-2 text-sm text-slate">
                Split larger jobs into monthly payments through Affirm, with rates shown upfront
                before you commit — no surprises, same as our pricing.
              </p>
            </Card>
          </div>
        </div>
      </Section>

      {/* Popular services */}
      <Section>
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-2xl font-bold text-ink">Most Popular Services</h2>
          <FeaturedServices items={featuredItems} />
        </div>
      </Section>

      {/* Service area */}
      <Section divide alt className="text-center">
        <h2 className="font-display text-2xl font-bold text-ink">
          {identity.serviceArea ? `Proudly Serving ${identity.serviceArea.label}` : "Our Service Area"}
        </h2>
        {identity.serviceArea?.imageUrl ? (
          <div className="relative mx-auto mt-6 h-96 w-96 max-w-full">
            <Image
              src={identity.serviceArea.imageUrl}
              alt={identity.serviceArea.imageAlt}
              fill
              className="object-contain"
              sizes="(min-width: 768px) 384px, 90vw"
            />
          </div>
        ) : null}
      </Section>
    </main>
  );
}
