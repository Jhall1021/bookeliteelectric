import Image from "next/image";
import Link from "next/link";
import { ServiceIcon } from "@/components/shared/Icons";
import { getServiceImage } from "@/lib/serviceImages";

const TRUST_ITEMS = [
  { label: "Upfront Flat-Rate Pricing" },
  { label: "Licensed & Insured" },
  { label: "Narrow Arrival Windows" },
  { label: "Professional Electricians" },
  { label: "No Surprise Pricing" },
  { label: "All Major Credit Cards Accepted" },
];

// A representative slice — the real Home page pulls "most popular" from the
// database (booking counts), this is the Phase 1 static placeholder.
// Prices below re-synced against the live seed data (several had drifted
// out of date from earlier repricing work, since this static list isn't
// database-driven and never picks up pricing changes automatically).
const POPULAR_SERVICES = [
  { name: "Outlet Replacement", from: "$225", slug: "replace-standard-outlet", icon: "outlet", href: "/services/outlets-switches/replace-standard-outlet" },
  { name: "Light Fixture Replacement", from: "$250", slug: "replace-interior-light-fixture", icon: "light", href: "/services/lighting/replace-interior-light-fixture" },
  { name: "Ceiling Fan Installation", from: "$375", slug: "replace-ceiling-fan", icon: "fan", href: "/services/fans/replace-ceiling-fan" },
  { name: "TV Mount Installation", from: "$500", slug: "tv-installation", icon: "tv", href: "/services/tv-media/tv-installation" },
  { name: "Recessed Lighting", from: "$375", slug: "recessed-lighting", icon: "recessed", href: "/services/lighting/recessed-lighting" },
  { name: "EV Charger Installation", from: "$1,295", slug: "level-2-ev-charger", icon: "ev", href: "/services/ev-garage/level-2-ev-charger" },
];

export default function HomePage() {
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
            <p className="mt-2 text-sm text-white/60">
              Your first service includes our visit — everything you add after that costs less,
              because we're already there.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
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

            <ul className="mt-10 grid grid-cols-2 gap-x-6 gap-y-3 text-sm text-slate-light">
              {TRUST_ITEMS.map((item) => (
                <li key={item.label} className="flex items-center gap-2">
                  <span className="text-success">✓</span>
                  {item.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative aspect-[4/3] overflow-hidden rounded-card">
            <Image
              src="/images/hero-kitchen.png"
              alt="An Elite Electric & Lighting technician reviewing a job on a tablet in a client's kitchen"
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
          One visit fee, not one per job. Here's exactly how that plays out.
        </p>

        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          <div className="rounded-card border border-cardline bg-white p-6 shadow-card">
            <div className="ray-accent flex h-10 w-10 items-center justify-center rounded-full bg-electric text-sm font-bold text-white">
              1
            </div>
            <h3 className="mt-4 font-display text-base font-bold text-navy">Pick your first service</h3>
            <p className="mt-2 text-sm text-slate">
              Its price covers our visit to your home — the technician, the truck, the trip.
              That fee only gets charged once per visit.
            </p>
          </div>

          <div className="rounded-card border border-cardline bg-white p-6 shadow-card">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-electric text-sm font-bold text-white">
              2
            </div>
            <h3 className="mt-4 font-display text-base font-bold text-navy">Add anything else, cheaper</h3>
            <p className="mt-2 text-sm text-slate">
              Since we're already at your house, every additional service you add is priced
              lower — no second visit fee tacked on.
            </p>
          </div>

          <div className="rounded-card border border-cardline bg-white p-6 shadow-card">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-electric text-sm font-bold text-white">
              3
            </div>
            <h3 className="mt-4 font-display text-base font-bold text-navy">One total, no surprises</h3>
            <p className="mt-2 text-sm text-slate">
              See the full price for everything before you book — not after we're standing in
              your kitchen.
            </p>
          </div>
        </div>
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
          {POPULAR_SERVICES.map((svc) => {
            const image = getServiceImage(svc.slug);
            return (
              <Link
                key={svc.href}
                href={svc.href}
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
                  <div className="text-sm font-semibold text-navy">{svc.name}</div>
                  <div className="mt-1 text-sm text-slate">From {svc.from}</div>
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
