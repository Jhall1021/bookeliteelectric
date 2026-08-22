import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/flow-types";
import { ServiceIcon } from "@/components/shared/Icons";
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
const DIFFERENTIATORS = [
  "Upfront flat-rate pricing",
  "Lower same-visit prices",
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
  { label: "Additional services", price: "Lower same-visit price", muted: true },
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

export default async function HomePage() {
  // Live prices, so a repricing reaches the homepage without anyone
  // remembering to edit this file.
  const featured = await prisma.service.findMany({
    where: { slug: { in: FEATURED.map((f) => f.slug) }, active: true },
    select: {
      slug: true,
      name: true,
      basePrice: true,
      startingPriceLabel: true,
      category: { select: { slug: true } },
    },
  });
  const bySlug = new Map(featured.map((s) => [s.slug, s]));

  return (
    <main>
      {/* Hero */}
      <section className="bg-navy text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-2 md:items-center">
          <div>
            <h1 className="font-display text-4xl font-bold leading-tight md:text-5xl">
              Skip the Estimate. Know Your Price.
            </h1>
            <p className="mt-4 text-lg text-slate-light">
              See your price. Pick your time.
            </p>

            {/* The same-visit callout.
                Warm card against the navy so it reads as a distinct object
                rather than more hero copy — the one place on this page where
                the palette inverts, which is what earns it attention without
                a badge or a starburst.
                Deliberately compact: it's a benefit callout, not a second
                content section, and the headline and CTA have to stay the
                dominant things above the fold. */}
            {/* max-w matches the CTA row beneath it — roughly the width of
                "Book Your Service" and "I Don't Know What's Wrong" side by
                side with their gap. Capped rather than fixed, so on a narrow
                column both this and the buttons fall back to full width
                together and stay aligned. */}
            <div className="mt-6 max-w-[30rem] overflow-hidden rounded-card bg-warmwhite text-navy shadow-card">
              <div className="px-5 pt-3.5">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-electric">
                  Add more &amp; save
                </div>
                <p className="mt-1 font-display text-base font-bold leading-snug">
                  Lower prices on every additional service.
                </p>
                <p className="mt-1 text-[13px] leading-snug text-slate">
                  Book your first service at the regular price. Add more work to the same
                  visit and each additional service is priced lower because we&rsquo;re
                  already there.
                </p>
              </div>

              <div className="mt-2.5 divide-y divide-cardline border-t border-cardline">
                {PRICING_LADDER.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-4 px-5 py-1.5"
                  >
                    <span className="text-[13px] text-navy">{row.label}</span>
                    <span
                      className={`text-[13px] font-semibold ${
                        row.muted ? "text-success" : "text-navy"
                      }`}
                    >
                      {row.price}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex max-w-[30rem] flex-wrap gap-3">
              <Link
                href="/services"
                className="ray-accent rounded-pill bg-electric px-7 py-3.5 text-base font-semibold text-white transition hover:bg-electric-hover"
              >
                Book Your Service
              </Link>
              <Link
                href="/troubleshooting"
                className="rounded-pill border border-white/30 px-7 py-3.5 text-base font-semibold text-white transition hover:bg-white/10"
              >
                I Don&rsquo;t Know What&rsquo;s Wrong
              </Link>
            </div>

            <ul className="mt-8 grid gap-2 text-sm text-slate-light sm:grid-cols-3">
              {DIFFERENTIATORS.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-0.5 text-success">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative aspect-[4/3] overflow-hidden rounded-card">
            <Image
              src="/images/hero-kitchen.jpg"
              alt="An Elite Electric &amp; Lighting technician showing a homeowner a quote on a tablet in her kitchen"
              fill
              priority
              className="object-cover"
              sizes="(min-width: 768px) 50vw, 100vw"
            />
          </div>
        </div>
      </section>

      {/* How pricing works */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-display text-2xl font-bold text-navy">How Our Pricing Works</h2>
        <p className="mt-2 max-w-2xl text-slate">
          Getting an electrician to your door is most of what a small job costs. Once
          we&rsquo;re there, everything else is cheaper — so we price it that way.
        </p>

        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          <div className="rounded-card border border-cardline bg-white p-6 shadow-card">
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
              Its price is the full price, and it covers getting a licensed electrician to
              your home. You see that number before you book.
            </p>
          </div>

          <div className="rounded-card border border-cardline bg-white p-6 shadow-card">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-electric text-sm font-bold text-white">
              2
            </div>
            <h3 className="mt-4 font-display text-base font-bold text-navy">
              Add anything else for less
            </h3>
            <p className="mt-2 text-sm text-slate">
              A second outlet, a fan, a few more lights — priced lower than booking them on
              their own, because the trip is already paid for. You see each price as you add
              it.
            </p>
          </div>

          <div className="rounded-card border border-cardline bg-white p-6 shadow-card">
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
          </div>
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
      </section>

      {/* Payment options */}
      <section className="border-t border-cardline bg-warmwhite py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-2xl font-bold text-navy">Flexible Payment Options</h2>
          <p className="mt-2 max-w-2xl text-slate">
            Pay however works best for you — all at the same upfront price you saw when you
            booked.
          </p>

          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div className="rounded-card border border-cardline bg-white p-6 shadow-card">
              <h3 className="font-display text-base font-bold text-navy">All Major Credit Cards</h3>
              <p className="mt-2 text-sm text-slate">
                Visa, Mastercard, American Express, and Discover — pay with the card already in
                your wallet.
              </p>
            </div>

            <div className="rounded-card border border-cardline bg-white p-6 shadow-card">
              <h3 className="font-display text-base font-bold text-navy">Pay Over Time</h3>
              <p className="mt-2 text-sm text-slate">
                Split larger jobs into monthly payments through Affirm, with rates shown upfront
                before you commit — no surprises, same as our pricing.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Popular services */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-display text-2xl font-bold text-navy">Most Popular Services</h2>
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {FEATURED.map((svc) => {
            const live = bySlug.get(svc.slug);
            // A featured service that's been deactivated shouldn't leave a
            // dead card on the homepage.
            if (!live) return null;
            const image = getServiceImage(svc.slug);
            const href = `/services/${live.category?.slug ?? svc.category}/${svc.slug}`;
            return (
              <Link
                key={svc.slug}
                href={href}
                className="overflow-hidden rounded-card border border-cardline bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                {/* This grid deliberately locks every card to 4/3 rather than
                    using each image's native aspectRatio from SERVICE_IMAGES.
                    Six cards sitting side by side need a uniform height, and
                    the source photos range from about 0.87 to 1.78 — letting
                    them vary made the row ragged. object-cover center-crops to
                    fit. The icon fallback matches the same 4/3 box so a service
                    without a photo doesn't render a shorter card than its
                    neighbors (it previously used aspect-square).

                    ServiceIntro still honors each image's native aspectRatio —
                    that screen has the room, and preserving the provided crop
                    is the whole reason the field exists. Only this grid is
                    constrained. */}
                {image ? (
                  <div className="relative aspect-[4/3] w-full">
                    <Image
                      src={image.src}
                      alt={image.alt}
                      fill
                      className="object-cover"
                      sizes="(min-width: 1024px) 180px, (min-width: 768px) 30vw, 45vw"
                    />
                  </div>
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center bg-warmwhite">
                    <ServiceIcon icon={svc.icon} className="h-10 w-10 text-electric" />
                  </div>
                )}
                <div className="p-4">
                  {/* The short marketing label, not the catalog name — "TV
                      Mount Installation" reads better on a tile than
                      "Professional TV Installation". */}
                  <div className="text-sm font-semibold text-navy">{svc.label}</div>
                  <div className="mt-1 text-sm text-slate">
                    {live.basePrice
                      ? `From ${formatCents(live.basePrice)}`
                      : live.startingPriceLabel ?? "Custom Quote"}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Service area */}
      <section className="border-t border-cardline bg-white py-16 text-center">
        <h2 className="font-display text-2xl font-bold text-navy">
          Proudly Serving Monmouth &amp; Ocean Counties, NJ
        </h2>
        <div className="relative mx-auto mt-6 h-96 w-96 max-w-full">
          <Image
            src="/images/nj-service-area-map.png"
            alt="Map of New Jersey with Monmouth and Ocean counties highlighted as our service area"
            fill
            className="object-contain"
            sizes="(min-width: 768px) 384px, 90vw"
          />
        </div>
      </section>
    </main>
  );
}
