import Image from "next/image";
import Link from "next/link";
import { ServiceIcon } from "@/components/shared/Icons";

const TRUST_ITEMS = [
  { label: "Upfront Flat-Rate Pricing" },
  { label: "Licensed & Insured" },
  { label: "3-Hour Arrival Windows" },
  { label: "Professional Electricians" },
  { label: "No Surprise Pricing" },
];

// A representative slice — the real Home page pulls "most popular" from the
// database (booking counts), this is the Phase 1 static placeholder.
const POPULAR_SERVICES = [
  { name: "Outlet Replacement", from: "$225", href: "/services/outlets-switches/replace-standard-outlet" },
  { name: "Light Fixture Replacement", from: "$295", href: "/services/lighting/replace-interior-light-fixture" },
  { name: "Ceiling Fan Installation", from: "$395", href: "/services/fans/replace-ceiling-fan" },
  { name: "TV Mount Installation", from: "$495", href: "/services/tv-media/tv-install-up-to-55" },
  { name: "Recessed Lighting", from: "$995", href: "/services/lighting/recessed-lighting-4" },
  { name: "EV Charger Installation", from: "$1,295", href: "/services/ev-garage/level-2-ev-charger" },
];

export default function HomePage() {
  return (
    <main>
      {/* Hero */}
      <section className="bg-navy text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-2 md:items-center">
          <div>
            <h1 className="font-display text-4xl font-bold leading-tight md:text-5xl">
              The easier way to hire an electrician.
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

          {/* PLACEHOLDER — swap for real photography before launch (kitchens,
              living rooms, a technician at work, per the brief). Using one
              of the site's own icons here rather than a flat color block so
              this doesn't read as a broken image while real photos are sourced. */}
          <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-navy-light" aria-hidden>
            <div className="absolute inset-0 flex items-center justify-center opacity-20">
              <ServiceIcon icon="light" className="h-32 w-32 text-white" />
            </div>
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

      {/* Popular services */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-display text-2xl font-bold text-navy">Most Popular Services</h2>
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {POPULAR_SERVICES.map((svc) => (
            <Link
              key={svc.href}
              href={svc.href}
              className="rounded-card border border-cardline bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="text-sm font-semibold text-navy">{svc.name}</div>
              <div className="mt-1 text-sm text-slate">From {svc.from}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Service area */}
      <section className="border-t border-cardline bg-white py-16 text-center">
        <h2 className="font-display text-2xl font-bold text-navy">
          Proudly Serving Monmouth &amp; Ocean Counties, NJ
        </h2>
        <p className="mt-2 text-slate">...and nearby communities.</p>
      </section>

      {/* Footer */}
      <footer className="bg-charcoal py-12 text-white">
        <div className="mx-auto max-w-6xl px-6 text-sm text-white/70">
          <Image src="/images/elite-logo.png" alt="Elite Electric & Lighting" width={36} height={36} className="mb-4 invert" />
          © {new Date().getFullYear()} Elite Electric &amp; Lighting. All rights reserved.
        </div>
      </footer>
    </main>
  );
}
